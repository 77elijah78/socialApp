const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const {
  mock,
  row,
  deferred,
  settle,
  appState,
  files,
} = require("./harness.cjs");
const {
  setVisibleMedia,
  clearVisibleMedia,
} = require("../../src/utils/messaging/mediaVisibility.ts");
const {
  ChatReadVisibility,
  ChatMediaInteraction,
} = require("../../src/components/chat/ChatReadVisibility.tsx");
const {
  documentDownloads,
} = require("../../src/services/DocumentDownloads.ts");
const {
  createListItemBuilder,
} = require("../../src/utils/messaging/listItems.ts");
let renderer,
  audioPlayers,
  videoPlayers,
  failAudio,
  failVideo,
  mode,
  shares,
  shareWork;
const mediaOwner = Symbol("ui-test-media");
function player(kind) {
  const subscribers = new Set();
  const value = {
    kind,
    playing: false,
    status: "idle",
    released: false,
    replaces: [],
    plays: 0,
    pauses: 0,
    snapshot: {
      currentTime: 0,
      duration: 75,
      playing: false,
      isBuffering: false,
      isLoaded: false,
      error: null,
      playbackState: "idle",
    },
    events: { statusChange: { status: "idle" } },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    update(patch) {
      this.snapshot = { ...this.snapshot, ...patch };
      subscribers.forEach((listener) => listener());
    },
    pause() {
      this.pauses++;
      this.playing = false;
      this.update({ playing: false });
    },
    play() {
      assert.equal(this.released, false);
      this.plays++;
      this.playing = true;
      this.update({ playing: true });
    },
    replace(source) {
      if (failAudio) throw new Error("unavailable");
      this.replaces.push(source);
      this.update({ isLoaded: true, error: null });
    },
    async replaceAsync(source) {
      if (failVideo) throw new Error("unavailable");
      this.replaces.push(source);
      this.status = "readyToPlay";
      this.events.statusChange = { status: "readyToPlay" };
      subscribers.forEach((listener) => listener());
    },
    async seekTo(seconds) {
      this.update({ currentTime: seconds });
    },
  };
  return value;
}
function usePlayer(kind) {
  const value = React.useMemo(() => {
    const p = player(kind);
    (kind === "audio" ? audioPlayers : videoPlayers).push(p);
    return p;
  }, [kind]);
  React.useEffect(
    () => () => {
      value.released = true;
    },
    [value],
  );
  return value;
}
mock("expo-audio", {
  useAudioPlayer: () => usePlayer("audio"),
  useAudioPlayerStatus: (value) =>
    React.useSyncExternalStore(value.subscribe, () => value.snapshot),
  setAudioModeAsync: (...args) => mode(...args),
});
mock("expo-video", {
  useVideoPlayer: (source, setup) => {
    const p = usePlayer("video");
    React.useEffect(() => setup?.(p), [p, setup]);
    return p;
  },
  VideoView: "VideoView",
});
mock("expo", {
  useEvent: (value, name) =>
    React.useSyncExternalStore(value.subscribe, () => value.events[name]),
});
mock("expo-screen-orientation", {
  OrientationLock: { LANDSCAPE: 6 },
  async getOrientationLockAsync() {
    return 3;
  },
  async lockAsync() {},
});
mock("expo-sharing", {
  async isAvailableAsync() {
    return true;
  },
  async shareAsync(...args) {
    shares.push(args);
    if (shareWork) await shareWork.promise;
  },
});
const Card = require("../../src/components/messages/MessageCard.tsx").default;
const Voice = require("../../src/components/messages/VoiceMessage.tsx").default;
const Video = require("../../src/components/messages/Videoplayer.tsx").default;
const Document =
  require("../../src/components/messages/DocumentMessage.tsx").default;
const Row = require("../../src/components/chat/ChatMessageRow.tsx").default;
const noop = () => {};
beforeEach(async () => {
  audioPlayers = [];
  videoPlayers = [];
  failAudio = false;
  failVideo = false;
  mode = async () => {};
  shares = [];
  shareWork = null;
  appState.currentState = "active";
  files.clear();
  await documentDownloads.clear();
});
afterEach(async () => {
  if (shareWork) shareWork.resolve();
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  clearVisibleMedia(mediaOwner);
  await documentDownloads.clear();
});
async function render(Component, props) {
  await act(async () => {
    renderer = create(React.createElement(Component, props));
    await settle();
  });
}
const card = {
  message: "hello",
  time: 1700000000000,
  sender: "Yuki",
  isRead: false,
  isSent: true,
  status: "SENT",
  type: "TEXT",
  uri: "https://cdn.test/media",
};
for (const status of ["SENDING", "SENT", "DELIVERED", "READ", "FAILED"]) {
  test(`all outgoing bubble types share the ${status} receipt semantics`, async () => {
    await render(Card, { ...card, status });
    const label = {
      SENDING: "Sending",
      SENT: "Sent",
      DELIVERED: "Delivered",
      READ: "Read",
      FAILED: "Failed to send",
    }[status];
    assert.equal(
      renderer.root.findAllByProps({ accessibilityLabel: label }).length,
      1,
    );
    if (status === "FAILED")
      assert.equal(
        renderer.root.findAllByProps({
          accessibilityLabel: "Retry failed message",
        }).length,
        1,
      );
  });
}
test("incoming bubbles never display someone else's outgoing read ticks", async () => {
  await render(Card, { ...card, isSent: false, status: "READ" });
  assert.equal(
    renderer.root.findAllByProps({ accessibilityLabel: "Read" }).length,
    0,
  );
});
test("a group reply uses each real sender and original author, not the group/receiver name", async () => {
  const original = row(1, {
    senderId: "yuki",
    senderData: JSON.stringify({
      id: "yuki",
      displayName: "Yuki Tanaka",
      avatarUrl: "https://cdn.test/yuki.jpg",
    }),
    type: "IMAGE",
    mediaUrl: "https://cdn.test/photo.jpg",
  });
  const response = row(2, {
    repliedToId: original.id,
    senderId: "mika",
    senderData: JSON.stringify({
      id: "mika",
      displayName: "Mika Sato",
      avatarUrl: "https://cdn.test/mika.jpg",
    }),
  });
  const item = createListItemBuilder()([original, response], "me", null).find(
    (item) => item.kind === "message" && item.message.id === response.id,
  );
  const navigation = [];
  await render(Row, {
    item,
    userId: "me",
    receiverName: "Group name",
    isGroup: true,
    onAction: noop,
    onRetry: noop,
    onNavigate: (id) => navigation.push(id),
    onContextClose: noop,
    onContextPage: noop,
    onContextRefresh: noop,
  });
  const text = renderer.root
    .findAllByType("Text")
    .map((node) => node.children.join(" "))
    .join(" ");
  assert.match(text, /Mika Sato/);
  assert.match(text, /Yuki Tanaka/);
  assert.doesNotMatch(text, /Group name/);
  assert.ok(
    renderer.root
      .findAllByType("ExpoImage")
      .some((node) => node.props.source.uri === "https://cdn.test/mika.jpg"),
  );
  const quote = renderer.root
    .findAllByType("TouchableOpacity")
    .find((node) =>
      node.props.accessibilityLabel?.includes("Go to original message"),
    );
  quote.props.onPress();
  assert.deepEqual(navigation, [original.id]);
});
test("unknown cached group authors are honest instead of being mislabeled as another participant", async () => {
  const item = createListItemBuilder()([row(1)], "me", null)[0];
  await render(Row, {
    item,
    userId: "me",
    receiverName: "Someone else",
    isGroup: true,
    onAction: noop,
    onRetry: noop,
    onNavigate: noop,
    onContextClose: noop,
    onContextPage: noop,
    onContextRefresh: noop,
  });
  assert.ok(
    renderer.root
      .findAllByType("Text")
      .some((node) => node.children.includes("Unknown sender")),
  );
});
test("image loading, failed/retry state and real portrait geometry remain within the bubble", async () => {
  await render(Card, {
    ...card,
    type: "IMAGE",
    uri: "https://cdn.test/portrait.jpg",
    message: null,
  });
  assert.ok(renderer.root.findAllByType("ActivityIndicator").length);
  await act(async () => renderer.root.findByType("ExpoImage").props.onError());
  assert.equal(renderer.root.findAllByType("ExpoImage").length, 0);
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Retry photo" })
      .props.onPress(),
  );
  await act(async () =>
    renderer.root
      .findByType("ExpoImage")
      .props.onLoad({ source: { width: 600, height: 1200 } }),
  );
  const frame =
    renderer.root.findByType("ExpoImage").parent.parent.props.style[1];
  assert.ok(Math.abs(frame.width / frame.height - 0.5) < 1e-9);
  assert.ok(frame.height <= 844 * 0.5);
});
test("voice bubbles create no player before play, use supplied real waveform and pause/resume/seek locally", async () => {
  await render(Voice, {
    audioUri: "https://cdn.test/voice.m4a",
    duration: 75,
    waveform: [0, 25, 100],
  });
  assert.equal(audioPlayers.length, 0);
  assert.ok(
    renderer.root.findByProps({ accessibilityLabel: "Audio waveform" }),
  );
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: "Play voice message" })
      .props.onPress();
    await settle();
  });
  const p = audioPlayers[0];
  assert.equal(p.plays, 1);
  assert.equal(p.replaces.length, 1);
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Pause voice message" })
      .props.onPress(),
  );
  assert.equal(p.playing, false);
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Play voice message" })
      .props.onPress(),
  );
  assert.equal(p.replaces.length, 1);
  const waveform = renderer.root.findByProps({
    accessibilityLabel: "Audio waveform",
  });
  await act(async () => {
    waveform.props.onLayout({ nativeEvent: { layout: { width: 200 } } });
    waveform.props.onPress({ nativeEvent: { locationX: 100 } });
  });
  assert.equal(p.snapshot.currentTime, 37.5);
  await act(async () => {
    appState.change("background");
  });
  assert.equal(p.playing, false);
});
test("missing waveform is a real progress rail, and asynchronous/native audio errors can retry", async () => {
  failAudio = true;
  await render(Voice, { audioUri: "https://cdn.test/voice.m4a", duration: 75 });
  assert.ok(
    renderer.root.findByProps({
      accessibilityLabel: "Audio progress. No waveform data available",
    }),
  );
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: "Play voice message" })
      .props.onPress();
    await settle();
  });
  assert.ok(
    renderer.root.findByProps({ accessibilityLabel: "Retry voice message" }),
  );
  failAudio = false;
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: "Retry voice message" })
      .props.onPress();
    await settle();
  });
  assert.equal(audioPlayers[0].playing, true);
  await act(async () => audioPlayers[0].update({ error: "Media unavailable" }));
  assert.ok(
    renderer.root.findByProps({ accessibilityLabel: "Retry voice message" }),
  );
});
test("late audio setup cannot play after the row unmounts; native hook resource is released", async () => {
  const pending = deferred();
  mode = () => pending.promise;
  await render(Voice, { audioUri: "https://cdn.test/voice.m4a", duration: 75 });
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Play voice message" })
      .props.onPress(),
  );
  const p = audioPlayers[0];
  await act(async () => renderer.unmount());
  renderer = null;
  await act(async () => {
    pending.resolve();
    await settle();
  });
  assert.equal(p.plays, 0);
  assert.equal(p.released, true);
});
test("video is poster-only until a tap, opens a contained player, supports failure/retry, and releases on close", async () => {
  await render(Video, {
    uri: "https://cdn.test/video.mp4",
    duration: 65,
    width: 280,
  });
  assert.equal(videoPlayers.length, 0);
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: "Play video" })
      .props.onPress();
    await settle();
  });
  const p = videoPlayers[0];
  assert.equal(p.plays, 1);
  assert.equal(
    renderer.root.findByType("VideoView").props.contentFit,
    "contain",
  );
  assert.equal(
    renderer.root.findByType("VideoView").props.nativeControls,
    true,
  );
  await act(async () => {
    p.status = "error";
    p.events.statusChange = {
      status: "error",
      error: { message: "Unavailable" },
    };
    p.update({});
  });
  assert.ok(renderer.root.findByProps({ accessibilityLabel: "Retry video" }));
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: "Retry video" })
      .props.onPress();
    await settle();
  });
  assert.equal(p.plays, 2);
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Close video player" })
      .props.onPress(),
  );
  assert.equal(p.released, true);
  assert.equal(renderer.root.findAllByType("VideoView").length, 0);
});
test("video modal blocks read eligibility without Router blur and releases the cover on close", async () => {
  let covers = 0;
  const cover = () => {
    covers++;
    let released = false;
    return () => {
      if (!released) {
        covers--;
        released = true;
      }
    };
  };
  await act(async () => {
    renderer = create(
      React.createElement(
        ChatReadVisibility.Provider,
        { value: cover },
        React.createElement(Video, { uri: "https://cdn.test/movie.mp4" }),
      ),
    );
  });
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: "Play video" })
      .props.onPress();
    await settle();
  });
  assert.equal(covers, 1);
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Close video player" })
      .props.onPress(),
  );
  assert.equal(covers, 0);
});
test("a real play tap can register visibility immediately without generating a read acknowledgment", async () => {
  const ids = [];
  const confirm = (id) => {
    ids.push(id);
    setVisibleMedia(mediaOwner, [id]);
  };
  await act(async () => {
    renderer = create(
      React.createElement(
        ChatMediaInteraction.Provider,
        { value: confirm },
        React.createElement(Voice, {
          audioUri: "https://cdn.test/voice.m4a",
          playbackId: "native-row",
          duration: 10,
        }),
      ),
    );
  });
  await act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: "Play voice message" })
      .props.onPress();
    await settle();
  });
  assert.deepEqual(ids, ["native-row"]);
  assert.equal(audioPlayers[0].plays, 1);
  await act(async () => clearVisibleMedia(mediaOwner));
  assert.equal(audioPlayers[0].playing, false);
});
test("file download reaches a truthful downloaded/open state and the OS share sheet blocks chat reads", async () => {
  let covers = 0;
  shareWork = deferred();
  await act(async () => {
    renderer = create(
      React.createElement(
        ChatReadVisibility.Provider,
        {
          value: () => {
            covers++;
            return () => covers--;
          },
        },
        React.createElement(Document, {
          ownerId: "me",
          id: "doc",
          uri: "https://cdn.test/budget.pdf",
          name: "budget.pdf",
          size: 4096,
        }),
      ),
    );
    await settle();
  });
  const action = () =>
    renderer.root
      .findAllByType("TouchableOpacity")
      .find((node) => node.props.accessibilityLabel?.startsWith("budget.pdf"));
  await act(async () => {
    action().props.onPress();
    await settle();
  });
  assert.match(action().props.accessibilityLabel, /Downloaded/);
  await act(async () => {
    action().props.onPress();
    await settle();
  });
  assert.equal(shares.length, 1);
  assert.match(shares[0][0], /^file:\/\/\/documents\//);
  assert.equal(covers, 1);
  await act(async () => {
    shareWork.resolve();
    await settle();
  });
  assert.equal(covers, 0);
});
