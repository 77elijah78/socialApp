import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceMessageBubbleProps {
  audioUri: string;
  duration: number;
  waveform?: number[];
  isOwn?: boolean;
  timestamp?: string;
  isRead?: boolean;
  style?: ViewStyle;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WAVEFORM_BARS   = 40;
const BAR_WIDTH       = theme.SIZING.sendButton;
const BAR_GAP         = theme.BORDER_RADIUS.sm;
const EQ_BARS         = 5;
const EQ_INTERVAL_MS  = 80;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateWaveform(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
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
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Equalizer Hook ───────────────────────────────────────────────────────────

function useEqualizer(bars: number[], isPlaying: boolean, progress: number) {
  const animValues = useRef<Animated.Value[]>(
    Array.from({ length: bars.length }, () => new Animated.Value(1)),
  ).current;

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (tickRef.current) clearInterval(tickRef.current);
      animValues.forEach(v => Animated.spring(v, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 0 }).start());
      return;
    }

    tickRef.current = setInterval(() => {
      const cursor = Math.round(progress * bars.length);

      animValues.forEach((v, i) => {
        const dist = Math.abs(i - cursor);
        if (dist <= EQ_BARS) {
          const intensity = 1 - dist / (EQ_BARS + 1);
          const lo = Math.max(0.55, 1 - intensity * 0.55);
          const hi = Math.min(1.5, 1 + intensity * 0.6 * (0.5 + Math.random() * 0.5));
          const target = lo + Math.random() * (hi - lo);
          Animated.timing(v, {
            toValue: target,
            duration: EQ_INTERVAL_MS * 0.85,
            useNativeDriver: false,
          }).start();
        } else {
          Animated.timing(v, {
            toValue: 1,
            duration: EQ_INTERVAL_MS,
            useNativeDriver: false,
          }).start();
        }
      });
    }, EQ_INTERVAL_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, progress]);

  return animValues;
}

// ─── Waveform Component ───────────────────────────────────────────────────────

interface WaveformProps {
  bars: number[];
  animValues: Animated.Value[];
  progress: number;
  onSeek?: (progress: number) => void;
}

const Waveform: React.FC<WaveformProps> = ({ bars, animValues, progress, onSeek }) => {
  const playedCount = Math.round(progress * bars.length);

  const handleTouch = useCallback(
    (evt: any) => {
      if (!onSeek) return;
      const { locationX, target } = evt.nativeEvent;
      target.measure((_: number, __: number, width: number) => {
        const p = Math.max(0, Math.min(1, locationX / width));
        onSeek(p);
      });
    },
    [onSeek],
  );

  return (
    <TouchableOpacity
      activeOpacity={theme.OPACITY.pressed}
      onPress={handleTouch}
      style={styles.waveformContainer}
      accessible
      accessibilityLabel="Voice message waveform, tap to seek"
    >
      {bars.map((amplitude, i) => {
        const played = i < playedCount;
        const staticHeight = Math.max(3, (amplitude / 100) * theme.SIZING.waveformHeight);
        const animatedHeight = animValues[i].interpolate({
          inputRange: [0, 2],
          outputRange: [0, theme.SIZING.waveformHeight * 2],
          extrapolate: 'clamp',
        });

        const barHeight = Animated.multiply(animValues[i], staticHeight);

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: played ? theme.COLORS.playedWave : theme.COLORS.unplayedWave,
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
  duration,
  waveform,
  isOwn = false,
  timestamp,
  isRead = false,
  style,
}) => {

  const bars = waveform && waveform.length >= 10
    ? waveform
    : generateWaveform(audioUri, WAVEFORM_BARS);

  const player = useAudioPlayer({ uri: audioUri });
  const playerStatus = useAudioPlayerStatus(player);

  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed]   = useState(0);

  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });

    return () => {
      try {
        player.pause();
        player.remove();
      } catch (e) {
       // prevent crash if already removed
      }
    };
  }, []);

  useEffect(() => {
    if (!playerStatus) return;

    const pos = playerStatus.currentTime ?? 0;
    const dur = playerStatus.duration && playerStatus.duration > 0
      ? playerStatus.duration
      : duration;

    setElapsed(pos);
    setProgress(dur > 0 ? pos / dur : 0);

    if (playerStatus.didJustFinish) {
      setStatus('idle');
      setProgress(0);
      setElapsed(0);
    } else if (playerStatus.playing) {
      setStatus('playing');
    } else if (status === 'loading' || status === 'playing') {
      setStatus('paused');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerStatus]);

  const handlePlayPause = async () => {
    try {
      if (status === 'playing') {
        player.pause();
        setStatus('paused');
        return;
      }
      if (status === 'paused') {
        player.play();
        setStatus('playing');
        return;
      }
      setStatus('loading');
      player.seekTo(0);
      player.play();
    } catch {
      setStatus('error');
    }
  };

  const handleSeek = (p: number) => {
    const dur = (playerStatus?.duration && playerStatus.duration > 0)
      ? playerStatus.duration
      : duration;
    player.seekTo(p * dur);
    setProgress(p);
    setElapsed(p * dur);
  };

  const isPlaying = status === 'playing';
  const animValues = useEqualizer(bars, isPlaying, progress);

  const displayTime = status === 'idle' ? formatTime(duration) : formatTime(elapsed);

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther, style]}>
      <View style={[
        styles.bubble,
        isOwn ? styles.bubbleOwn : styles.bubbleOther,
      ]}>

        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playBtn}
          activeOpacity={theme.OPACITY.pressed}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause voice message' : 'Play voice message'}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <ActivityIndicator size="small" color={theme.COLORS.textWhite} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
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
                    name={isRead ? 'checkmark-done' : 'checkmark'}
                    size={theme.SIZING.avatarXs}
                    color={isRead ? theme.COLORS.playedWave : theme.COLORS.unplayedWave}
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: theme.SPACING.xs,
  },
  rowOther: {
    justifyContent: 'flex-end',
  },
  rowOwn: {
    justifyContent: 'flex-start',
  },

  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  right: {
    flex: 1,
    gap: theme.SPACING.sm,
  },

  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: theme.SIZING.waveformHeight,
    maxHeight: theme.SIZING.waveformHeight,
    overflow: 'hidden',
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: theme.BORDER_RADIUS.xs,
    minHeight: 3,
  },

  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  durationText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textBlack,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
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

export default VoiceMessageBubble;
