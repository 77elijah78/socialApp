import { createContext, useMemo, type ReactElement } from "react";
import { Platform } from "react-native";
import {
  Gesture,
  GestureDetector,
  type NativeGesture,
} from "react-native-gesture-handler";

/** This is only a gesture relationship, not scroll/message state. Keep the
 * native handler stable so receipt/selection commits do not reattach row pans. */
export const ChatScrollGesture = createContext<NativeGesture | null>(null);

export function ChatGestureCoordinator({ children }: { children: ReactElement }) {
  const scrollGesture = useMemo(
    () =>
      Platform.OS === "web"
        ? null
        : Gesture.Native().shouldCancelWhenOutside(false),
    [],
  );
  if (!scrollGesture) return children;
  return (
    <ChatScrollGesture.Provider value={scrollGesture}>
      {/* Attach directly to the existing RN FlatList's native scroll view. Do
          not wrap it in another native View or double-wrap an RNGH FlatList. */}
      <GestureDetector gesture={scrollGesture}>{children}</GestureDetector>
    </ChatScrollGesture.Provider>
  );
}
