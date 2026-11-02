const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, appState } = require("./harness.cjs");
let blur, allowed, renderer;
mock("expo-router", {
  useFocusEffect: (callback) =>
    React.useEffect(() => {
      const cleanup = callback();
      blur = cleanup;
      return cleanup;
    }, [callback]),
});
const {
  useChatMediaPlayback,
  claimChatPlayback,
} = require("../../src/hooks/useChatMediaPlayback.ts");
function Probe({ player, visible = true }) {
  // eslint-disable-next-line react-hooks/globals -- A mounted test probe exposes its result to assertions.
  allowed = useChatMediaPlayback(player, visible);
  return null;
}
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  appState.change("active");
});

test("active player is paused on route blur and late asynchronous setup loses permission to play", async () => {
  let pauses = 0;
  const player = { pause: () => pauses++ };
  await act(async () => {
    renderer = create(React.createElement(Probe, { player }));
  });
  claimChatPlayback(player);
  assert.equal(allowed(), true);
  await act(async () => blur());
  assert.equal(allowed(), false);
  assert.equal(pauses, 1);
});

test("foreground/visibility gates and the existing single-player arbiter remain intact", async () => {
  let pauses = 0;
  const player = { pause: () => pauses++ };
  await act(async () => {
    renderer = create(React.createElement(Probe, { player }));
  });
  claimChatPlayback(player);
  claimChatPlayback({ pause() {} });
  assert.equal(pauses, 1);
  await act(async () => appState.change("background"));
  assert.equal(allowed(), false);
  await act(async () => {
    appState.change("active");
    renderer.update(React.createElement(Probe, { player, visible: false }));
  });
  assert.equal(allowed(), false);
});
