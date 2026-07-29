// components/chat/RecordingOverlay.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import theme from "@/constants/theme";

interface Props {
  recording: boolean;
  locked: boolean;
  seconds: number;
  fmt: (s: number) => string;
  slide: Animated.Value;
  lockY: Animated.Value;
  onCancel: () => void;
  onSend: () => void;
  marginBottom?: number;
}

const RecordingOverlay: React.FC<Props> = ({
  recording,
  locked,
  seconds,
  fmt,
  slide,
  lockY,
  onCancel,
  onSend,
  marginBottom = 0,
}) => {
  if (!recording) return null;

  return (
    <Animated.View
      style={[
        styles.root,
        {
          marginBottom,
          opacity: slide,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Lock hint (only while holding, not locked yet) */}
      {!locked && (
        <Animated.View
          style={[
            styles.lockPill,
            {
              opacity: lockY.interpolate({
                inputRange: [0, 0.3, 1],
                outputRange: [0.5, 0.8, 1],
              }),
              transform: [
                {
                  translateY: lockY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -12],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.lockIcon}>🔒</Text>
        </Animated.View>
      )}

      <View style={styles.bar}>
        {/* Red dot + timer */}
        <View style={styles.timerRow}>
          <View style={styles.dot} />
          <Text style={styles.time}>{fmt(seconds)}</Text>
        </View>

        {/* Center: slide hint or locked label */}
        <View style={styles.center}>
          {locked ? (
            <Text style={styles.lockedText}>Recording locked</Text>
          ) : (
            <Text style={styles.slideText}>{"‹  Slide to cancel"}</Text>
          )}
        </View>

        {/* Right: actions when locked */}
        {locked && (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.deleteBtn}
              activeOpacity={0.6}
            >
              <Text style={styles.deleteTxt}>🗑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSend}
              style={styles.sendBtn}
              activeOpacity={0.6}
            >
              <Text style={styles.sendTxt}>➤</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  lockPill: {
    position: "absolute",
    top: -55,
    right: theme.SPACING.xl,
    width: theme.SIZING.iconLg,
    height: theme.SIZING.lockPill,
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    backgroundColor: theme.COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  lockIcon: { fontSize: theme.TYPOGRAPHY.fontSize.xxxl },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.COLORS.white,
    paddingVertical: 14,
    paddingHorizontal: theme.SPACING.xl,
    borderTopWidth: 0.5,
    borderTopColor: theme.COLORS.borderTopDark,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: theme.BORDER_RADIUS.sm,
    backgroundColor: theme.COLORS.red,
    marginRight: 6,
  },
  time: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textLocked,
    fontVariant: ["tabular-nums"],
    minWidth: 34,
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
  slideText: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textSlide,
  },
  lockedText: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.green,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteBtn: {
    width: theme.SIZING.deleteButton,
    height: theme.SIZING.deleteButton,
    borderRadius: 19,
    backgroundColor: theme.COLORS.deleteBtnBg,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteTxt: { fontSize: theme.TYPOGRAPHY.fontSize.xxxl },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxl,
    backgroundColor: theme.COLORS.green,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.COLORS.sendBtnShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  sendTxt: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    color: theme.COLORS.white,
  },
});

export default React.memo(RecordingOverlay);