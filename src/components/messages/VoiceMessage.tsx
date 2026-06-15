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

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceMessageBubbleProps {
  audioUri: string;
  /** Total duration in seconds */
  duration: number;
  /**
   * Waveform amplitude data — 30 to 50 values, each 0–100.
   * If omitted a deterministic waveform is generated from the URI.
   */
  waveform?: number[];
  /** Right-aligned outgoing style when true */
  isOwn?: boolean;
  /** Display time string, e.g. "14:32" */
  timestamp?: string;
  /** Show read receipts (outgoing only) */
  isRead?: boolean;
  style?: ViewStyle;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WAVEFORM_BARS   = 40;
const BUBBLE_COLOR    = '#f0ecf9';
const PLAYED_COLOR    = '#7b7fe8';
const UNPLAYED_COLOR  = 'rgba(141, 141, 141, 0.38)';
const PLAY_BTN_COLOR  = '#6366f1';
const BAR_WIDTH       = 2;
const BAR_GAP         = 2;

// Equalizer: how many center bars animate as a "live" visualizer
const EQ_BARS         = 5;   // bars on each side of the cursor that pulse
const EQ_INTERVAL_MS  = 80;  // animation tick

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
// Drives per-bar Animated.Values so bars near the playhead pulse while playing.

function useEqualizer(bars: number[], isPlaying: boolean, progress: number) {
  const animValues = useRef<Animated.Value[]>(
    Array.from({ length: bars.length }, () => new Animated.Value(1)),
  ).current;

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (tickRef.current) clearInterval(tickRef.current);
      // Reset all bars to their static height
      animValues.forEach(v => Animated.spring(v, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 0 }).start());
      return;
    }

    tickRef.current = setInterval(() => {
      const cursor = Math.round(progress * bars.length);

      animValues.forEach((v, i) => {
        const dist = Math.abs(i - cursor);
        if (dist <= EQ_BARS) {
          // Bars close to the playhead pulse between 0.6× and 1.4× their height
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
  progress: number; // 0–1
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
      activeOpacity={0.9}
      onPress={handleTouch}
      style={styles.waveformContainer}
      accessible
      accessibilityLabel="Voice message waveform, tap to seek"
    >
      {bars.map((amplitude, i) => {
        const played = i < playedCount;
        const staticHeight = Math.max(3, (amplitude / 100) * 32);
        const animatedHeight = animValues[i].interpolate({
          inputRange: [0, 2],
          outputRange: [0, 64],
          extrapolate: 'clamp',
        });

        // Scale the static height by the animated multiplier
        const barHeight = Animated.multiply(animValues[i], staticHeight);

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: played ? PLAYED_COLOR : UNPLAYED_COLOR,
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

  // expo-audio player
  const player = useAudioPlayer({ uri: audioUri });
  const playerStatus = useAudioPlayerStatus(player);

  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed]   = useState(0);

  // Configure audio session once
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

  // Sync UI state from playerStatus
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
      // Fresh play
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

        {/* Play / Pause button */}
        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause voice message' : 'Play voice message'}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={18}
              color="#fff"
            />
          )}
        </TouchableOpacity>

        {/* Waveform + meta */}
        <View style={styles.right}>
          <Waveform
            bars={bars}
            animValues={animValues}
            progress={progress}
            onSeek={handleSeek}
          />

          {/* Duration + timestamp row */}
          <View style={styles.meta}>
            <Text style={styles.durationText}>{displayTime}</Text>
            {timestamp && (
              <View style={styles.timestampRow}>
                <Text style={styles.timestampText}>{timestamp}</Text>
                {isOwn && (
                  <Ionicons
                    name={isRead ? 'checkmark-done' : 'checkmark'}
                    size={13}
                    color={isRead ? PLAYED_COLOR : UNPLAYED_COLOR}
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
    marginVertical: 3,
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: '80%',
    backgroundColor: BUBBLE_COLOR,
    gap: 10,
  },
  bubbleOther: {
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bubbleOwn: {
    borderRadius: 16,
    borderBottomRightRadius: 4,
  },

  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PLAY_BTN_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  right: {
    flex: 1,
    gap: 4,
  },

  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    maxHeight: 32,
    overflow: 'hidden',
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 2,
    minHeight: 3,
  },

  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  durationText: {
    fontSize: 11,
    color: 'black',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  timestampText: {
    fontSize: 11,
    color: 'rgba(141,141,141,0.8)',
  },
  tick: {
    marginLeft: 1,
  },
});

export default VoiceMessageBubble;