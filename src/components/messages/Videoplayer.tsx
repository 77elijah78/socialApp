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
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useChatMediaPlayback } from "@/hooks/useChatMediaPlayback";
import { useMediaVisibility } from "@/utils/messaging/mediaVisibility";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoPlayerProps {
  uri: string;
  playbackId?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  borderRadius?: number;
  style?: ViewStyle;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;
type SpeedOption = (typeof SPEED_OPTIONS)[number];
const HIDE_CONTROLS_MS = 3000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

// ─── Seek Bar ─────────────────────────────────────────────────────────────────

interface SeekBarProps {
  progress: number; // 0–1
  buffered?: number; // 0–1
  onSeek: (p: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
}

const SeekBar: React.FC<SeekBarProps> = ({
  progress,
  buffered = 0,
  onSeek,
  onSeekStart,
  onSeekEnd,
}) => {
  const trackRef = useRef<View>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  const computeSeek = useCallback(
    (x: number) => {
      onSeek(Math.max(0, Math.min(1, x / Math.max(1, trackWidth))));
    },
    [onSeek, trackWidth],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          onSeekStart();
          computeSeek(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => computeSeek(event.nativeEvent.locationX),
        onPanResponderRelease: onSeekEnd,
      }),
    [computeSeek, onSeekStart, onSeekEnd],
  );

  return (
    <View
      ref={trackRef}
      style={styles.seekTrack}
      onLayout={(e) => {
        setTrackWidth(e.nativeEvent.layout.width);
      }}
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
  visible,
  isPlaying,
  isLoading,
  progress,
  buffered,
  elapsed,
  duration,
  speed,
  isFullscreen,
  onPlayPause,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onSpeedPress,
  onFullscreen,
}) => {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View
      style={[styles.controlsOverlay, { opacity }]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      {/* Center play/pause */}
      <TouchableOpacity
        onPress={onPlayPause}
        style={styles.centerBtn}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color={theme.COLORS.textWhite} size="large" />
        ) : (
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={38}
            color={theme.COLORS.textWhite}
          />
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
            <TouchableOpacity
              onPress={onSpeedPress}
              style={styles.speedBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.speedText}>{speed}×</Text>
            </TouchableOpacity>

            {/* Fullscreen */}
            <TouchableOpacity
              onPress={onFullscreen}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isFullscreen ? "contract" : "expand"}
                size={20}
                color={theme.COLORS.textWhite}
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
  playbackId,
  width,
  height,
  thumbnail,
  borderRadius = theme.BORDER_RADIUS.xxl,
  style,
}) => {
  const screen = Dimensions.get("window");
  const inlineWidth = width ?? screen.width * 0.75;
  const inlineHeight = height ?? inlineWidth * (9 / 16);

  const visible = useMediaVisibility(playbackId);
  const loaded = useRef(false);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
    p.timeUpdateEventInterval = 0.25;
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { status: playbackStatus } = useEvent(player, "statusChange", {
    status: player.status,
  });
  const time = useEvent(player, "timeUpdate");
  const isLoading = playbackStatus === "loading";
  const [seekSeconds, setSeekSeconds] = useState(0);
  const duration = player.duration || 0;
  const buffered =
    duration > 0 ? Math.min(1, (time?.bufferedPosition ?? 0) / duration) : 0;
  const [speed, setSpeed] = useState<SpeedOption>(1);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orientationChanged = useRef(false);
  const elapsed = isSeeking ? seekSeconds : (time?.currentTime ?? 0);
  const progress = duration > 0 ? elapsed / duration : 0;
  const canPlay = useChatMediaPlayback(player, visible);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(
      () => setShowControls(false),
      HIDE_CONTROLS_MS,
    );
  }, []);

  const handleTap = useCallback(() => {
    setShowControls((prev) => {
      if (!prev) scheduleHide();
      else if (hideTimer.current) clearTimeout(hideTimer.current);
      return !prev;
    });
  }, [scheduleHide]);

  // ── Play / Pause ──────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    try {
      if (!canPlay()) return;
      setPlaybackFailed(false);
      if (!loaded.current) {
        await player.replaceAsync({ uri, useCaching: true });
        if (!canPlay()) return;
        loaded.current = true;
      }
      if (player.playing) player.pause();
      else player.play();
      scheduleHide();
    } catch {
      if (canPlay()) setPlaybackFailed(true);
    }
  }, [player, scheduleHide, uri, canPlay]);

  // ── Seek ──────────────────────────────────────────────────────────────────
  const handleSeek = useCallback(
    (p: number) => {
      const dur = player.duration ?? 0;
      player.seekBy(p * dur - (player.currentTime ?? 0));
      setSeekSeconds(p * dur);
    },
    [player],
  );

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
    // expo-video exposes this native imperative setter; this is not React state.
    // eslint-disable-next-line react-hooks/immutability
    player.playbackRate = next;
    scheduleHide();
  }, [speed, player, scheduleHide]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const handleFullscreen = useCallback(async () => {
    try {
      if (!isFullscreen) {
        orientationChanged.current = true;
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE,
        );
      } else {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
        orientationChanged.current = false;
      }
      setIsFullscreen((f) => !f);
      scheduleHide();
    } catch (error) {
      if (__DEV__) console.warn("[video] orientation failed", error);
    }
  }, [isFullscreen, scheduleHide]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      // useVideoPlayer disposes its native player; do not pause a released handle.
      if (orientationChanged.current)
        void ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        ).catch((error) => {
          if (__DEV__)
            console.warn("[video] orientation restore failed", error);
        });
    };
  }, [player]);

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
      {thumbnail && !isPlaying ? (
        <Image
          source={thumbnail}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          pointerEvents="none"
        />
      ) : null}
      {playbackFailed && (
        <Text accessibilityRole="alert" style={styles.playbackError}>
          Couldn’t play video. Tap play to retry.
        </Text>
      )}
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
        supportedOrientations={["landscape"]}
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
  playbackError: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    color: theme.COLORS.white,
    fontSize: 12,
  },
  wrapper: {
    alignSelf: "flex-start",
  },
  container: {
    overflow: "hidden",
    backgroundColor: theme.COLORS.black,
    position: "relative",
    width: "100%",
    height: "100%",
  },
  fullscreenBg: {
    flex: 1,
    backgroundColor: theme.COLORS.black,
    alignItems: "center",
    justifyContent: "center",
  },

  // Controls overlay
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.COLORS.shadowBlack,
    justifyContent: "center",
    alignItems: "center",
  },
  centerBtn: {
    width: theme.SIZING.centerPlayBtn,
    height: theme.SIZING.centerPlayBtn,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxxl,
    backgroundColor: theme.COLORS.centerPlayBtnBg,
    alignItems: "center",
    justifyContent: "center",
  },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.SPACING.lg,
    paddingBottom: 10,
    paddingTop: 6,
    gap: 6,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
  },

  // Timer
  timer: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textWhite,
  },
  timerTotal: {
    fontWeight: theme.TYPOGRAPHY.fontWeight.regular,
    color: theme.COLORS.timerTotal,
  },

  // Speed
  speedBtn: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: 3,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.speedBtnBg,
  },
  speedText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textWhite,
  },
  iconBtn: {
    padding: theme.SPACING.xs,
  },

  // Seek bar
  seekTrack: {
    height: 28,
    justifyContent: "center",
    position: "relative",
  },
  seekBuffered: {
    position: "absolute",
    height: 3,
    borderRadius: theme.BORDER_RADIUS.xs,
    backgroundColor: theme.COLORS.seekBuffered,
    left: 0,
  },
  seekFilled: {
    position: "absolute",
    height: 3,
    borderRadius: theme.BORDER_RADIUS.xs,
    backgroundColor: theme.COLORS.textWhite,
    left: 0,
  },
  seekThumb: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: theme.COLORS.textWhite,
    top: "50%" as any,
    marginTop: -6.5,
    marginLeft: -6.5,
    shadowColor: theme.COLORS.black,
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});

export default React.memo(VideoPlayer);
