/* global __dirname */
// Frontend/transport contract regressions. XHR and fetch below are test doubles,
// not the deployed API or physical Android media/permission/codec verification.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { deferred, settle } = require("./harness.cjs");
const {
  normalizeMediaUrl,
  requireRemoteMediaUrl,
  displayMediaUrl,
} = require("../../src/utils/mediaUrls.ts");
const { parseApiOrigin, isPrivateHost } = require("../../src/config/api.ts");
const { mediaFileForUpload } = require("../../src/utils/mediaUpload.ts");
const {
  normalizeRemoteMessage,
} = require("../../src/utils/messaging/serialization.ts");
const {
  api,
  setTokens,
  uploadMultipart,
  setTokenRefreshCallback,
} = require("../../src/services/api.ts");
const { MediaUploader } = require("../../src/services/MediaUploader.ts");
const ImageMessage =
  require("../../src/components/messages/ImageMessage.tsx").default;
const ORIGIN = "https://api.test";
const originalXHR = global.XMLHttpRequest;
const originalFormData = global.FormData;
class Multipart {
  _parts = [];
  append(name, value) {
    this._parts.push([name, value]);
  }
}
let transfers, respond, renderer;
class XHR {
  upload = {};
  headers = {};
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name, value) {
    this.headers[name] = value;
  }
  send(body) {
    this.body = body;
    transfers.push(this);
    respond(this);
  }
  complete(status, body) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload();
  }
}
beforeEach(() => {
  global.XMLHttpRequest = XHR;
  global.FormData = Multipart;
  transfers = [];
  setTokens("access", "refresh");
  setTokenRefreshCallback(null);
  respond = (xhr) =>
    queueMicrotask(() =>
      xhr.complete(201, {
        success: true,
        data: {
          url: "http://localhost:3000/uploads/images/file.jpg",
          mimeType: "image/jpeg",
          size: 42,
        },
      }),
    );
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  global.XMLHttpRequest = originalXHR;
  global.FormData = originalFormData;
  setTokenRefreshCallback(null);
});

test("one origin accepts optional legacy /api/v1 configuration without a duplicate API prefix or fallback", () => {
  for (const input of [
    ORIGIN,
    `${ORIGIN}/`,
    `${ORIGIN}/api/v1`,
    `${ORIGIN}/api/v1/`,
  ])
    assert.equal(parseApiOrigin(input), ORIGIN);
  for (const input of [
    undefined,
    "",
    "file:///x",
    "ftp://host",
    "https://u:p@host",
    `${ORIGIN}/wrong`,
    `${ORIGIN}?secret=x`,
  ])
    assert.equal(parseApiOrigin(input), "");
  for (const host of [
    "localhost",
    "127.0.0.1",
    "192.168.0.2",
    "10.0.2.2",
    "172.16.4.1",
    "169.254.1.1",
    "[::1]",
    "fe81::1",
    "fd00::1",
    "[::ffff:7f00:1]",
  ])
    assert.equal(isPrivateHost(host), true, host);
  for (const host of ["api.test", "172.32.0.1", "8.8.8.8"])
    assert.equal(isPrivateHost(host), false, host);
});

test("only verified owned upload paths are rebased; signed/CDN URLs remain byte-for-byte intact", () => {
  for (const prefix of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.1.3:3000",
    "http://api.test:3000",
    "",
  ]) {
    assert.equal(
      normalizeMediaUrl(
        `${prefix}/uploads/videos/a.mp4?token=a%2Bb&x=1`,
        ORIGIN,
      ),
      `${ORIGIN}/uploads/videos/a.mp4?token=a%2Bb&x=1`,
    );
  }
  assert.equal(
    normalizeMediaUrl("uploads/audio/a.m4a", ORIGIN),
    `${ORIGIN}/uploads/audio/a.m4a`,
  );
  const signed = "https://cdn.test/a%2Fb.JPG?X-Signature=a%2Bb%3D&x=1&x=2";
  assert.equal(normalizeMediaUrl(signed, ORIGIN), signed);
  assert.equal(
    normalizeMediaUrl("http://cdn.test/legacy.mp4", ORIGIN),
    "http://cdn.test/legacy.mp4",
    "do not guess that an arbitrary HTTP CDN supports HTTPS",
  );
});

test("remote boundaries reject local schemes, unsafe unowned hosts, path traversal and credentials", () => {
  for (const value of [
    "file:///camera.jpg",
    "content://media/1",
    "ph://asset",
    "data:image/png,x",
    "blob:https://x/y",
    "javascript:x",
    "http://localhost/private/a",
    "http://10.2.2.2/files/a",
    "https://u:p@cdn.test/x",
    "/uploads/../secret",
    "/uploads/images/%2fsecret.jpg",
    "http://cdn.test/a\nb",
    "http://cdn.test/a\\b",
  ]) {
    assert.equal(normalizeMediaUrl(value, ORIGIN), null, value);
    assert.throws(
      () => requireRemoteMediaUrl(value, ORIGIN),
      /public media URL/,
    );
  }
  assert.equal(displayMediaUrl("file:///own.jpg", true), "file:///own.jpg");
  assert.equal(displayMediaUrl("file:///own.jpg", false), "");
});

for (const group of [false, true])
  test(`${group ? "group" : "DM"}: recipient normalization repairs legacy uploads and never stores sender-device URIs`, () => {
    const payload = {
      id: "message",
      conversationId: "room",
      senderId: "sender",
      type: "VIDEO",
      createdAt: "2026-10-31T00:00:00Z",
      mediaUrl: "http://localhost:3000/uploads/videos/a.mp4",
      thumbnailUrl: "file:///sender-only.jpg",
    };
    const row = normalizeRemoteMessage(payload, "recipient", group);
    assert.equal(row.mediaUrl, `${ORIGIN}/uploads/videos/a.mp4`);
    assert.equal(row.thumbnailUrl, null);
    assert.equal(
      row.duration,
      null,
      "do not invent duration missing from Kafka",
    );
    assert.equal(
      normalizeRemoteMessage(
        { ...payload, mediaUrl: "content://sender/1" },
        "recipient",
        group,
      ).mediaUrl,
      null,
    );
  });

test("file metadata survives multipart construction, including content-provider URIs with no useful extension", async () => {
  const file = mediaFileForUpload("content://provider/asset/123", {
    name: "actual.mov",
    mimeType: "video/quicktime",
    size: 120,
  });
  respond = (xhr) =>
    queueMicrotask(() =>
      xhr.complete(201, {
        success: true,
        data: {
          url: "http://localhost:3000/uploads/videos/actual.mov",
          mimeType: "video/quicktime",
          size: 120,
        },
      }),
    );
  const uploader = new MediaUploader(ORIGIN, "access");
  const result = await uploader.uploadFile(file);
  assert.deepEqual(transfers[0].body._parts, [["file", file]]);
  assert.equal(transfers[0].headers.Authorization, "Bearer access");
  assert.equal(transfers[0].timeout, 60_000);
  assert.equal(result.url, `${ORIGIN}/uploads/videos/actual.mov`);
  assert.throws(
    () => mediaFileForUpload("file:///x.heic", { mimeType: "image/heic" }),
    /does not support/,
  );
  assert.throws(
    () => mediaFileForUpload("file:///x.jpg", { size: 11 * 1024 * 1024 }),
    /10 MB/,
  );
});

test("authenticated upload retry preserves ALL file/extra parts and shares refresh single-flight", async () => {
  const refresh = deferred();
  let refreshes = 0;
  global.fetch = async () => {
    refreshes++;
    return refresh.promise;
  };
  respond = (xhr) =>
    queueMicrotask(() =>
      xhr.complete(xhr.headers.Authorization === "Bearer fresh" ? 201 : 401, {
        success: true,
        data: {},
      }),
    );
  const form = new Multipart();
  form.append("images", {
    uri: "file:///a.jpg",
    name: "a.jpg",
    type: "image/jpeg",
  });
  form.append("images", {
    uri: "file:///b.png",
    name: "b.png",
    type: "image/png",
  });
  form.append("caption", "real text");
  const a = uploadMultipart(
    `${ORIGIN}/api/v1/media/upload/images`,
    form,
    "access",
  );
  const b = uploadMultipart(
    `${ORIGIN}/api/v1/media/upload/images`,
    form,
    "access",
  );
  await settle();
  refresh.resolve({
    ok: true,
    json: async () => ({ data: { accessToken: "fresh" } }),
  });
  await Promise.all([a, b]);
  assert.equal(refreshes, 1);
  assert.equal(transfers.length, 4);
  for (const xhr of transfers) assert.deepEqual(xhr.body._parts, form._parts);
});

test("late upload success and old-account 401 cannot cross an authentication generation", async () => {
  respond = () => {};
  const work = uploadMultipart(
    `${ORIGIN}/api/v1/media/upload`,
    new Multipart(),
    "access",
  );
  const rejection = assert.rejects(work, /Authentication changed/);
  setTokens("account-b", "refresh-b");
  transfers[0].complete(201, { success: true });
  await rejection;
  let refreshes = 0;
  global.fetch = async () => {
    refreshes++;
    throw new Error("must not refresh");
  };
  const next = uploadMultipart(
    `${ORIGIN}/api/v1/media/upload`,
    new Multipart(),
    "account-b",
  );
  const old401 = assert.rejects(next, /401/);
  setTokens("account-c", "refresh-c");
  transfers[1].complete(401, {});
  await old401;
  assert.equal(refreshes, 0);
});

test("generic post/avatar uploads normalize their returned URL and expose failures instead of fake success", async () => {
  const form = new Multipart();
  form.append("avatar", {
    uri: "file:///a.jpg",
    name: "a.jpg",
    type: "image/jpeg",
  });
  assert.equal(
    (await api.upload("/media/upload/avatar", form)).data.url,
    `${ORIGIN}/uploads/images/file.jpg`,
  );
  respond = (xhr) =>
    queueMicrotask(() =>
      xhr.complete(200, { success: false, message: "Unsupported file type" }),
    );
  await assert.rejects(
    api.upload("/media/upload", form),
    /Unsupported file type/,
  );
});

test("upload timeout/network/abort errors propagate for a visible retry", async () => {
  for (const [event, message] of [
    ["ontimeout", /timed out/],
    ["onerror", /Network error/],
    ["onabort", /cancelled/],
  ]) {
    respond = (xhr) => queueMicrotask(() => xhr[event]());
    await assert.rejects(
      uploadMultipart(`${ORIGIN}/api/v1/media/upload`, new Multipart()),
      message,
    );
  }
});

test("image bubble loads the original; thumbnail is only a placeholder and retry still targets the full image", async () => {
  await act(async () => {
    renderer = create(
      React.createElement(ImageMessage, {
        uri: `${ORIGIN}/full.jpg`,
        thumbnail: `${ORIGIN}/small.jpg`,
        name: "Alice",
        maxWidth: 300,
      }),
    );
  });
  let image = renderer.root.findByType("ExpoImage");
  assert.equal(image.props.source.uri, `${ORIGIN}/full.jpg`);
  assert.equal(image.props.placeholder.uri, `${ORIGIN}/small.jpg`);
  await act(async () => image.props.onError());
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Retry photo" })
      .props.onPress(),
  );
  image = renderer.root.findByType("ExpoImage");
  assert.equal(image.props.source.uri, `${ORIGIN}/full.jpg`);
});

test("native picker failures and denied library access surface real errors without sending, and retry retains a usable selector", async () => {
  const { mock } = require("./harness.cjs");
  const Module = require("node:module");
  const dialogs = [];
  let granted = true, fail = true, launches = 0, sent = 0;
  mock("@/services/AppDialogService", { showAppDialog: value => dialogs.push(value) });
  mock("expo-image-picker", {
    MediaTypeOptions: { Images: "images", Videos: "videos" },
    requestMediaLibraryPermissionsAsync: async () => ({ granted }),
    launchImageLibraryAsync: async () => {
      launches++;
      if (fail) throw new Error("Native picker unavailable");
      return { canceled: false, assets: [{ uri: "file:///selected.jpg", fileName: "selected.jpg", mimeType: "image/jpeg", fileSize: 42 }] };
    },
  });
  mock("expo-document-picker", { getDocumentAsync: async () => ({ canceled: true }) });
  // The room harness substitutes this modal. Compile the real TSX with the same
  // registered TS loader here so native-boundary doubles do not replace its UI.
  const filename = require("node:path").resolve(__dirname, "../../src/components/messages/MediaPickerModal.tsx");
  const actual = new Module(filename, module); actual.paths = module.paths;
  Module._extensions[".tsx"](actual, filename);
  await act(async () => { renderer = create(React.createElement(actual.exports.default, { visible: true, onClose() {}, onSend() { sent++; } })); });
  const choosePhotos = () => renderer.root.findAllByType("Text").find(node => node.props.children === "Photos").parent.props.onPress();
  await act(async () => { choosePhotos(); await settle(); });
  assert.equal(dialogs.at(-1).message, "Native picker unavailable");
  assert.equal(sent, 0);
  granted = false;
  await act(async () => { choosePhotos(); await settle(); });
  assert.equal(launches, 1, "denial does not launch the native picker");
  assert.equal(dialogs.at(-1).title, "Photo library access needed");
  granted = true; fail = false;
  await act(async () => { choosePhotos(); await settle(); });
  assert.equal(renderer.root.findByType("FlatList").props.data[0].name, "selected.jpg");
  assert.equal(sent, 0, "picking is not a pretend successful send");
});
