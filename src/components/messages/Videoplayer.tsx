import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface VideoPlayerProps {
  uri: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  borderRadius?: number;
  style?: ViewStyle;
}
 
// ─── Constants ────────────────────────────────────────────────────────────────
 
const ACCENT          = '#ffffff';
const CONTROLS_BG     = 'rgba(0,0,0,0.45)';
const SEEK_TRACK      = 'rgba(255,255,255,0.3)';
const SEEK_FILLED     = '#ffffff';
const SEEK_THUMB      = '#ffffff';
const SPEED_OPTIONS   = [0.5, 1, 1.5, 2] as const;
type SpeedOption      = typeof SPEED_OPTIONS[number];
const HIDE_CONTROLS_MS = 3000;
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}
 
// ─── Seek Bar ─────────────────────────────────────────────────────────────────
 
interface SeekBarProps {
  progress: number;       // 0–1
  buffered?: number;      // 0–1
  onSeek: (p: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
}
 
const SeekBar: React.FC<SeekBarProps> = ({ progress, buffered = 0, onSeek, onSeekStart, onSeekEnd }) => {
  const trackRef = useRef<View>(null);
  const trackWidth = useRef(0);
 
  const computeSeek = (x: number) => {
    const p = Math.max(0, Math.min(1, x / trackWidth.current));
    onSeek(p);
  };
 
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        onSeekStart();
        computeSeek(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => {
        computeSeek(e.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        onSeekEnd();
      },
    }),
  ).current;
 
  return (
    <View
      ref={trackRef}
      style={styles.seekTrack}
      onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
      {...panResponder.panHandlers}
    >
      {/* Buffered */}
      <View style={[styles.seekBuffered, { width: `${buffered * 100}%` }]} />
      {/* Played */}
      <View style={[styles.seekFilled, { width: `${progress * 100}%` }]} />
      {/* Thumb */}
      <View style={[styles.seekThumb, { left: `${progress * 100}%` as any }]} />
    </View>
  );
};
 
// ─── Controls Overlay ─────────────────────────────────────────────────────────
 
interface ControlsProps {
  visible: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  progress: number;
  buffered: number;
  elapsed: number;
  duration: number;
  speed: SpeedOption;
  isFullscreen: boolean;
  onPlayPause: () => void;
  onSeek: (p: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onSpeedPress: () => void;
  onFullscreen: () => void;
}
 
const Controls: React.FC<ControlsProps> = ({
  visible, isPlaying, isLoading, progress, buffered,
  elapsed, duration, speed, isFullscreen,
  onPlayPause, onSeek, onSeekStart, onSeekEnd, onSpeedPress, onFullscreen,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
 
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible]);
 
  return (
    <Animated.View style={[styles.controlsOverlay, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Center play/pause */}
      <TouchableOpacity onPress={onPlayPause} style={styles.centerBtn} activeOpacity={0.8}>
        {isLoading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={38} color="#fff" />
        )}
      </TouchableOpacity>
 
      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <SeekBar
          progress={progress}
          buffered={buffered}
          onSeek={onSeek}
          onSeekStart={onSeekStart}
          onSeekEnd={onSeekEnd}
        />
        <View style={styles.bottomRow}>
          {/* Timer */}
          <Text style={styles.timer}>
            {formatTime(elapsed)}
            <Text style={styles.timerTotal}> / {formatTime(duration)}</Text>
          </Text>
 
          <View style={styles.rightControls}>
            {/* Speed */}
            <TouchableOpacity onPress={onSpeedPress} style={styles.speedBtn} activeOpacity={0.7}>
              <Text style={styles.speedText}>{speed}×</Text>
            </TouchableOpacity>
 
            {/* Fullscreen */}
            <TouchableOpacity onPress={onFullscreen} style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons
                name={isFullscreen ? 'contract' : 'expand'}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};
 
// ─── Main Component ───────────────────────────────────────────────────────────
 
const VideoPlayer: React.FC<VideoPlayerProps> = ({
  uri,
  width,
  height,
  thumbnail,
  borderRadius = 12,
  style,
}) => {
  const screen = Dimensions.get('window');
  const inlineWidth  = width  ?? screen.width * 0.75;
  const inlineHeight = height ?? inlineWidth * (9 / 16);
 
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
  });
 
  const [isPlaying, setIsPlaying]       = useState(false);
  const [isLoading, setIsLoading]       = useState(true);
  const [progress, setProgress]         = useState(0);
  const [buffered, setBuffered]         = useState(0);
  const [elapsed, setElapsed]           = useState(0);
  const [duration, setDuration]         = useState(0);
  const [speed, setSpeed]               = useState<SpeedOption>(1);
  const [showControls, setShowControls] = useState(false);
  const [isSeeking, setIsSeeking]       = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
 
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
 
  // ── Progress polling ──────────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = setInterval(async () => {
      if (isSeeking) return;
      try {
        const status = player.status;
        if (status === 'readyToPlay') setIsLoading(false);
        if (status === 'loading') setIsLoading(true);
 
        const pos = player.currentTime ?? 0;
        const dur = player.duration ?? 0;
        setElapsed(pos);
        setDuration(dur);
        setProgress(dur > 0 ? pos / dur : 0);
        setIsPlaying(player.playing);
 
        // buffered: expo-video doesn't expose buffered ranges directly,
        // so we estimate 15s ahead of playhead as a visual hint
        if (dur > 0) setBuffered(Math.min(1, (pos + 15) / dur));
      } catch {
        // player may not be ready yet
      }
    }, 250);
 
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [player, isSeeking]);
 
  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), HIDE_CONTROLS_MS);
  }, []);
 
  const handleTap = useCallback(() => {
    setShowControls(prev => {
      if (!prev) scheduleHide();
      else if (hideTimer.current) clearTimeout(hideTimer.current);
      return !prev;
    });
  }, [scheduleHide]);
 
  // ── Play / Pause ──────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
    scheduleHide();
  }, [player, scheduleHide]);
 
  // ── Seek ──────────────────────────────────────────────────────────────────
  const handleSeek = useCallback((p: number) => {
    const dur = player.duration ?? 0;
    player.seekBy((p * dur) - (player.currentTime ?? 0));
    setProgress(p);
    setElapsed(p * dur);
  }, [player]);
 
  const handleSeekStart = useCallback(() => {
    setIsSeeking(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
 
  const handleSeekEnd = useCallback(() => {
    setIsSeeking(false);
    scheduleHide();
  }, [scheduleHide]);
 
  // ── Speed ─────────────────────────────────────────────────────────────────
  const handleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
    player.playbackRate = next;
    scheduleHide();
  }, [speed, player, scheduleHide]);
 
  // ── Fullscreen ────────────────────────────────────────────────────────────
  const handleFullscreen = useCallback(async () => {
    if (!isFullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
    setIsFullscreen(f => !f);
    scheduleHide();
  }, [isFullscreen, scheduleHide]);
 
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (tickRef.current)   clearInterval(tickRef.current);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);
 
  // ── Shared player view ────────────────────────────────────────────────────
  const renderPlayer = (w: number, h: number, fs: boolean) => (
    <Pressable
      onPress={handleTap}
      style={[
        styles.container,
        { width: w, height: h, borderRadius: fs ? 0 : borderRadius },
      ]}
    >
      <VideoView
        player={player}
        style={{ width: w, height: h }}
        contentFit="contain"
        nativeControls={false}
      />
      <Controls
        visible={showControls}
        isPlaying={isPlaying}
        isLoading={isLoading}
        progress={progress}
        buffered={buffered}
        elapsed={elapsed}
        duration={duration}
        speed={speed}
        isFullscreen={fs}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onSeekStart={handleSeekStart}
        onSeekEnd={handleSeekEnd}
        onSpeedPress={handleSpeed}
        onFullscreen={handleFullscreen}
      />
    </Pressable>
  );
 
  return (
    <>
      {/* Inline bubble */}
      <View style={[styles.wrapper, style]}>
        {renderPlayer(inlineWidth, inlineHeight, false)}
      </View>
 
      {/* Fullscreen modal */}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['landscape']}
        onRequestClose={handleFullscreen}
      >
        <StatusBar hidden />
        <View style={styles.fullscreenBg}>
          {renderPlayer(screen.height, screen.width, true)}
        </View>
      </Modal>
    </>
  );
};
 
// ─── Styles ───────────────────────────────────────────────────────────────────
 
const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
  },
  container: {
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  fullscreenBg: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  // Controls overlay
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CONTROLS_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 6,
    gap: 6,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
 
  // Timer
  timer: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  timerTotal: {
    fontWeight: '400',
    color: 'rgba(255,255,255,0.6)',
  },
 
  // Speed
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  speedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  iconBtn: {
    padding: 2,
  },
 
  // Seek bar
  seekTrack: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  seekBuffered: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    left: 0,
  },
  seekFilled: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: SEEK_FILLED,
    left: 0,
  },
  seekThumb: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: SEEK_THUMB,
    top: '50%' as any,
    marginTop: -6.5,
    marginLeft: -6.5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});
 
export default VideoPlayer;