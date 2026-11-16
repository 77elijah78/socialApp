/* eslint-disable react-hooks/globals -- Test probes intentionally expose mounted hook results to assertions. */
// Story creator journey: pick → preview → replace/remove → publish progress,
// duplicate-submit guard, failure recovery and the confirmed-refresh event.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, deferred } = require("../messaging/harness.cjs");

let auth = { user: { id: "me" }, token: "token" };
const calls = [];
let pickedAsset;
let uploadHandler;
let postHandler;
const dialogs = [];
let backCount = 0;

mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
mock("@/services/AppDialogService", {
  showAppDialog: (options) => dialogs.push(options),
});
mock("@/hooks/useImagePicker", {
  pickFromLibrary: async () => pickedAsset,
  captureMedia: async () => pickedAsset,
  createUploadFormData: (uri) => ({ uri }),
  getAssetMimeType: () => "image/jpeg",
});
mock("@/services/api", {
  api: {
    upload: (path, form, token, onProgress) => {
      calls.push({ method: "UPLOAD", path, form });
      onProgress?.(55);
      return uploadHandler(path, form);
    },
    post: (path, body, token) => {
      calls.push({ method: "POST", path, body, token });
      return postHandler(path, body);
    },
  },
});
mock("expo-video", {
  VideoView: "VideoView",
  useVideoPlayer: () => ({}),
});
mock("expo-router", {
  router: {
    back() {
      backCount += 1;
    },
    push() {},
    navigate() {},
  },
});

// The shared harness omits this host component; the creator imports it from RN.
const native = require("react-native");
native.KeyboardAvoidingView = "KeyboardAvoidingView";
const CreateStoryScreen = require("../../src/components/stories/CreateStoryScreen.tsx").default;
const { subscribeStoryCreated } = require("../../src/utils/storyUpdates.ts");

let renderer;
const mount = async () => {
  await act(async () => {
    renderer = create(React.createElement(CreateStoryScreen));
  });
};
const findByLabel = (label) =>
  renderer.root.findAll(
    (node) =>
      node.props?.accessibilityLabel === label &&
      typeof node.props?.onPress === "function",
  )[0];
const texts = () =>
  renderer.root
    .findAllByType("Text")
    .map((node) => [].concat(node.props.children).filter((part) => typeof part === "string").join(""));

beforeEach(() => {
  calls.length = 0;
  dialogs.length = 0;
  backCount = 0;
  pickedAsset = {
    uri: "file:///story.jpg",
    type: "image",
    mimeType: "image/jpeg",
    width: 1080,
    height: 1920,
  };
  uploadHandler = async () => ({ data: { url: "https://cdn.test/story.jpg" } });
  postHandler = async () => ({ success: true, data: { id: "story-1" } });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("story creator requires media, then previews, replaces and removes it", async () => {
  await mount();
  assert.ok(texts().includes("Start with a moment"));
  assert.equal(findByLabel("Publish story").props.disabled, true);
  await act(async () => findByLabel("Choose from library").props.onPress());
  assert.ok(texts().includes("Photo story"));
  assert.equal(findByLabel("Publish story").props.disabled, false);
  await act(async () => findByLabel("Remove story media").props.onPress());
  assert.ok(texts().includes("Start with a moment"));
  assert.equal(findByLabel("Publish story").props.disabled, true);
});

test("publishing uploads once, posts the story and fires the confirmed refresh event", async () => {
  let refreshed = 0;
  const unsubscribe = subscribeStoryCreated(() => {
    refreshed += 1;
  });
  await mount();
  await act(async () => findByLabel("Choose from library").props.onPress());
  await act(async () => findByLabel("Publish story").props.onPress());
  assert.equal(
    calls.filter((call) => call.method === "UPLOAD").length,
    1,
  );
  const post = calls.find((call) => call.method === "POST");
  assert.equal(post.path, "/posts/stories");
  assert.deepEqual(post.body, {
    mediaUrl: "https://cdn.test/story.jpg",
    mediaType: "image",
    caption: undefined,
  });
  assert.equal(refreshed, 1);
  assert.equal(dialogs.at(-1).title, "Story shared");
  unsubscribe();
});

test("a double tap cannot submit twice while the first publish is in flight", async () => {
  const pending = deferred();
  postHandler = () => pending.promise;
  await mount();
  await act(async () => findByLabel("Choose from library").props.onPress());
  await act(async () => {
    const publish = findByLabel("Publish story");
    publish.props.onPress();
    publish.props.onPress();
  });
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(calls.filter((call) => call.method === "UPLOAD").length, 1);
  await act(async () => {
    pending.resolve({ success: true });
  });
});

test("a failed publish surfaces the real error, keeps the selected media and can retry", async () => {
  postHandler = async () => {
    throw new Error("Story upload failed");
  };
  await mount();
  await act(async () => findByLabel("Choose from library").props.onPress());
  await act(async () => findByLabel("Publish story").props.onPress());
  assert.equal(dialogs.at(-1).tone, "error");
  assert.ok(texts().some((text) => text.includes("Story upload failed")));
  assert.ok(texts().includes("Photo story"), "media is preserved");
  assert.equal(findByLabel("Publish story").props.disabled, false);

  postHandler = async () => ({ success: true });
  await act(async () => findByLabel("Publish story").props.onPress());
  assert.equal(calls.filter((call) => call.method === "POST").length, 2);
  assert.equal(dialogs.at(-1).title, "Story shared");
});
