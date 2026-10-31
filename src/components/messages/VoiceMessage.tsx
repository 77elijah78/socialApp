import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
} from "react";
import {
  ActivityIndicator,
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
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import { ChatMediaInteraction } from "@/components/chat/ChatReadVisibility";
import {
  claimChatPlayback,
  useChatMediaPlayback,
} from "@/hooks/useChatMediaPlayback";
import { useMediaVisibility } from "@/utils/messaging/mediaVisibility";
import { formatDuration, waveformPeaks } from "@/utils/messaging/presentation";

interface Props {
  audioUri: string;
  playbackId?: string;
  duration: number;
  waveform?: number[];
  isOwn?: boolean;
  timestamp?: string;
  isRead?: boolean;
  style?: ViewStyle;
  onLongPress?: () => void;
}
interface TrackProps {
  peaks: number[] | null;
  progress: number;
  elapsed: number;
  total: number;
  onSeek?: (ratio: number) => void;
  onLongPress?: () => void;
}
const VoiceTrack = memo(function VoiceTrack({
  peaks,
  progress,
  elapsed,
  total,
  onSeek,
  onLongPress,
}: TrackProps) {
  const width = useRef(1);
  return (
    <View style={styles.trackColumn}>
      <TouchableOpacity
        style={styles.waveform}
        onLongPress={onLongPress}
        activeOpacity={OPACITY.subtle}
        accessibilityRole={onSeek ? "adjustable" : "text"}
        accessibilityLabel={
          peaks
            ? "Audio waveform"
            : "Audio progress. No waveform data available"
        }
        accessibilityValue={{ min: 0, max: Math.max(1, total), now: elapsed }}
        accessibilityActions={
          onSeek
            ? [
                { name: "increment", label: "Forward five seconds" },
                { name: "decrement", label: "Back five seconds" },
              ]
            : []
        }
        onAccessibilityAction={(event) => {
          if (total)
            onSeek?.(
              Math.max(
                0,
                Math.min(
                  1,
                  (elapsed +
                    (event.nativeEvent.actionName === "increment" ? 5 : -5)) /
                    total,
                ),
              ),
            );
        }}
        onLayout={(event) => {
          width.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        onPress={(event) =>
          onSeek?.(
            Math.max(
              0,
              Math.min(1, event.nativeEvent.locationX / width.current),
            ),
          )
        }
      >
        {peaks ? (
          peaks.map((peak, index) => (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height: Math.max(3, peak * 30),
                  backgroundColor:
                    index / peaks.length < progress
                      ? COLORS.primaryDark
                      : COLORS.wave1,
                },
              ]}
            />
          ))
        ) : (
          <View style={styles.rail}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        )}
      </TouchableOpacity>
      <Text style={styles.duration}>
        {total > 0
          ? `${elapsed > 0 ? `${formatDuration(elapsed) || "0:00"} / ` : ""}${formatDuration(total)}`
          : "Voice message"}
      </Text>
    </View>
  );
});
function ActiveVoice({
  audioUri,
  playbackId,
  duration,
  waveform,
  style,
  onLongPress,
}: Props) {
  const visible = useMediaVisibility(playbackId);
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const allowed = useChatMediaPlayback(player, visible);
  const loaded = useRef(false),
    loading = useRef(false),
    alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(true);
  const peaks = useMemo(() => waveformPeaks(waveform), [waveform]);
  const total = status.duration > 0 ? status.duration : duration;
  const elapsed = Math.max(
    0,
    Math.min(total || Infinity, status.currentTime || 0),
  );
  const error =
    failed || Boolean(status.error) || status.playbackState === "error";
  const busy = !error && (starting || status.isBuffering);
  const play = useCallback(async () => {
    if (loading.current) return;
    if (!allowed()) {
      if (alive.current) setStarting(false);
      return;
    }
    loading.current = true;
    try {
      setFailed(false);
      if (player.playing) {
        player.pause();
        return;
      }
      setStarting(true);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        shouldPlayInBackground: false,
      });
      if (!allowed()) return;
      if (!loaded.current || status.error || status.playbackState === "error") {
        player.replace({ uri: audioUri });
        loaded.current = true;
      }
      if (status.didJustFinish) await player.seekTo(0);
      if (allowed()) {
        claimChatPlayback(player);
        player.play();
      }
    } catch {
      if (allowed()) {
        loaded.current = false;
        setFailed(true);
      }
    } finally {
      loading.current = false;
      if (alive.current) setStarting(false);
    }
  }, [
    allowed,
    player,
    audioUri,
    status.didJustFinish,
    status.error,
    status.playbackState,
  ]);
  // This child is created only by an explicit play tap, not while scrolling.
  const initialPlay = useRef(play);
  useEffect(() => {
    void initialPlay.current();
  }, []);
  const seek = (ratio: number) => {
    if (loaded.current && total > 0)
      void player.seekTo(ratio * total).catch(() => {
        if (allowed()) setFailed(true);
      });
  };
  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.row}>
        <TouchableOpacity
          onLongPress={onLongPress}
          style={styles.play}
          onPress={() => {
            void play();
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          accessibilityLabel={
            error
              ? "Retry voice message"
              : status.playing
                ? "Pause voice message"
                : "Play voice message"
          }
        >
          {busy ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Ionicons
              name={error ? "refresh" : status.playing ? "pause" : "play"}
              size={21}
              color={COLORS.white}
            />
          )}
        </TouchableOpacity>
        <VoiceTrack
          peaks={peaks}
          progress={total ? Math.max(0, Math.min(1, elapsed / total)) : 0}
          elapsed={elapsed}
          total={total}
          onSeek={seek}
          onLongPress={onLongPress}
        />
      </View>
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          Couldn’t play this audio. Tap retry.
        </Text>
      )}
    </View>
  );
}
function VoiceMessage(props: Props) {
  const confirmVisibility = useContext(ChatMediaInteraction);
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const peaks = useMemo(() => waveformPeaks(props.waveform), [props.waveform]);
  if (activeUri) return <ActiveVoice {...props} audioUri={activeUri} />;
  return (
    <View style={[styles.wrapper, props.style]}>
      <View style={styles.row}>
        <TouchableOpacity
          onLongPress={props.onLongPress}
          style={styles.play}
          onPress={() => {
            confirmVisibility(props.playbackId);
            setActiveUri(props.audioUri);
          }}
          disabled={!props.audioUri}
          accessibilityRole="button"
          accessibilityLabel={
            props.audioUri ? "Play voice message" : "Audio unavailable"
          }
        >
          <Ionicons name="play" size={21} color={COLORS.white} />
        </TouchableOpacity>
        <VoiceTrack
          peaks={peaks}
          progress={0}
          elapsed={0}
          total={props.duration}
          onLongPress={props.onLongPress}
        />
      </View>
      {!props.audioUri && <Text style={styles.error}>Audio unavailable</Text>}
    </View>
  );
}
export default memo(VoiceMessage);
const styles = StyleSheet.create({
  wrapper: { width: "100%", gap: SPACING.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
    minHeight: 66,
  },
  play: {
    width: 46,
    height: 46,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  trackColumn: { flex: 1, minWidth: 0 },
  waveform: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    overflow: "hidden",
  },
  bar: { flex: 1, maxWidth: 4, borderRadius: BORDER_RADIUS.full },
  rail: {
    width: "100%",
    height: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.wave1,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: COLORS.primaryDark },
  duration: { fontSize: TYPOGRAPHY.fontSize.md, color: COLORS.textGray },
  error: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.md },
});
