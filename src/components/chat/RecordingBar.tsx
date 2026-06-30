// components/chat/RecordingBar.tsx
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
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/constants/theme";
import WaveformBars from "./WaveformBars";

// ─── Define types LOCALLY (not imported from hook) ──────────────
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
        {/* Lock indicator */}
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

        {/* Left side */}
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

        {/* Dot + duration */}
        <View style={styles.infoRow}>
          <Animated.View style={[styles.redDot, { opacity: pulseAnim }]} />
          <Text style={styles.durationText}>
            {formatDuration(recordingDuration)}
          </Text>
        </View>

        {/* Waveform */}
        <WaveformBars bars={bars} barCount={barCount} />

        {/* Right side */}
        {isLocked ? (
          <TouchableOpacity onPress={onSend} style={styles.sendButton}>
            <Image
              source={icons.send}
              style={[styles.sendIcon, { tintColor: COLORS.textWhite }]}
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
    backgroundColor: COLORS.bgWhite,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    marginHorizontal: SPACING.sm,
    borderRadius: RADIUS.xxl,
    minHeight: 54,
    ...SHADOW.lg,
  },
  lockIndicator: {
    position: "absolute",
    top: -52,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgWhite,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.md,
  },
  lockEmoji: {
    fontSize: 18,
  },
  cancelButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.dangerLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  cancelX: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: FONT.bold,
  },
  cancelHint: {
    position: "absolute",
    left: SPACING.md,
    top: -22,
  },
  cancelHintText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: FONT.semibold,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: SPACING.sm,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    marginRight: 6,
  },
  durationText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: FONT.semibold,
    fontVariant: ["tabular-nums"],
    minWidth: 32,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.sm,
    ...SHADOW.primary,
  },
  sendIcon: {
    width: 18,
    height: 18,
  },
  slideHintWrapper: {
    marginLeft: SPACING.xs,
    minWidth: 40,
    alignItems: "center",
  },
  slideHintText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: FONT.medium,
  },
  lockedHint: {
    alignItems: "center",
    paddingVertical: SPACING.xs,
  },
  lockedHintText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: FONT.medium,
  },
});

export default React.memo(RecordingBar);
