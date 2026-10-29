const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { appState } = require("./harness.cjs");
const {
  useChatMediaPlayback,
} = require("../../src/hooks/useChatMediaPlayback.ts");
test("media gates late async play after blur/background/unmount and pauses on background", async () => {
  let allowed,
    pauses = 0;
  const player = { pause: () => pauses++ };
  function Probe({ visible }) {
    allowed = useChatMediaPlayback(player, visible);
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe, { visible: true }));
  });
  assert.equal(allowed(), true);
  appState.change("background");
  assert.equal(allowed(), false);
  assert.equal(pauses, 1);
  appState.change("active");
  await act(async () => {
    renderer.update(React.createElement(Probe, { visible: false }));
  });
  assert.equal(allowed(), false);
  assert.equal(pauses, 2);
  await act(async () => {
    renderer.update(React.createElement(Probe, { visible: true }));
  });
  assert.equal(allowed(), true);
  await act(async () => renderer.unmount());
  assert.equal(allowed(), false);
});
test("message media wiring preserves playback identity, fixed image geometry, attachment menu and explicit retry", async () => {
  const { mock } = require("./harness.cjs");
  const menus = [];
  mock("@/components/messages/VoiceMessage", (props) =>
    React.createElement("VoicePlayer", props),
  );
  mock("@/components/messages/Videoplayer", (props) =>
    React.createElement("VideoPlayer", props),
  );
  mock("@/providers/OverlayProvider", {
    useOverlay: () => ({ openActionMenu: (...args) => menus.push(args) }),
  });
  const Card = require("../../src/components/messages/MessageCard.tsx").default;
  let retries = 0;
  const props = {
    message: "Attachment",
    time: 1700000000000,
    sender: "You",
    isRead: false,
    isSent: true,
    status: "FAILED",
    type: "audio/mpeg",
    uri: "https://cdn.test/audio.m4a",
    playbackId: "stable-local",
    onRetry: () => retries++,
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Card, props), {
      createNodeMock: () => ({
        measureInWindow: (callback) => callback(1, 2, 3, 4),
      }),
    });
  });
  assert.equal(
    renderer.root.findByType("VoicePlayer").props.playbackId,
    "stable-local",
  );
  renderer.root
    .findByProps({ name: "download-outline" })
    .parent.props.onPress();
  assert.equal(menus.length, 1);
  renderer.root
    .findByProps({ accessibilityLabel: "Retry failed message" })
    .props.onPress();
  assert.equal(retries, 1);
  await act(async () => {
    renderer.update(
      React.createElement(Card, { ...props, type: "image/jpeg" }),
    );
  });
  const image = renderer.root.findByType("ExpoImage");
  assert.equal(image.props.cachePolicy, "memory-disk");
  assert.equal(image.props.style[1].height, 390 * 0.55);
  assert.equal(image.props.transition, 0);
  await act(async () => renderer.unmount());
});
test("shared story route selects the requested loaded ID and never opens an unrelated story for an unavailable ID", async () => {
  const { mock, settle } = require("./harness.cjs");
  let params = { storyId: "second" };
  mock("expo-router", {
    router: { back() {} },
    useLocalSearchParams: () => params,
  });
  mock("@/components/stories/StoryViewer", "StoryViewer");
  const story = (id) => ({
    id,
    userId: "other",
    mediaUrl: "https://cdn.test/a.jpg",
    mediaType: "image",
    caption: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    user: {
      id: "other",
      username: "other",
      displayName: "Other",
      avatarUrl: null,
    },
    views: [],
  });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ data: [story("first"), story("second")] }),
  });
  const Viewer = require("../../src/app/stories/viewer.tsx").default;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Viewer));
    await settle();
  });
  assert.equal(renderer.root.findByType("StoryViewer").props.initialIndex, 1);
  params = { storyId: "not-returned-by-feed" };
  await act(async () => renderer.update(React.createElement(Viewer)));
  assert.equal(renderer.root.findAllByType("StoryViewer").length, 0);
  assert.ok(renderer.root.findByProps({ accessibilityRole: "alert" }));
  await act(async () => renderer.unmount());
});
