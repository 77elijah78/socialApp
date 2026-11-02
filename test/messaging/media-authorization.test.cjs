// Native renderer/player/file doubles exercise the real frontend loaders and
// HTTP refresh client. These are not a deployed-backend or physical-device test.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { Buffer } = require("node:buffer");
const { act, create } = require("react-test-renderer");
const { mock, fileSystem, files, deferred, settle, appState } = require("./harness.cjs");
const auth = require("../../src/services/api.ts");
const { mediaRequestSource, mediaHttpStatus, mediaTokenExpired } = require("../../src/utils/mediaRequests.ts");
const { DocumentDownloads, documentDownloads, documentKey } = require("../../src/services/DocumentDownloads.ts");
const { setVisibleMedia, clearVisibleMedia } = require("../../src/utils/messaging/mediaVisibility.ts");
const { shareMediaFile } = require("../../src/services/MediaSharing.ts");
const nativeFetch = global.fetch;
const originalDownload = fileSystem.createDownloadResumable;
const listeners = new Set(), roots = [], visibilityOwner = Symbol("auth-media");
let identity, players, requests, transfers, shares, downloadStatuses, videoFailures, videoGates, audioFailures, audioGates, fetchResponse, params, menus;
const owned = (path = "images/private.jpg") => `https://api.test/uploads/${path}`;
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => data });
function publishIdentity(ownerId, token, refreshToken = "refresh-A") {
  identity = { auth: { user: ownerId ? { id: ownerId } : null, token } };
  auth.setTokens(token, refreshToken);
  listeners.forEach(listener => listener());
}
mock("@/store/hooks", {
  useAppSelector: selector => React.useSyncExternalStore(callback => {
    listeners.add(callback); return () => listeners.delete(callback);
  }, () => selector(identity)),
});
mock("expo-router", {
  router: { back() {}, push() {} },
  useLocalSearchParams: () => params,
  useFocusEffect: callback => React.useEffect(callback, [callback]),
});
mock("expo-status-bar", { StatusBar: "ExpoStatusBar" });
mock("expo-screen-orientation", { OrientationLock: { LANDSCAPE: 6 }, getOrientationLockAsync: async () => 3, lockAsync: async () => {} });
mock("expo-sharing", { isAvailableAsync: async () => true, shareAsync: async (...args) => { shares.push(args); } });
mock("@/providers/OverlayProvider", { useOverlay: () => ({ openActionMenu: items => menus.push(items), openShare() {} }) });
function usePlayer(kind) {
  const value = React.useMemo(() => {
    const subscribers = new Set(), handlers = new Map();
    const player = {
      kind, status: "idle", playing: false, plays: 0, released: false, replaces: [],
      duration: 8, currentTime: 0,
      events: { statusChange: { status: "idle" } },
      snapshot: { currentTime: 0, duration: 8, playing: false, isLoaded: false, error: null, playbackState: "idle" },
      subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); },
      update(patch) { this.snapshot = { ...this.snapshot, ...patch }; subscribers.forEach(fn => fn()); },
      emit(name, event) {
        this.events[name] = event;
        for (const handler of handlers.get(name) ?? []) handler(event);
        subscribers.forEach(fn => fn());
      },
      addListener(name, callback) {
        const group = handlers.get(name) ?? new Set(); group.add(callback); handlers.set(name, group);
        return { remove: () => group.delete(callback) };
      },
      play() { assert.equal(this.released, false); this.plays++; this.playing = true; this.update({ playing: true }); },
      pause() { this.playing = false; this.update({ playing: false }); },
      async seekTo(time) { this.currentTime = time; this.update({ currentTime: time }); },
      replace(source) {
        this.replaces.push(source);
        const error = audioFailures.shift();
        if (error) { this.update({ error, playbackState: "error" }); return; }
        this.update({ isLoaded: true, error: null, playbackState: "readyToPlay" });
      },
      async replaceAsync(source) {
        this.replaces.push(source);
        const gate = videoGates.shift(); if (gate) await gate.promise;
        const error = videoFailures.shift();
        if (error) { this.status = "error"; this.emit("statusChange", { status: "error", error }); throw error; }
        this.status = "readyToPlay"; this.emit("statusChange", { status: "readyToPlay" });
      },
    };
    players.push(player); return player;
  }, [kind]);
  React.useEffect(() => () => { value.released = true; }, [value]);
  return value;
}
mock("expo-audio", {
  useAudioPlayer: () => usePlayer("audio"), setAudioModeAsync: async () => { const gate = audioGates.shift(); if (gate) await gate.promise; },
  useAudioPlayerStatus: player => React.useSyncExternalStore(player.subscribe, () => player.snapshot),
});
mock("expo-video", {
  useVideoPlayer: (source, setup) => { const player = usePlayer("video"); React.useEffect(() => setup?.(player), [player, setup]); return player; },
  VideoView: "VideoView",
});
mock("expo", { useEvent: (player, event) => React.useSyncExternalStore(player.subscribe, () => player.events[event]) });
const AuthenticatedImage = require("../../src/components/common/AuthenticatedImage.tsx").default;
const Photo = require("../../src/components/messages/ImageMessage.tsx").default;
const Reply = require("../../src/components/messages/ReplyPreview.tsx").default;
const Video = require("../../src/components/messages/Videoplayer.tsx").default;
const Voice = require("../../src/components/messages/VoiceMessage.tsx").default;
const SharedStory = require("../../src/components/messages/SharedStoryCard.tsx").default;
const StoryViewer = require("../../src/components/stories/StoryViewer.tsx").default;
const ImageViewer = require("../../src/app/(chatRoom)/imageViewer.tsx").default;
const Card = require("../../src/components/messages/MessageCard.tsx").default;
async function render(Component, props) {
  let root;
  await act(async () => { root = create(React.createElement(Component, props)); roots.push(root); await settle(); });
  return root;
}
async function tap(root, label) {
  await act(async () => { root.root.findByProps({ accessibilityLabel: label }).props.onPress(); await settle(); });
}
function backendStory(id, mediaType = "image") {
  return { id, userId: "author", mediaUrl: `http://192.168.1.4:3000/uploads/${mediaType.toLowerCase() === "video" ? "videos" : "images"}/${id}.${mediaType.toLowerCase() === "video" ? "mp4" : "jpg"}`,
    mediaType, caption: null, createdAt: "2026-10-31T12:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
    user: { id: "author", username: "author", displayName: "Author", avatarUrl: null }, views: [] };
}
function story(mediaType = "image") {
  return { id: "story", userId: "author", username: "author", displayName: "Author", avatarUrl: null,
    mediaUrl: owned(mediaType === "video" ? "videos/story.mp4" : "images/story.jpg"), mediaType,
    caption: null, createdAt: new Date(), expiresAt: new Date("2099-01-01"), isViewed: true, viewsCount: 0 };
}
beforeEach(async () => {
  players = []; requests = []; transfers = []; shares = []; menus = []; downloadStatuses = []; videoFailures = []; videoGates = []; audioFailures = []; audioGates = []; params = {};
  appState.currentState = "active"; files.clear();
  publishIdentity("account-A", "access-A");
  auth.setTokenRefreshCallback((token, refresh) => publishIdentity(identity.auth.user.id, token, refresh));
  fetchResponse = async url => response(url.endsWith("/auth/refresh") ? { data: { accessToken: "access-fresh", refreshToken: "refresh-fresh" } } : { data: [] });
  global.fetch = async (url, options) => { requests.push({ url, options }); return fetchResponse(url, options); };
  fileSystem.createDownloadResumable = (url, localUri, options, progress) => {
    transfers.push({ url, localUri, options });
    return { pauseAsync: async () => {}, downloadAsync: async () => {
      const status = downloadStatuses.shift() ?? 200;
      if (status instanceof Error) throw status;
      progress?.({ totalBytesWritten: 12, totalBytesExpectedToWrite: 12 });
      files.set(localUri, { exists: true, size: 12, isDirectory: false, uri: localUri });
      return { status, uri: localUri };
    } };
  };
  await documentDownloads.clear();
});
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); await settle(); });
  clearVisibleMedia(visibilityOwner); await documentDownloads.clear();
  fileSystem.createDownloadResumable = originalDownload; global.fetch = nativeFetch;
  auth.setTokenRefreshCallback(null); auth.setTokens(null, null);
});

test("credentials go only to the configured uploads origin; external signed/local/public sources are preserved", () => {
  const inputs = ["/uploads/images/photo.jpg", "uploads/videos/clip.mp4", "http://192.168.1.4:3000/uploads/audio/voice.m4a"];
  for (const input of inputs) assert.equal(mediaRequestSource(input, "secret").headers.Authorization, "Bearer secret");
  for (const input of ["https://cdn.test/uploads/images/a.jpg?X-Signature=a%2Fb%2B&x=2", "https://api.test.evil/uploads/images/a.jpg", "https://api.test/avatars/a.jpg", "file:///private/a.jpg", "content://provider/1", "ph://asset/1", "blob:https://app.test/a"]) {
    const source = mediaRequestSource(input, "secret"); assert.equal(source.uri, input); assert.equal(source.headers, undefined); assert.equal(source.uri.includes("secret"), false);
  }
  for (const input of ["https://user:pass@api.test/uploads/images/a.jpg", "javascript:alert(1)", "https://api.test/uploads/images/a.jpg\\bad"]) {
    assert.deepEqual(mediaRequestSource(input, "secret"), { uri: "" });
  }
  assert.equal(mediaRequestSource(owned(), null).headers, undefined);
});
test("native HTTP classification is bounded, recognizes real status formats and rejects arbitrary URI/codec digits", () => {
  for (const error of [{ status: 401 }, { nativeEvent: { error: "HTTP 403 Forbidden" } }, new Error("Response code: 403"), { error: "HttpException: statusCode: 403" }]) assert.ok(mediaHttpStatus(error));
  const cycle = {}; cycle.nativeEvent = { error: cycle };
  assert.equal(mediaHttpStatus(cycle), null);
  for (const error of ["https://api.test/uploads/images/403.jpg", "decoder error 401", "Source error", "status 404", null]) assert.equal(mediaHttpStatus(error), null);
  const jwt = exp => `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
  assert.equal(mediaTokenExpired(jwt(1)), true); assert.equal(mediaTokenExpired(jwt(9e9)), false);
  for (const token of ["opaque", "x.%%%%.y", "x.bnVsbA.y"]) assert.equal(mediaTokenExpired(token), false);
});
test("chat photo and private thumbnail carry Bearer with account/session memory-only cache identity", async () => {
  const root = await render(Photo, { uri: owned(), thumbnail: owned("images/thumb.jpg"), maxWidth: 280, name: "Sender" });
  const image = root.root.findByType("ExpoImage").props;
  assert.equal(image.source.headers.Authorization, "Bearer access-A"); assert.equal(image.placeholder.headers.Authorization, "Bearer access-A");
  assert.equal(image.cachePolicy, "memory"); assert.match(image.source.cacheKey, /account-A/); assert.doesNotMatch(image.source.cacheKey, /access-A/);
  assert.equal(image.contentFit, "contain");
});
test("a private placeholder cannot opt into disk caching through an external main image", async () => {
  const root = await render(AuthenticatedImage, { uri: "https://cdn.test/public.jpg", placeholderUri: owned(), cachePolicy: "memory-disk" });
  const image = root.root.findByType("ExpoImage").props;
  assert.equal(image.source.headers, undefined); assert.equal(image.placeholder.headers.Authorization, "Bearer access-A"); assert.equal(image.cachePolicy, "memory");
});
test("reply photo thumbnails, shared story images and full-screen photos all authenticate native GETs", async () => {
  const reply = await render(Reply, { userId: "account-A", message: { id: "reply", senderId: "other", type: "IMAGE", content: "Photo", mediaUrl: owned(), sender: { displayName: "Other" } } });
  assert.equal(reply.root.findByType("ExpoImage").props.source.headers.Authorization, "Bearer access-A");
  const shared = await render(SharedStory, { mediaUrl: owned(), mediaType: "image", caption: null, authorName: "Other", authorAvatarUrl: null });
  assert.equal(shared.root.findByType("ExpoImage").props.source.headers.Authorization, "Bearer access-A");
  params = { uri: owned(), name: "Other" };
  const viewer = await render(ImageViewer);
  assert.equal(viewer.root.findByType("ExpoImage").props.source.headers.Authorization, "Bearer access-A");
});
test("shared video stories use an explicit video preview, not an image GET of MP4 bytes", async () => {
  const root = await render(SharedStory, { mediaUrl: owned("videos/story.mp4"), mediaType: "VIDEO", caption: null, authorName: "Other", authorAvatarUrl: null });
  assert.equal(root.root.findAllByType("ExpoImage").length, 0);
  assert.ok(root.root.findAllByType("Text").some(node => node.children.includes("Video story · Tap to watch")));
});
test("chat video stays lazy, authenticates the actual player source and disables private disk caching", async () => {
  setVisibleMedia(visibilityOwner, ["video"]);
  const root = await render(Video, { uri: owned("videos/clip.mp4"), thumbnail: owned("images/poster.jpg"), playbackId: "video" });
  assert.equal(players.length, 0); assert.equal(root.root.findByType("ExpoImage").props.source.headers.Authorization, "Bearer access-A");
  await tap(root, "Play video");
  assert.equal(players[0].replaces[0].headers.Authorization, "Bearer access-A"); assert.equal(players[0].replaces[0].useCaching, false);
  assert.ok(players[0].plays); assert.equal(root.root.findByType("VideoView").props.nativeControls, true);
});
test("chat voice stays lazy and gives the actual audio source a Bearer header", async () => {
  setVisibleMedia(visibilityOwner, ["voice"]);
  const root = await render(Voice, { audioUri: owned("audio/voice.m4a"), playbackId: "voice", duration: 8 });
  assert.equal(players.length, 0); await tap(root, "Play voice message");
  assert.equal(players[0].replaces[0].headers.Authorization, "Bearer access-A"); assert.ok(players[0].plays);
});
for (const type of ["image", "video"]) test(`story ${type} authenticates its actual media source`, async () => {
  const root = await render(StoryViewer, { stories: [story(type)], onClose() {} });
  const source = type === "image" ? root.root.findByType("ExpoImage").props.source : players[0].replaces[0];
  assert.equal(source.headers.Authorization, "Bearer access-A");
  if (type === "video") assert.equal(source.useCaching, false);
  await act(async () => appState.change("background"));
  assert.equal(players.some(player => player.playing), false);
});
test("simultaneous private image 403s share one refresh, retry with new Bearer, and stop on genuine denial", async () => {
  let failures = 0;
  const first = await render(AuthenticatedImage, { uri: owned(), onError: () => failures++ });
  const second = await render(AuthenticatedImage, { uri: owned("images/two.jpg"), onError: () => failures++ });
  const cacheKey = first.root.findByType("ExpoImage").props.source.cacheKey;
  await act(async () => {
    first.root.findByType("ExpoImage").props.onError({ error: "HTTP 403" });
    second.root.findByType("ExpoImage").props.onError({ error: "HTTP 403" }); await settle();
  });
  assert.equal(requests.filter(call => call.url.endsWith("/auth/refresh")).length, 1); assert.equal(failures, 0);
  assert.equal(first.root.findByType("ExpoImage").props.source.headers.Authorization, "Bearer access-fresh");
  assert.equal(first.root.findByType("ExpoImage").props.source.cacheKey, cacheKey);
  await act(async () => { first.root.findByType("ExpoImage").props.onError({ error: "status code: 403" }); await settle(); });
  assert.equal(requests.length, 1); assert.equal(failures, 1);
});
test("external-source and valid-token codec failures do not refresh credentials", async () => {
  for (const [uri, error] of [["https://cdn.test/photo.jpg?Signature=A%2Fb", "HTTP 403"], [owned(), "Image decoder failed"]]) {
    let failures = 0; const root = await render(AuthenticatedImage, { uri, onError: () => failures++ });
    await act(async () => { root.root.findByType("ExpoImage").props.onError({ error }); await settle(); }); assert.equal(failures, 1);
  }
  assert.equal(requests.length, 0);
});
test("private video refreshes once after a native 403 and reloads the actual source with the fresh token", async () => {
  videoFailures.push({ message: "Response code: 403" }); setVisibleMedia(visibilityOwner, ["video"]);
  const root = await render(Video, { uri: owned("videos/clip.mp4"), playbackId: "video" }); await tap(root, "Play video");
  assert.deepEqual(players[0].replaces.map(source => source.headers.Authorization), ["Bearer access-A", "Bearer access-fresh"]);
  assert.equal(requests.length, 1); assert.ok(players[0].playing);
});
test("opaque Android audio errors recover a known-expired JWT without guessing that codec errors mean 403", async () => {
  const expired = `header.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.signature`;
  publishIdentity("account-A", expired); audioFailures.push("Source error"); setVisibleMedia(visibilityOwner, ["voice"]);
  const root = await render(Voice, { audioUri: owned("audio/voice.m4a"), playbackId: "voice" }); await tap(root, "Play voice message");
  assert.equal(players[0].replaces.length, 2); assert.equal(players[0].replaces[1].headers.Authorization, "Bearer access-fresh"); assert.equal(requests.length, 1);
});
test("token synchronization cannot replay an old video error while the refreshed native load is pending", async () => {
  const pending = deferred(); videoFailures.push({ message: "HTTP 403" }); videoGates.push(null, pending);
  setVisibleMedia(visibilityOwner, ["video"]);
  const root = await render(Video, { uri: owned("videos/slow.mp4"), playbackId: "video" }); await tap(root, "Play video");
  assert.equal(players[0].replaces.length, 2);
  await act(async () => { pending.resolve(); await settle(); });
  assert.equal(root.root.findAllByProps({ accessibilityLabel: "Retry video" }).length, 0);
  assert.ok(players[0].playing); assert.equal(requests.length, 1);
});
test("token synchronization cannot replay an old audio error during refreshed audio setup", async () => {
  const pending = deferred(); audioFailures.push("Response code: 403"); audioGates.push(null, pending);
  setVisibleMedia(visibilityOwner, ["voice"]);
  const root = await render(Voice, { audioUri: owned("audio/slow.m4a"), playbackId: "voice" }); await tap(root, "Play voice message");
  await act(async () => { pending.resolve(); await settle(); });
  assert.equal(players[0].replaces.length, 2); assert.equal(root.root.findAllByProps({ accessibilityLabel: "Retry voice message" }).length, 0);
  assert.equal(requests.length, 1);
});
test("returning to a previous media URI cannot revive its cancelled auth-error callback", async () => {
  const pending = deferred(); fetchResponse = () => pending.promise; let failures = 0;
  const props = { uri: owned(), onError: () => failures++ };
  const root = await render(AuthenticatedImage, props);
  await act(async () => { root.root.findByType("ExpoImage").props.onError({ error: "HTTP 403" }); await settle(); });
  await act(async () => root.update(React.createElement(AuthenticatedImage, { ...props, uri: owned("images/other.jpg") })));
  await act(async () => root.update(React.createElement(AuthenticatedImage, props)));
  await act(async () => { pending.resolve(response({ data: { accessToken: "access-fresh", refreshToken: "refresh-fresh" } })); await settle(); });
  assert.equal(failures, 0);
  // This is a new resource lifetime, not an old handled-error flag for the same URL.
  fetchResponse = async () => response({}, 401);
  await act(async () => { root.root.findByType("ExpoImage").props.onError({ error: "HTTP 403" }); await settle(); });
  assert.equal(failures, 1);
});
test("logout/account switch invalidates an in-flight media refresh and late callbacks; caches never cross accounts", async () => {
  const pending = deferred(); fetchResponse = () => pending.promise;
  let failures = 0; const root = await render(AuthenticatedImage, { uri: owned(), onError: () => failures++ });
  const old = root.root.findByType("ExpoImage").props;
  await act(async () => { old.onError({ error: "HTTP 403" }); await settle(); });
  await act(async () => publishIdentity("account-B", "access-B", "refresh-B"));
  const next = root.root.findByType("ExpoImage").props;
  assert.notEqual(old.source.cacheKey, next.source.cacheKey); assert.equal(next.source.headers.Authorization, "Bearer access-B");
  await act(async () => { pending.resolve(response({ data: { accessToken: "late-A", refreshToken: "late-refresh-A" } })); await settle(); old.onError({ error: "HTTP 403" }); await settle(); });
  assert.equal(auth.getAccessToken(), "access-B"); assert.equal(failures, 0); assert.equal(requests.length, 1);
});
for (const status of [401, 403]) test(`private download HTTP ${status} retries once using the existing refresh flight and real file progress`, async () => {
  const store = new DocumentDownloads(), spec = { ownerId: "account-A", id: "attachment", uri: owned(), name: "photo.jpg" };
  downloadStatuses.push(status, 200); await store.download(spec);
  assert.deepEqual(transfers.map(transfer => transfer.options.headers.Authorization), ["Bearer access-A", "Bearer access-fresh"]);
  assert.equal(store.get(documentKey(spec)).status, "ready"); assert.equal(store.get(documentKey(spec)).bytes, 12);
  assert.equal(files.has(transfers[0].localUri), false); assert.equal(requests.length, 1); await store.clear();
});
test("genuine private download denial stays failed, removes partial bytes and never retries anonymously", async () => {
  const store = new DocumentDownloads(), spec = { ownerId: "account-A", id: "forbidden", uri: owned(), name: "photo.jpg" };
  downloadStatuses.push(403, 403); await store.download(spec);
  assert.equal(transfers.length, 2); assert.ok(transfers.every(transfer => transfer.options.headers.Authorization));
  assert.equal(requests.length, 1); assert.equal(store.get(documentKey(spec)).status, "error"); assert.equal(files.size, 0); await store.clear();
});
test("signed external downloads preserve their URL and never receive or refresh our Bearer token", async () => {
  const store = new DocumentDownloads(), spec = { ownerId: "account-A", id: "external", uri: "https://cdn.test/doc.pdf?X-Signature=a%2Fb%2B&x=2", name: "doc.pdf" };
  downloadStatuses.push(403); await store.download(spec);
  assert.equal(transfers[0].url, spec.uri); assert.deepEqual(transfers[0].options, {}); assert.equal(transfers.length, 1); assert.equal(requests.length, 0); await store.clear();
});
test("native sharing passes only an authenticated account-private local file, never the protected URL/token", async () => {
  await shareMediaFile({ ownerId: "account-A", id: "share", uri: owned(), name: "photo.jpg" });
  assert.equal(transfers[0].options.headers.Authorization, "Bearer access-A");
  assert.match(shares[0][0], /^file:\/\/\/documents\/chat-downloads\/account-A\//); assert.doesNotMatch(shares[0][0], /access-A|https?:/);
  params = { uri: owned("images/viewer.jpg") }; const root = await render(ImageViewer); await tap(root, "Share photo");
  assert.equal(shares.length, 2); assert.equal(transfers[1].options.headers.Authorization, "Bearer access-A");
});
test("private attachment action offers native save/share instead of a browser request that cannot authenticate", async () => {
  const root = await render(Card, { type: "AUDIO", uri: owned("audio/note.m4a"), message: "Voice", sender: "Other", time: 1, isSent: false, ownerId: "account-A", playbackId: "attachment" });
  await tap(root, "Attachment options"); assert.equal(menus[0][0].label, "Save / share file");
  await act(async () => { menus[0][0].onPress(); await settle(); });
  assert.equal(shares.length, 1); assert.match(shares[0][0], /^file:/);
});
test("story image loading/auth recovery consumes neither display time nor a view before native readiness", async () => {
  const originalInterval = global.setInterval, intervals = [];
  global.setInterval = (callback, duration) => { intervals.push(duration); return originalInterval(callback, duration); };
  try {
    const root = await render(StoryViewer, { stories: [story()], onClose() {} });
    assert.equal(intervals.length, 0); assert.equal(requests.length, 0);
    await act(async () => { root.root.findByType("ExpoImage").props.onLoad({ source: { width: 400, height: 600 } }); await settle(); });
    assert.deepEqual(intervals, [100]); assert.equal(requests.filter(call => call.url.endsWith("/view")).length, 1);
  } finally { global.setInterval = originalInterval; }
});
for (const denied of [false, true]) test(`story video auth recovery is bounded and ${denied ? "preserves genuine/expired denial" : "reloads the actual native source"}`, async () => {
  videoFailures.push({ message: "HTTP 403" }); if (denied) videoFailures.push({ message: "HTTP 403" });
  const root = await render(StoryViewer, { stories: [story("video")], onClose() {} });
  assert.deepEqual(players[0].replaces.map(source => source.headers.Authorization), ["Bearer access-A", "Bearer access-fresh"]);
  assert.equal(requests.filter(call => call.url.endsWith("/auth/refresh")).length, 1);
  assert.equal(requests.filter(call => call.url.endsWith("/view")).length, denied ? 0 : 1);
  assert.equal(root.root.findAllByType("Text").some(node => node.children.includes("This story is unavailable")), denied);
});
test("persistent native audio 403 does not create a refresh/reload loop", async () => {
  audioFailures.push("Response code: 403", "Response code: 403"); setVisibleMedia(visibilityOwner, ["voice"]);
  const root = await render(Voice, { audioUri: owned("audio/voice.m4a"), playbackId: "voice" }); await tap(root, "Play voice message");
  assert.equal(players[0].replaces.length, 2); assert.equal(requests.length, 1);
  assert.ok(root.root.findByProps({ accessibilityLabel: "Retry voice message" }));
});
test("native file rejection with an HTTP status uses the same bounded recovery as status-bearing results", async () => {
  const store = new DocumentDownloads(), spec = { ownerId: "account-A", id: "native-error", uri: owned(), name: "photo.jpg" };
  downloadStatuses.push(new Error("Server returned HTTP response code: 403"), 200); await store.download(spec);
  assert.equal(transfers.length, 2); assert.equal(store.get(documentKey(spec)).status, "ready"); assert.equal(requests.length, 1); await store.clear();
});
test("switching accounts during a requested download cannot share/promote that old account's bytes", async () => {
  const pending = deferred();
  fileSystem.createDownloadResumable = (_url, localUri) => ({ pauseAsync: async () => pending.resolve(undefined), downloadAsync: async () => {
    await pending.promise; files.set(localUri, { exists: true, size: 12, uri: localUri }); return { uri: localUri, status: 200 };
  } });
  const work = shareMediaFile({ ownerId: "account-A", id: "late-share", uri: owned(), name: "photo.jpg" }); await settle();
  publishIdentity("account-B", "access-B", "refresh-B"); pending.resolve(); await work;
  assert.equal(shares.length, 0); assert.equal([...files.keys()].some(path => !path.endsWith(".part")), false);
});
test("a fresh session for the same account cannot reuse the old session's private image cache identity", async () => {
  const root = await render(AuthenticatedImage, { uri: owned() }); const previous = root.root.findByType("ExpoImage").props.source.cacheKey;
  await act(async () => publishIdentity("account-A", "new-session-token", "new-session-refresh"));
  const source = root.root.findByType("ExpoImage").props.source;
  assert.notEqual(source.cacheKey, previous); assert.doesNotMatch(source.cacheKey, /new-session-token/);
});
test("story viewer snapshot cache is account/session-scoped and late old-account feeds cannot replace the current feed", async () => {
  mock("@/components/stories/StoryViewer", "StoryViewer");
  const Screen = require("../../src/app/stories/viewer.tsx").default;
  fetchResponse = async () => response({ data: [backendStory("from-A", "VIDEO")] });
  const root = await render(Screen);
  assert.equal(root.root.findByType("StoryViewer").props.stories[0].mediaUrl, owned("videos/from-A.mp4"));
  assert.equal(root.root.findByType("StoryViewer").props.stories[0].mediaType, "video");
  const pendingB = deferred(), pendingC = deferred();
  fetchResponse = (_url, options) => options.headers.Authorization === "Bearer access-B" ? pendingB.promise : pendingC.promise;
  await act(async () => { publishIdentity("account-B", "access-B", "refresh-B"); await settle(); });
  assert.equal(root.root.findAllByType("StoryViewer").length, 0);
  await act(async () => { publishIdentity("account-C", "access-C", "refresh-C"); await settle(); });
  await act(async () => { pendingC.resolve(response({ data: [backendStory("current-C")] })); await settle(); });
  await act(async () => { pendingB.resolve(response({ data: [backendStory("late-B")] })); await settle(); });
  assert.equal(root.root.findByType("StoryViewer").props.stories[0].id, "current-C");
  assert.equal(requests.at(-1).options.headers.Authorization, "Bearer access-C");
});
test("story feed hides old-account rows immediately and ignores late refetch results", async () => {
  const { useStories } = require("../../src/hooks/useStories.ts"); let feed;
  function Probe() { const result = useStories(); React.useEffect(() => { feed = result; }); return null; }
  fetchResponse = async () => response({ data: [backendStory("feed-A")] }); await render(Probe);
  assert.equal(feed.stories[0].mediaUrl, owned("images/feed-A.jpg"));
  const pendingA = deferred(), pendingB = deferred(); let oldWork;
  fetchResponse = (_url, options) => options.headers.Authorization === "Bearer access-A" ? pendingA.promise : pendingB.promise;
  await act(async () => { oldWork = feed.refetch(); await settle(); });
  await act(async () => { publishIdentity("account-B", "access-B", "refresh-B"); await settle(); });
  assert.deepEqual(feed.stories, []);
  await act(async () => { pendingB.resolve(response({ data: [backendStory("feed-B")] })); await settle(); pendingA.resolve(response({ data: [backendStory("late-A")] })); await oldWork; await settle(); });
  assert.equal(feed.stories[0].id, "feed-B");
});
test("real local HTTP fixture rejects a bare private media GET and accepts the constructed native request headers", async () => {
  const http = require("node:http"), seen = [];
  const server = http.createServer((request, result) => {
    seen.push(request.headers.authorization);
    result.writeHead(request.headers.authorization === "Bearer access-A" ? 200 : 403, { "Cache-Control": "private,no-store", "Content-Type": "application/octet-stream" });
    result.end("fixture bytes");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const path of ["images/chat.jpg", "videos/story.mp4", "audio/voice.m4a"]) {
      const source = mediaRequestSource(`${origin}/uploads/${path}`, "access-A", origin);
      assert.equal((await nativeFetch(source.uri)).status, 403);
      const result = await nativeFetch(source.uri, { headers: source.headers }); assert.equal(result.status, 200); await result.arrayBuffer();
    }
    assert.deepEqual(seen, [undefined, "Bearer access-A", undefined, "Bearer access-A", undefined, "Bearer access-A"]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
