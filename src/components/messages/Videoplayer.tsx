import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useContext,
} from "react";
import {
  ActivityIndicator,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { Image } from "expo-image";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import {
  ChatReadVisibility,
  ChatMediaInteraction,
} from "@/components/chat/ChatReadVisibility";
import {
  claimChatPlayback,
  useChatMediaPlayback,
} from "@/hooks/useChatMediaPlayback";
import { useMediaVisibility } from "@/utils/messaging/mediaVisibility";
import { fitMedia, formatDuration } from "@/utils/messaging/presentation";
import {
  getMediaGeometry,
  rememberMediaGeometry,
} from "@/utils/messaging/mediaGeometry";
import { BORDER_RADIUS, COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

interface Props {
  uri: string;
  playbackId?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  borderRadius?: number;
  style?: ViewStyle;
  duration?: number;
  mediaWidth?: number;
  mediaHeight?: number;
  onLongPress?: () => void;
}
function Poster({
  uri,
  onSize,
}: {
  uri: string;
  onSize: (width: number, height: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Text style={styles.posterHint}>Preview unavailable</Text>
  ) : (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={uri}
      onLoad={(event) => onSize(event.source.width, event.source.height)}
      onError={() => setFailed(true)}
    />
  );
}
function VideoModal({
  uri,
  playbackId,
  onClose,
}: Pick<Props, "uri" | "playbackId"> & { onClose: () => void }) {
  const visible = useMediaVisibility(playbackId);
  const player = useVideoPlayer(null, (instance) => {
    instance.loop = false;
  });
  const canPlay = useChatMediaPlayback(player, visible);
  const { status, error: nativeError } = useEvent(player, "statusChange", {
    status: player.status,
  });
  const [failed, setFailed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [rotated, setRotated] = useState(false);
  const originalLock = useRef<ScreenOrientation.OrientationLock | null>(null);
  const alive = useRef(true);
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (loading.current || !canPlay()) return;
    loading.current = true;
    setFailed(false);
    try {
      await player.replaceAsync({ uri, useCaching: true });
      if (canPlay()) {
        claimChatPlayback(player);
        player.play();
      }
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      loading.current = false;
    }
  }, [canPlay, player, uri]);
  const initialLoad = useRef(load);
  useEffect(() => {
    alive.current = true;
    void initialLoad.current(); // Modal exists only after a deliberate play tap.
    return () => {
      alive.current = false;
      if (originalLock.current != null)
        void ScreenOrientation.lockAsync(originalLock.current).catch(() => {});
      // useVideoPlayer disposes its native player and event subscriptions.
    };
  }, []);
  const rotate = async () => {
    try {
      if (originalLock.current == null)
        originalLock.current =
          await ScreenOrientation.getOrientationLockAsync();
      if (!alive.current) return;
      await ScreenOrientation.lockAsync(
        rotated
          ? originalLock.current
          : ScreenOrientation.OrientationLock.LANDSCAPE,
      );
      if (alive.current) setRotated((value) => !value);
      else if (originalLock.current != null)
        await ScreenOrientation.lockAsync(originalLock.current);
    } catch {
      /* Rotation is optional; portrait/native fullscreen still works. */
    }
  };
  const error = failed || status === "error";
  return (
    <Modal
      visible
      animationType="fade"
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={styles.modal}
        edges={["top", "bottom", "left", "right"]}
      >
        <StatusBar barStyle="light-content" />
        <View style={styles.toolbar}>
          <Text style={styles.title}>Video</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Change video speed"
            style={styles.tool}
            onPress={() => {
              const choices = [0.5, 1, 1.5, 2];
              const next =
                choices[(choices.indexOf(speed) + 1) % choices.length];
              // Native imperative player API, not React state mutation.
              // eslint-disable-next-line react-hooks/immutability
              player.playbackRate = next;
              setSpeed(next);
            }}
          >
            <Text style={styles.toolText}>{speed}×</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Rotate video player"
            style={styles.tool}
            onPress={() => {
              void rotate();
            }}
          >
            <Ionicons
              name="phone-landscape-outline"
              size={22}
              color={COLORS.white}
            />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close video player"
            style={styles.tool}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.stage}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls
            fullscreenOptions={{ enable: true }}
          />
          {(status === "loading" || status === "idle") && !error && (
            <View pointerEvents="none" style={styles.overlay}>
              <ActivityIndicator size="large" color={COLORS.white} />
              <Text style={styles.toolText}>Loading video</Text>
            </View>
          )}
          {error && (
            <View style={styles.errorOverlay}>
              <Ionicons
                name="videocam-off-outline"
                size={30}
                color={COLORS.white}
              />
              <Text style={styles.error} accessibilityRole="alert">
                {nativeError?.message || "This video couldn’t be played."}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.retry}
                accessibilityLabel="Retry video"
                onPress={() => {
                  void load();
                }}
              >
                <Text style={styles.toolText}>Retry video</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
function VideoPlayer({
  uri,
  playbackId,
  width,
  height,
  thumbnail,
  borderRadius = BORDER_RADIUS.xxxl,
  style,
  duration,
  mediaWidth,
  mediaHeight,
  onLongPress,
}: Props) {
  const window = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const coverReads = useContext(ChatReadVisibility);
  const confirmVisibility = useContext(ChatMediaInteraction);
  const releaseReadCover = useRef<(() => void) | null>(null);
  const close = () => {
    setOpen(false);
    releaseReadCover.current?.();
    releaseReadCover.current = null;
  };
  useEffect(() => () => releaseReadCover.current?.(), []);
  const [dimensions, setDimensions] = useState(() =>
    mediaWidth && mediaHeight
      ? { width: mediaWidth, height: mediaHeight }
      : getMediaGeometry(uri),
  );
  const remember = useCallback(
    (w: number, h: number) => {
      rememberMediaGeometry(uri, w, h);
      if (w > 0 && h > 0) setDimensions({ width: w, height: h });
    },
    [uri],
  );
  const frame = fitMedia(
    dimensions?.width ?? 16,
    dimensions?.height ?? 9,
    width ?? window.width * 0.72,
    height ?? window.height * 0.5,
  );
  return (
    <View style={style}>
      <View style={[styles.preview, frame, { borderRadius }]}>
        {thumbnail ? (
          <Poster key={thumbnail} uri={thumbnail} onSize={remember} />
        ) : (
          <Ionicons name="videocam-outline" size={30} color={COLORS.wave3} />
        )}
        <View style={styles.duration}>
          <Ionicons name="videocam" size={12} color={COLORS.white} />
          <Text style={styles.durationText}>
            {formatDuration(duration) || "Video"}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel={uri ? "Play video" : "Video unavailable"}
          accessibilityRole="button"
          disabled={!uri}
          onLongPress={onLongPress}
          onPress={() => {
            confirmVisibility(playbackId);
            releaseReadCover.current?.();
            releaseReadCover.current = coverReads();
            setOpen(true);
          }}
          style={styles.play}
        >
          <Ionicons name="play" size={28} color={COLORS.white} />
        </TouchableOpacity>
        {!uri && <Text style={styles.posterHint}>Video unavailable</Text>}
      </View>
      {open && <VideoModal uri={uri} playbackId={playbackId} onClose={close} />}
    </View>
  );
}
export default memo(VideoPlayer);
const styles = StyleSheet.create({
  preview: {
    overflow: "hidden",
    backgroundColor: COLORS.bgChat,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  duration: {
    position: "absolute",
    left: SPACING.md,
    top: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.shadowBlack,
  },
  durationText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: "500",
  },
  posterHint: { color: COLORS.textGray, fontSize: TYPOGRAPHY.fontSize.md },
  modal: { flex: 1, backgroundColor: COLORS.black },
  toolbar: { flexDirection: "row", alignItems: "center", padding: SPACING.md },
  title: {
    flex: 1,
    color: COLORS.white,
    fontSize: TYPOGRAPHY.fontSize.xxxl,
    fontWeight: "600",
    paddingHorizontal: SPACING.md,
  },
  tool: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  toolText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: "600",
  },
  stage: { flex: 1, position: "relative" },
  video: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.lg,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.lg,
    backgroundColor: COLORS.black,
    padding: SPACING.xl,
  },
  error: {
    color: COLORS.white,
    textAlign: "center",
    fontSize: TYPOGRAPHY.fontSize.xl,
  },
  retry: {
    backgroundColor: COLORS.primaryDark,
    minHeight: 44,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
});
