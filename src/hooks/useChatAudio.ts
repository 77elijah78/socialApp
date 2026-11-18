import { useCallback, useSyncExternalStore } from "react";
import { chatAudio, type ChatAudioSnapshot } from "@/services/ChatAudioPlayer";

const empty: ChatAudioSnapshot = {
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

/** Global session for the mini player. */
export function useChatAudioSession() {
  return useSyncExternalStore(chatAudio.subscribe, chatAudio.getSnapshot, chatAudio.getSnapshot);
}

/** Per-row selection. Unrelated rows keep a stable snapshot identity. */
export function useChatAudio(key?: string | null): ChatAudioSnapshot {
  const subscribe = useCallback(
    (listener: () => void) =>
      key ? chatAudio.subscribeFor(key, listener) : () => {},
    [key],
  );
  const snapshot = useCallback(
    () => (key ? chatAudio.getSelection(key) : empty),
    [key],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
