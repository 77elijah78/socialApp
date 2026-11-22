import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import { useChatAudio } from "@/hooks/useChatAudio";
import {
  chatMediaSpec,
  useChatMediaDownload,
} from "@/services/ChatMediaDownloads";
import { chatAudio } from "@/services/ChatAudioPlayer";
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
  /** Message author; needed to partition authenticated downloads by account. */
  ownerId?: string;
  name?: string | null;
  mimeType?: string | null;
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

function VoiceMessage(props: Props) {
  const key = props.playbackId || props.audioUri;
  const spec = useMemo(
    () =>
      props.audioUri
        ? chatMediaSpec({
            ownerId: props.ownerId ?? "local",
            id: key,
            uri: props.audioUri,
            name:
              props.name ||
              (props.mimeType?.startsWith("audio/") ? "voice.m4a" : undefined),
            mimeType: props.mimeType,
            localSource: props.isOwn,
          })
        : null,
    [props.audioUri, props.ownerId, key, props.name, props.mimeType, props.isOwn],
  );
  const media = useChatMediaDownload(spec);
  const { download: downloadMedia } = media;
  const audio = useChatAudio(key);
  const [starting, setStarting] = useState(false);
  const pending = useRef(false);
  const peaks = useMemo(() => waveformPeaks(props.waveform), [props.waveform]);

  const active = audio.key === key;
  const total =
    (active && audio.duration > 0 ? audio.duration : 0) || props.duration || 0;
  const elapsed = active ? Math.max(0, Math.min(total || Infinity, audio.currentTime)) : 0;
  const playing = active && audio.playing;
  const error = media.state.error || (active ? audio.error : null);
  const busy =
    starting ||
    media.busy ||
    (active && audio.buffering && !audio.error);

  const play = useCallback(async (downloadedUri?: string) => {
    const uri = downloadedUri ?? media.localUri;
    if (!uri) return;
    pending.current = true;
    setStarting(true);
    try {
      await chatAudio.play({
        key,
        uri,
        title: props.name || "Voice message",
        subtitle: props.isOwn ? "You" : "Voice message",
        duration: props.duration,
        waveform: props.waveform,
      });
    } finally {
      pending.current = false;
      setStarting(false);
    }
  }, [
    key,
    media.localUri,
    props.duration,
    props.isOwn,
    props.name,
    props.waveform,
  ]);

  const download = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setStarting(true);
    try {
      const localUri = await downloadMedia();
      if (localUri) await play(localUri);
    } finally {
      pending.current = false;
      setStarting(false);
    }
  }, [downloadMedia, play]);

  const seek = (ratio: number) => {
    if (active && total > 0) chatAudio.seek(ratio * total);
  };

  const label = media.ready
    ? audio.error
      ? "Retry voice message"
      : playing
        ? "Pause voice message"
        : "Play voice message"
    : media.state.status === "error"
      ? "Retry voice message download"
      : "Download voice message";

  return (
    <View style={[styles.wrapper, props.style]}>
      <View style={styles.row}>
        <TouchableOpacity
          onLongPress={props.onLongPress}
          style={[
            styles.play,
            !media.ready && styles.downloadButton,
            !props.audioUri && styles.disabled,
          ]}
          onPress={() => {
            if (!media.ready) void download();
            else void play();
          }}
          disabled={busy || !props.audioUri}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy || !props.audioUri }}
          accessibilityLabel={label}
        >
          {busy ? (
            <ActivityIndicator
              color={media.ready ? COLORS.white : COLORS.primary}
              size="small"
            />
          ) : (
            <Ionicons
              name={
                !media.ready
                  ? media.state.status === "error"
                    ? "refresh"
                    : "cloud-download-outline"
                  : audio.error
                    ? "refresh"
                    : playing
                      ? "pause"
                      : "play"
              }
              size={21}
              color={media.ready ? COLORS.white : COLORS.primaryDark}
            />
          )}
        </TouchableOpacity>
        <VoiceTrack
          peaks={peaks}
          progress={total ? Math.max(0, Math.min(1, elapsed / total)) : 0}
          elapsed={elapsed}
          total={total}
          onSeek={media.ready ? seek : undefined}
          onLongPress={props.onLongPress}
        />
      </View>
      {media.busy && (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={
            media.percent == null
              ? { text: "Downloading voice message" }
              : { min: 0, max: 100, now: media.percent }
          }
        >
          {media.percent != null && (
            <View style={[styles.progress, { width: `${media.percent}%` }]} />
          )}
        </View>
      )}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {media.state.status === "error"
            ? media.state.error
            : "Couldn’t play this audio. Tap retry."}
        </Text>
      )}
      {!props.audioUri && (
        <Text style={styles.error}>Audio unavailable</Text>
      )}
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
  downloadButton: { backgroundColor: COLORS.primaryGhost },
  disabled: { opacity: 0.5 },
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
  track: {
    height: 3,
    overflow: "hidden",
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primaryGhostBorder,
  },
  progress: { height: "100%", backgroundColor: COLORS.primary },
});
