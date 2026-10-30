import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

type Pausable = { pause: () => void };
let activePlayer: Pausable | null = null;
/** One user-selected chat media resource plays at a time. */
export function claimChatPlayback(player: Pausable) {
  if (activePlayer && activePlayer !== player) {
    try {
      activePlayer.pause();
    } catch {
      /* previous native handle already disposed */
    }
  }
  activePlayer = player;
}

/** Expo owns disposal. Also guard async loads that complete after blur/unmount. */
export function useChatMediaPlayback(
  player: { pause: () => void },
  visible: boolean,
) {
  const allowed = useRef(visible);
  useEffect(() => {
    allowed.current = visible;
    const pause = () => {
      if (activePlayer === player) activePlayer = null;
      try {
        player.pause();
      } catch (error) {
        if (__DEV__) console.warn("[chat media] pause failed", error);
      }
    };
    if (!visible || AppState.currentState !== "active") pause();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") pause();
    });
    return () => {
      allowed.current = false;
      if (activePlayer === player) activePlayer = null;
      subscription.remove();
    };
  }, [player, visible]);
  return useCallback(
    () => allowed.current && AppState.currentState === "active",
    [],
  );
}
