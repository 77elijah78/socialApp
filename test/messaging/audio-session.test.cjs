const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("./harness.cjs");

let players = [];
let modes = [];
let nextId = 0;

function fakePlayer(source) {
  const statusListeners = new Set();
  const player = {
    id: `player-${++nextId}`,
    source,
    playing: false,
    released: false,
    pauses: 0,
    plays: 0,
    seeks: [],
    snapshot: {
      currentTime: 0,
      duration: 30,
      playing: false,
      isBuffering: false,
      isLoaded: true,
      error: null,
      playbackState: "readyToPlay",
      didJustFinish: false,
    },
    addListener(event, listener) {
      assert.equal(event, "playbackStatusUpdate");
      statusListeners.add(listener);
      return { remove: () => statusListeners.delete(listener) };
    },
    play() {
      assert.equal(this.released, false);
      this.plays++;
      this.playing = true;
    },
    pause() {
      this.pauses++;
      this.playing = false;
    },
    async seekTo(seconds) {
      this.seeks.push(seconds);
      this.snapshot.currentTime = seconds;
    },
    setActiveForLockScreen(active) {
      this.lockScreen = active;
    },
    clearLockScreenControls() {
      this.lockScreen = false;
    },
    remove() {
      this.released = true;
    },
    emit(patch) {
      this.snapshot = { ...this.snapshot, ...patch };
      for (const listener of [...statusListeners]) listener(this.snapshot);
    },
  };
  players.push(player);
  return player;
}

mock("expo-audio", {
  createAudioPlayer: (source) => fakePlayer(source),
  setAudioModeAsync: async (mode) => {
    modes.push(mode);
  },
});

const { chatAudio } = require("../../src/services/ChatAudioPlayer.ts");

beforeEach(() => {
  chatAudio.reset();
  players = [];
  modes = [];
  nextId = 0;
});

function track(key, uri = `file:///cache/${key}.m4a`) {
  return { key, uri, title: key, subtitle: "Voice message", duration: 30 };
}

test("the shared session configures background audio and plays exactly one track", async () => {
  await chatAudio.play(track("a"));
  assert.equal(players.length, 1);
  assert.equal(players[0].plays, 1);
  assert.equal(players[0].source.uri, "file:///cache/a.m4a");
  assert.equal(players[0].lockScreen, true);
  assert.deepEqual(modes, [
    {
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    },
  ]);
  const status = chatAudio.getSnapshot();
  assert.equal(status.key, "a");
  assert.equal(status.playing, true);
});

test("tapping the active row toggles pause/resume; a different row replaces the session", async () => {
  await chatAudio.play(track("a"));
  await chatAudio.play(track("a"));
  assert.equal(players[0].pauses, 1);
  assert.equal(chatAudio.getSnapshot().playing, false);
  await chatAudio.play(track("a"));
  assert.equal(players[0].plays, 2);
  assert.equal(chatAudio.getSnapshot().playing, true);

  await chatAudio.play(track("b"));
  assert.equal(players[0].released, true);
  assert.equal(players[1].plays, 1);
  assert.equal(chatAudio.getSnapshot().key, "b");
});

test("progress, duration and seek stay in the shared snapshot outside React", async () => {
  await chatAudio.play(track("voice"));
  players[0].emit({ currentTime: 12.5, duration: 42, playing: true });
  assert.equal(chatAudio.getSnapshot().currentTime, 12.5);
  assert.equal(chatAudio.getSnapshot().duration, 42);
  chatAudio.seek(30);
  assert.deepEqual(players[0].seeks, [30]);
  assert.equal(chatAudio.getSnapshot().currentTime, 30);
});

test("inactive rows keep a stable snapshot identity while active progress updates", async () => {
  await chatAudio.play(track("active"));
  const inactive = chatAudio.getSelection("other");
  const activeBefore = chatAudio.getSelection("active");
  players[0].emit({ currentTime: 3 });
  assert.equal(chatAudio.getSelection("other"), inactive);
  assert.notEqual(chatAudio.getSelection("active"), activeBefore);
});

test("genuine completion releases native resources and a replay starts fresh", async () => {
  await chatAudio.play(track("ended"));
  players[0].emit({ didJustFinish: true, currentTime: 30, duration: 30 });
  assert.equal(players[0].released, true);
  assert.equal(chatAudio.getSnapshot().ended, true);
  assert.equal(chatAudio.getSnapshot().playing, false);

  await chatAudio.play(track("ended"));
  assert.equal(players.length, 2);
  assert.equal(players[1].plays, 1);
});

test("closing and account reset stop audio and clear the session", async () => {
  await chatAudio.play(track("close"));
  chatAudio.close();
  assert.equal(players[0].pauses, 1);
  assert.equal(players[0].released, true);
  assert.equal(chatAudio.getSnapshot().key, null);

  await chatAudio.play(track("reset"));
  chatAudio.reset();
  assert.equal(players[1].released, true);
  assert.equal(chatAudio.getSnapshot().key, null);
});
