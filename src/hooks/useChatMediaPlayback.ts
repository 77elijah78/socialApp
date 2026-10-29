import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Expo owns disposal. Also guard async loads that complete after blur/unmount. */
export function useChatMediaPlayback(
  player: { pause: () => void },
  visible: boolean,
) {
  const allowed = useRef(visible);
  useEffect(() => {
    allowed.current = visible;
    const pause = () => {
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
      subscription.remove();
    };
  }, [player, visible]);
  return useCallback(
    () => allowed.current && AppState.currentState === "active",
    [],
  );
}
