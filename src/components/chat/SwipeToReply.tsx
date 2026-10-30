import { memo, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
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
  shouldReplyFromSwipe,
} from "@/utils/messaging/swipeReply";

/** Horizontal intent must win before activation; vertical scrolling, taps and
 * long presses remain with their existing responders. Zoom/fullscreen players
 * are separate native views/routes, never descendants of this row's detector. */
function SwipeToReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const translation = useSharedValue(0);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .maxPointers(1)
        .activeOffsetX(-REPLY_SWIPE.activate)
        .failOffsetX(12)
        .failOffsetY([
          -REPLY_SWIPE.verticalFailure,
          REPLY_SWIPE.verticalFailure,
        ])
        .onUpdate((event) => {
          translation.set(
            Math.max(-REPLY_SWIPE.maximum, Math.min(0, event.translationX)),
          );
        })
        .onEnd((event, success) => {
          if (
            success &&
            shouldReplyFromSwipe(event.translationX, event.translationY)
          )
            runOnJS(onReply)();
        })
        .onFinalize(() => {
          translation.set(
            withSpring(0, { damping: 22, stiffness: 260, mass: 0.7 }),
          );
        }),
    [enabled, onReply, translation],
  );
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
      <GestureDetector gesture={gesture}>
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
