import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";
import { useChatMediaPlayback } from "@/hooks/useChatMediaPlayback";
import { useMediaVisibility } from "@/utils/messaging/mediaVisibility";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceMessageBubbleProps {
  audioUri: string;
  playbackId?: string;
  duration: number;
  waveform?: number[];
  isOwn?: boolean;
  timestamp?: string;
  isRead?: boolean;
  style?: ViewStyle;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WAVEFORM_BARS = 40;
const BAR_WIDTH = 3;
const BAR_GAP = theme.BORDER_RADIUS.sm;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateWaveform(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++)
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Array.from({ length: count }, (_, i) => {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const base = 10 + (Math.abs(h) % 60);
    const edge = Math.min(i, count - 1 - i) / (count * 0.15);
    return Math.round(Math.min(100, base * Math.min(1, edge + 0.4)));
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Equalizer Hook ───────────────────────────────────────────────────────────

function useEqualizer(count: number, isPlaying: boolean) {
  const [values] = useState(() =>
    Array.from({ length: count }, () => new Animated.Value(1)),
  );
  useEffect(() => {
    if (!isPlaying) {
      values.forEach((value) => value.setValue(1));
      return;
    }
    const animations = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 0.6 + (index % 5) * 0.15,
            duration: 180 + (index % 3) * 50,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 1.2,
            duration: 220,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [isPlaying, values]);
  return values;
}

// ─── Waveform Component ───────────────────────────────────────────────────────

interface WaveformProps {
  bars: number[];
  animValues: Animated.Value[];
  progress: number;
  onSeek?: (progress: number) => void;
}

const Waveform: React.FC<WaveformProps> = ({
  bars,
  animValues,
  progress,
  onSeek,
}) => {
  const playedCount = Math.round(progress * bars.length);

  const trackWidth = useRef(1);
  const handleTouch = useCallback(
    (event: { nativeEvent: { locationX: number } }) => {
      onSeek?.(
        Math.max(
          0,
          Math.min(1, event.nativeEvent.locationX / trackWidth.current),
        ),
      );
    },
    [onSeek],
  );

  return (
    <TouchableOpacity
      activeOpacity={theme.OPACITY.pressed}
      onPress={handleTouch}
      onLayout={(event) => {
        trackWidth.current = Math.max(1, event.nativeEvent.layout.width);
      }}
      style={styles.waveformContainer}
      accessible
      accessibilityLabel="Voice message waveform, tap to seek"
    >
      {bars.map((amplitude, i) => {
        const played = i < playedCount;
        const staticHeight = Math.max(
          3,
          (amplitude / 100) * theme.SIZING.waveformHeight,
        );

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height: staticHeight,
                transform: [{ scaleY: animValues[i] }],
                backgroundColor: played
                  ? theme.COLORS.playedWave
                  : theme.COLORS.unplayedWave,
              },
            ]}
          />
        );
      })}
    </TouchableOpacity>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({
  audioUri,
  playbackId,
  duration,
  waveform,
  isOwn = false,
  timestamp,
  isRead = false,
  style,
}) => {
  const bars = useMemo(
    () =>
      waveform && waveform.length >= 10
        ? waveform
        : generateWaveform(audioUri, WAVEFORM_BARS),
    [waveform, audioUri],
  );
  const visible = useMediaVisibility(playbackId);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const loaded = useRef(false);
  const [failed, setFailed] = useState(false);
  const isPlaying = Boolean(playerStatus.playing);
  const elapsed = playerStatus.currentTime ?? 0;
  const actualDuration =
    playerStatus.duration > 0 ? playerStatus.duration : duration;
  const progress = actualDuration > 0 ? elapsed / actualDuration : 0;
  const status = failed
    ? "error"
    : playerStatus.isBuffering
      ? "loading"
      : isPlaying
        ? "playing"
        : elapsed > 0
          ? "paused"
          : "idle";
  const animValues = useEqualizer(bars.length, isPlaying && visible);
  const canPlay = useChatMediaPlayback(player, visible);
  const handlePlayPause = async () => {
    try {
      setFailed(false);
      if (player.playing) {
        player.pause();
        return;
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      if (!canPlay()) return;
      if (!loaded.current) {
        player.replace({ uri: audioUri });
        loaded.current = true;
      }
      if (playerStatus.didJustFinish) await player.seekTo(0);
      if (canPlay()) player.play();
    } catch {
      setFailed(true);
    }
  };
  const handleSeek = (position: number) => {
    if (loaded.current)
      void player
        .seekTo(position * actualDuration)
        .catch(() => setFailed(true));
  };
  const displayTime =
    status === "idle" ? formatTime(actualDuration) : formatTime(elapsed);

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther, style]}>
      <View
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
      >
        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playBtn}
          activeOpacity={theme.OPACITY.pressed}
          accessibilityRole="button"
          accessibilityLabel={
            isPlaying ? "Pause voice message" : "Play voice message"
          }
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <ActivityIndicator size="small" color={theme.COLORS.textWhite} />
          ) : (
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={theme.SIZING.avatarXs}
              color={theme.COLORS.textWhite}
            />
          )}
        </TouchableOpacity>

        <View style={styles.right}>
          <Waveform
            bars={bars}
            animValues={animValues}
            progress={progress}
            onSeek={handleSeek}
          />

          <View style={styles.meta}>
            <Text style={styles.durationText}>{displayTime}</Text>
            {timestamp && (
              <View style={styles.timestampRow}>
                <Text style={styles.timestampText}>{timestamp}</Text>
                {isOwn && (
                  <Ionicons
                    name={isRead ? "checkmark-done" : "checkmark"}
                    size={theme.SIZING.avatarXs}
                    color={
                      isRead
                        ? theme.COLORS.playedWave
                        : theme.COLORS.unplayedWave
                    }
                    style={styles.tick}
                  />
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: theme.SPACING.xs,
  },
  rowOther: {
    justifyContent: "flex-end",
  },
  rowOwn: {
    justifyContent: "flex-start",
  },

  bubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.lg,
    width: theme.SIZING.messageWidth,
    backgroundColor: theme.COLORS.bubbleBg,
    gap: theme.SPACING.lg,
  },
  bubbleOther: {
    borderRadius: theme.BORDER_RADIUS.xxxl,
    borderBottomLeftRadius: theme.BORDER_RADIUS.sm,
  },
  bubbleOwn: {
    borderRadius: theme.BORDER_RADIUS.xxxl,
    borderBottomRightRadius: theme.BORDER_RADIUS.sm,
  },

  playBtn: {
    width: theme.SIZING.voicePlayButton,
    height: theme.SIZING.voicePlayButton,
    borderRadius: theme.SIZING.voicePlayButton / 2,
    backgroundColor: theme.COLORS.playedWave,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  right: {
    flex: 1,
    gap: theme.SPACING.sm,
  },

  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: theme.SIZING.waveformHeight,
    maxHeight: theme.SIZING.waveformHeight,
    overflow: "hidden",
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: theme.BORDER_RADIUS.xs,
    minHeight: 3,
  },

  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  durationText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textBlack,
  },
  timestampRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.BORDER_RADIUS.xs,
  },
  timestampText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.unplayedWave,
  },
  tick: {
    marginLeft: theme.BORDER_RADIUS.xs,
  },
});

export default React.memo(VoiceMessageBubble);
