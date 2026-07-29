// components/chat/RecordingBar.tsx
/* eslint-disable import/no-named-as-default-member */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from "react-native";
import { icons } from "@/constants";
import theme from "@/constants/theme";
import WaveformBars from "./WaveformBars";

interface WaveformBar {
  height: Animated.Value;
}

interface RecordingBarProps {
  isLocked: boolean;
  recordingDuration: number;
  bars: WaveformBar[];
  barCount: number;
  pulseAnim: Animated.Value;
  recorderBarAnim: Animated.Value;
  cancelSlideAnim: Animated.Value;
  lockSlideAnim: Animated.Value;
  marginBottom: number;
  formatDuration: (s: number) => string;
  onCancel: () => void;
  onSend: () => void;
}

const RecordingBar: React.FC<RecordingBarProps> = ({
  isLocked,
  recordingDuration,
  bars,
  barCount,
  pulseAnim,
  recorderBarAnim,
  cancelSlideAnim,
  lockSlideAnim,
  marginBottom,
  formatDuration,
  onCancel,
  onSend,
}) => {
  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            marginBottom,
            opacity: recorderBarAnim,
            transform: [
              {
                translateY: recorderBarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [60, 0],
                }),
              },
            ],
          },
        ]}
      >
        {!isLocked && (
          <Animated.View
            style={[
              styles.lockIndicator,
              {
                opacity: lockSlideAnim,
                transform: [
                  {
                    translateY: lockSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -45],
                    }),
                  },
                  {
                    scale: lockSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.6, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.lockEmoji}>🔒</Text>
          </Animated.View>
        )}

        {isLocked ? (
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelX}>✕</Text>
          </TouchableOpacity>
        ) : (
          <Animated.View
            style={[
              styles.cancelHint,
              {
                opacity: cancelSlideAnim.interpolate({
                  inputRange: [0, 0.3, 1],
                  outputRange: [0, 0.5, 1],
                }),
                transform: [
                  {
                    translateX: cancelSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -10],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.cancelHintText}>Cancel</Text>
          </Animated.View>
        )}

        <View style={styles.infoRow}>
          <Animated.View style={[styles.redDot, { opacity: pulseAnim }]} />
          <Text style={styles.durationText}>
            {formatDuration(recordingDuration)}
          </Text>
        </View>

        <WaveformBars bars={bars} barCount={barCount} />

        {isLocked ? (
          <TouchableOpacity onPress={onSend} style={styles.sendButton}>
            <Image
              source={icons.send}
              style={[styles.sendIcon, { tintColor: theme.COLORS.textWhite }]}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.slideHintWrapper}>
            <Animated.Text
              style={[
                styles.slideHintText,
                {
                  opacity: cancelSlideAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [1, 0.3, 0],
                  }),
                },
              ]}
            >
              ◀ slide
            </Animated.Text>
          </View>
        )}
      </Animated.View>

      {isLocked && (
        <View style={[styles.lockedHint, { marginBottom }]}>
          <Text style={styles.lockedHintText}>
            Recording locked • tap send or cancel
          </Text>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.COLORS.bgWhite,
    paddingVertical: theme.SPACING.sm + 2,
    paddingHorizontal: theme.SPACING.md,
    marginHorizontal: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xxl,
    minHeight: theme.SIZING.recordingBarMinHeight,
    ...theme.SHADOWS.lg,
  },
  lockIndicator: {
    position: "absolute",
    top: -52,
    right: 12,
    width: theme.SIZING.lockPill,
    height: theme.SIZING.lockPill,
    borderRadius: theme.SIZING.lockPill / 2,
    backgroundColor: theme.COLORS.bgWhite,
    alignItems: "center",
    justifyContent: "center",
    ...theme.SHADOWS.md,
  },
  lockEmoji: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
  },
  cancelButton: {
    width: theme.SIZING.cancelButton,
    height: theme.SIZING.cancelButton,
    borderRadius: theme.SIZING.cancelButton / 2,
    backgroundColor: theme.COLORS.dangerLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.SPACING.sm,
  },
  cancelX: {
    color: theme.COLORS.danger,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  cancelHint: {
    position: "absolute",
    left: theme.SPACING.md,
    top: -22,
  },
  cancelHintText: {
    color: theme.COLORS.danger,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: theme.SPACING.sm,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.COLORS.danger,
    marginRight: theme.SPACING.xs,
  },
  durationText: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    fontVariant: ["tabular-nums"],
    minWidth: 32,
  },
  sendButton: {
    width: theme.SIZING.sendButton,
    height: theme.SIZING.sendButton,
    borderRadius: theme.SIZING.sendButton / 2,
    backgroundColor: theme.COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: theme.SPACING.sm,
    ...theme.SHADOWS.primary,
  },
  sendIcon: {
    width: theme.SIZING.iconSm,
    height: theme.SIZING.iconSm,
  },
  slideHintWrapper: {
    marginLeft: theme.SPACING.xs,
    minWidth: 40,
    alignItems: "center",
  },
  slideHintText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  lockedHint: {
    alignItems: "center",
    paddingVertical: theme.SPACING.xs,
  },
  lockedHintText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
});

export default React.memo(RecordingBar);
