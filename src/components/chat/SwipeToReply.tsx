import { memo, useContext, useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING } from "@/constants/theme";
import {
  REPLY_SWIPE,
  replySwipeIntent,
  shouldReplyFromSwipe,
  type ReplySwipeIntent,
} from "@/utils/messaging/swipeReply";
import { ChatScrollGesture } from "./ChatGestureCoordinator";

type SwipeTracking = {
  pointerId: number | null;
  originX: number;
  originY: number;
  intent: ReplySwipeIntent;
  active: boolean;
};
const EMPTY_SWIPE: SwipeTracking = {
  pointerId: null,
  originX: 0,
  originY: 0,
  intent: "pending",
  active: false,
};

/** Lock direction once on the UI thread, then allow natural finger drift.
 * Fail vertical/right intent promptly to release the native list. No simultaneous
 * scroll/reply or JS callbacks on movement; taps/long presses stay pending.
 * Zoom/fullscreen players are separate native views/routes. */
function SwipeToReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const scrollGesture = useContext(ChatScrollGesture);
  const translation = useSharedValue(0);
  const tracking = useSharedValue<SwipeTracking>(EMPTY_SWIPE);
  const gesture = useMemo(() => {
    // Reanimated's setGestureState is native-only. Keep automatic recognition
    // and browser pan-y scrolling on web instead of invoking its no-op manager.
    const manual = Platform.OS !== "web";
    const pan = Gesture.Pan()
      .enabled(enabled)
      .maxPointers(1)
      .manualActivation(manual)
      .onTouchesDown((event, manager) => {
        const touch = event.allTouches[0];
        const state = tracking.get();
        if (
          event.numberOfTouches !== 1 ||
          !touch ||
          state.pointerId !== null ||
          !Number.isFinite(touch.absoluteX) ||
          !Number.isFinite(touch.absoluteY)
        ) {
          tracking.set({ ...state, intent: "scroll", active: false });
          if (manual) manager.fail();
          return;
        }
        tracking.set({
          pointerId: touch.id,
          originX: touch.absoluteX,
          originY: touch.absoluteY,
          intent: "pending",
          active: false,
        });
        translation.set(0);
      })
      .onTouchesMove((event, manager) => {
        const state = tracking.get();
        const touch = event.allTouches[0];
        if (
          event.numberOfTouches !== 1 ||
          !touch ||
          touch.id !== state.pointerId ||
          !Number.isFinite(touch.absoluteX) ||
          !Number.isFinite(touch.absoluteY)
        ) {
          tracking.set({ ...state, intent: "scroll", active: false });
          if (manual) manager.fail();
          return;
        }
        if (state.intent !== "pending") return;
        const intent = replySwipeIntent(
          touch.absoluteX - state.originX,
          touch.absoluteY - state.originY,
        );
        if (intent === "pending") return;
        tracking.set({ ...state, intent });
        if (manual) {
          if (intent === "reply") manager.activate();
          else manager.fail();
        }
      })
      .onTouchesUp((_event, manager) => {
        if (manual && tracking.get().intent === "pending") manager.fail();
      })
      .onTouchesCancelled(() => {
        const state = tracking.get();
        tracking.set({ ...state, intent: "scroll", active: false });
      })
      .onStart((event) => {
        const state = tracking.get();
        // Web delivers automatic activation before its pointer-move callback.
        const intent =
          !manual && state.intent === "pending"
            ? replySwipeIntent(
                event.absoluteX - state.originX,
                event.absoluteY - state.originY,
              )
            : state.intent;
        if (state.pointerId !== null && intent === "reply")
          tracking.set({ ...state, intent, active: true });
      })
      .onUpdate((event) => {
        const state = tracking.get();
        const x = event.absoluteX - state.originX;
        if (state.active && Number.isFinite(x))
          translation.set(Math.max(-REPLY_SWIPE.maximum, Math.min(0, x)));
      })
      .onEnd((event, success) => {
        const state = tracking.get();
        tracking.set({ ...state, active: false });
        if (
          success &&
          state.intent === "reply" &&
          shouldReplyFromSwipe(
            event.absoluteX - state.originX,
            event.absoluteY - state.originY,
            state.active,
          )
        )
          runOnJS(onReply)();
      })
      .onFinalize(() => {
        tracking.set(EMPTY_SWIPE);
        translation.set(
          withSpring(0, { damping: 22, stiffness: 260, mass: 0.7 }),
        );
      });
    // The list waits only for a touched row's intent decision, not every mounted
    // row. Vertical/right/tap failure releases it; a left lock owns this stream.
    if (scrollGesture) pan.blocksExternalGesture(scrollGesture);
    if (!manual)
      pan
        .activeOffsetX(-REPLY_SWIPE.activate)
        .failOffsetX(REPLY_SWIPE.release)
        .failOffsetY([-REPLY_SWIPE.activate, REPLY_SWIPE.activate]);
    return pan;
  }, [enabled, onReply, scrollGesture, tracking, translation]);
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.get() }],
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: Math.min(
      1,
      Math.max(
        0,
        (-translation.get() - REPLY_SWIPE.activate) /
          (REPLY_SWIPE.complete - REPLY_SWIPE.activate),
      ),
    ),
    transform: [
      {
        scale:
          0.8 + Math.min(1, -translation.get() / REPLY_SWIPE.complete) * 0.2,
      },
    ],
  }));
  return (
    <View style={styles.frame}>
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, indicatorStyle]}
      >
        <Ionicons name="arrow-undo-outline" size={22} color={COLORS.primary} />
      </Animated.View>
      <GestureDetector gesture={gesture} touchAction="pan-y">
        <Animated.View collapsable={false} style={bubbleStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
export default memo(SwipeToReply);
const styles = StyleSheet.create({
  frame: { width: "100%" },
  indicator: {
    position: "absolute",
    right: SPACING.xl,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
