import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface VoiceMessageBubbleProps {
  audioUri: string;
  /** Total duration in seconds */
  duration: number;
  /**
   * Waveform amplitude data — 30 to 50 values, each 0–100.
   * If omitted a random-looking static waveform is generated.
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
 
const WAVEFORM_BARS = 40;
const BUBBLE_OWN = '#f0ecf9';
const BUBBLE_OTHER = '#f0ecf9';
const PLAYED_OWN = '#7b7fe8';
const PLAYED_OTHER = '#7b7fe8';
const UNPLAYED_OWN = 'rgba(141, 141, 141, 0.38)';
const UNPLAYED_OTHER = 'rgba(141, 141, 141, 0.38)';
const AVATAR_BG = '#5b5fcf';
const BAR_WIDTH = 2;
const BAR_GAP = 2;
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
/** Seed a deterministic-looking waveform from the uri string */
function generateWaveform(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Array.from({ length: count }, (_, i) => {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const base = 10 + ((Math.abs(h) % 60));
    // slight envelope: taper at edges
    const edge = Math.min(i, count - 1 - i) / (count * 0.15);
    return Math.round(Math.min(100, base * Math.min(1, edge + 0.4)));
  });
}
 
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
 
// ─── Sub-components ───────────────────────────────────────────────────────────
 
interface WaveformProps {
  bars: number[];
  progress: number; // 0–1
  isOwn: boolean;
  onSeek?: (progress: number) => void;
}
 
const Waveform: React.FC<WaveformProps> = ({ bars, progress, isOwn, onSeek }) => {
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
        const heightPct = Math.max(0.12, amplitude / 100);
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: `${heightPct * 100}%` as any,
                backgroundColor: played
                  ? isOwn ? PLAYED_OWN : PLAYED_OTHER
                  : isOwn ? UNPLAYED_OWN : UNPLAYED_OTHER,
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
 
  const soundRef = useRef<Audio.Sound | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0); // 0–1
  const [elapsed, setElapsed] = useState(0);   // seconds
 
  // Configure audio session once
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);
 
  const onPlaybackUpdate = useCallback((s: AVPlaybackStatus) => {
    if (!s.isLoaded) {
      if (s.error) setStatus('error');
      return;
    }
    const pos = s.positionMillis / 1000;
    const dur = (s.durationMillis ?? duration * 1000) / 1000;
    setElapsed(pos);
    setProgress(dur > 0 ? pos / dur : 0);
 
    if (s.didJustFinish) {
      setStatus('idle');
      setProgress(0);
      setElapsed(0);
      soundRef.current?.setPositionAsync(0);
    } else if (s.isPlaying) {
      setStatus('playing');
    } else if (status === 'playing') {
      setStatus('paused');
    }
  }, [duration, status]);
 
  const handlePlayPause = async () => {
    try {
      if (status === 'playing') {
        await soundRef.current?.pauseAsync();
        setStatus('paused');
        return;
      }
 
      if (status === 'paused' && soundRef.current) {
        await soundRef.current.playAsync();
        setStatus('playing');
        return;
      }
 
      // Fresh load
      setStatus('loading');
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
 
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 80 },
        onPlaybackUpdate,
      );
      soundRef.current = sound;
      setStatus('playing');
    } catch {
      setStatus('error');
    }
  };
 
  const handleSeek = async (p: number) => {
    if (!soundRef.current) return;
    const s = await soundRef.current.getStatusAsync();
    if (!s.isLoaded || !s.durationMillis) return;
    const pos = p * s.durationMillis;
    await soundRef.current.setPositionAsync(pos);
    setProgress(p);
    setElapsed((pos / 1000));
  };
 
  const displayTime = status === 'idle' ? formatTime(duration) : formatTime(elapsed);
 
  const bubbleBg = isOwn ? BUBBLE_OWN : BUBBLE_OTHER;
 
  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther, style]}>
      
      <View style={[styles.bubble, { backgroundColor: bubbleBg }, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {/* Play / Pause button */}
        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={status === 'playing' ? 'Pause voice message' : 'Play voice message'}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={status === 'playing' ? 'pause' : 'play'}
              size={18}
              color="#fff"
            />
          )}
        </TouchableOpacity>
 
        {/* Waveform + meta */}
        <View style={styles.right}>
          <Waveform
            bars={bars}
            progress={progress}
            isOwn={isOwn}
            onSeek={handleSeek}
          />
          <View style={styles.meta}>
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
  // Bubble
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: '80%',
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
 
  // Play button
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
 
  // Right column (waveform + meta)
  right: {
    flex: 1,
    gap: 4,
  },
 
  // Waveform
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    maxHeight: 32,
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 2,
    minHeight: 3,
  },
 
  // Meta row
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
    color: 'rgba(255,255,255,0.45)',
  },
  tick: {
    marginLeft: 1,
  },
});
 
export default VoiceMessageBubble;