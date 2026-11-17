import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";

export interface ChatAudioTrack {
  key: string;
  uri: string;
  title: string;
  subtitle?: string;
  duration?: number;
  waveform?: number[];
}

export interface ChatAudioSnapshot {
  key: string | null;
  uri: string | null;
  title: string;
  subtitle: string;
  duration: number;
  currentTime: number;
  playing: boolean;
  buffering: boolean;
  error: string | null;
  ended: boolean;
}

const idle: ChatAudioSnapshot = {
  key: null,
  uri: null,
  title: "",
  subtitle: "",
  duration: 0,
  currentTime: 0,
  playing: false,
  buffering: false,
  error: null,
  ended: false,
};

type Listener = () => void;

/** Stable identity for every row that is not the active track. */
const inactiveSelection: ChatAudioSnapshot = { ...idle };

/**
 * One app-owned audio session, deliberately outside React and outside any
 * message bubble. FlatList recycling, navigation and chat switches therefore
 * cannot destroy or pause the active voice note / music track.
 */
class ChatAudioManager {
  private snapshot = idle;
  private listeners = new Set<Listener>();
  private keyListeners = new Map<string, Set<Listener>>();
  private player: (AudioPlayer & {
    addListener: (
      event: "playbackStatusUpdate",
      listener: (status: AudioStatus) => void,
    ) => { remove: () => void };
  }) | null = null;
  private subscription: { remove: () => void } | null = null;
  private modeReady = false;
  private starting: Promise<void> | null = null;

  getSnapshot = () => this.snapshot;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** A recycled bubble subscribes only to its own identity. Inactive rows get
   * the same frozen snapshot, so 250ms progress updates do not re-render every
   * voice bubble in the list. */
  subscribeFor(key: string, listener: Listener) {
    const group = this.keyListeners.get(key) ?? new Set<Listener>();
    group.add(listener);
    this.keyListeners.set(key, group);
    return () => {
      group.delete(listener);
      if (!group.size) this.keyListeners.delete(key);
    };
  }

  getSelection(key: string): ChatAudioSnapshot {
    return this.snapshot.key === key ? this.snapshot : inactiveSelection;
  }

  private publish(patch: Partial<ChatAudioSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    const keys = Object.keys(next) as (keyof ChatAudioSnapshot)[];
    if (keys.every((key) => next[key] === this.snapshot[key])) return;
    this.snapshot = next;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* a recycled row must not break the shared session */
      }
    }
    for (const group of this.keyListeners.values())
      for (const listener of group) {
        try {
          listener();
        } catch {
          /* one row must not break the session */
        }
      }
  }

  private async configureAudioMode() {
    if (this.modeReady) return;
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    });
    this.modeReady = true;
  }

  private handleStatus(status: AudioStatus) {
    if (status.didJustFinish) {
      this.publish({
        playing: false,
        buffering: false,
        currentTime: this.snapshot.duration,
        ended: true,
        error: null,
      });
      this.releasePlayer();
      return;
    }
    this.publish({
      currentTime:
        typeof status.currentTime === "number" ? status.currentTime : 0,
      duration:
        status.duration > 0 ? status.duration : this.snapshot.duration,
      playing: Boolean(status.playing),
      buffering: Boolean(status.isBuffering),
      error: status.error || null,
    });
  }

  private releasePlayer() {
    const player = this.player;
    this.player = null;
    this.subscription?.remove();
    this.subscription = null;
    if (!player) return;
    try {
      player.clearLockScreenControls?.();
    } catch {
      /* older native runtimes */
    }
    try {
      player.pause();
    } catch {
      /* already released */
    }
    try {
      player.remove();
    } catch {
      /* already released */
    }
  }

  private async start(track: ChatAudioTrack) {
    await this.configureAudioMode();
    this.releasePlayer();
    this.publish({
      key: track.key,
      uri: track.uri,
      title: track.title,
      subtitle: track.subtitle ?? "",
      duration: track.duration ?? 0,
      currentTime: 0,
      playing: false,
      buffering: true,
      error: null,
      ended: false,
    });

    const player = createAudioPlayer(
      { uri: track.uri },
      { updateInterval: 250 },
    ) as NonNullable<ChatAudioManager["player"]>;
    this.player = player;
    this.subscription = player.addListener(
      "playbackStatusUpdate",
      (status) => this.handleStatus(status),
    );
    try {
      player.setActiveForLockScreen?.(true, {
        title: track.title,
        artist: track.subtitle || "circle",
      });
    } catch {
      /* lock screen controls are optional */
    }
    player.play();
    this.publish({ playing: true, buffering: false });
  }

  /** Tap on the same bubble toggles. A different bubble replaces the session. */
  async play(track: ChatAudioTrack) {
    if (this.starting) await this.starting.catch(() => {});
    if (this.snapshot.key !== track.key) {
      this.starting = this.start(track);
      try {
        await this.starting;
      } catch (error) {
        this.releasePlayer();
        this.publish({
          ...track,
          subtitle: track.subtitle ?? "",
          duration: track.duration ?? 0,
          currentTime: 0,
          playing: false,
          buffering: false,
          ended: false,
          error:
            error instanceof Error
              ? error.message
              : "This audio couldn’t be played.",
        });
      } finally {
        this.starting = null;
      }
      return;
    }

    if (this.snapshot.error || this.snapshot.ended || !this.player) {
      this.starting = this.start(track);
      try {
        await this.starting;
      } catch {
        this.publish({
          playing: false,
          buffering: false,
          error: "This audio couldn’t be played.",
        });
      } finally {
        this.starting = null;
      }
      return;
    }

    const wasPlaying = Boolean(this.player.playing);
    if (wasPlaying) this.player.pause();
    else this.player.play();
    this.publish({ playing: !wasPlaying, ended: false });
  }

  pause() {
    this.player?.pause();
    this.publish({ playing: false });
  }

  seek(seconds: number) {
    const duration = this.snapshot.duration;
    const next = Math.max(0, Math.min(duration || seconds, seconds));
    this.publish({ currentTime: next, ended: false });
    void this.player?.seekTo(next).catch(() => {
      this.publish({ error: "Couldn’t seek this audio." });
    });
  }

  /** Explicit close from the mini player. Real completion/stop frees native
   * resources; the snapshot keeps the last position so a bubble can resume. */
  close() {
    this.releasePlayer();
    this.publish({ ...idle });
  }

  /** Called on logout so no previous account's audio survives the session. */
  reset() {
    this.releasePlayer();
    this.modeReady = false;
    this.publish({ ...idle });
  }
}

export const chatAudio = new ChatAudioManager();
