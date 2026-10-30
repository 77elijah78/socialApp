import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useRef,
  useContext,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getInfoAsync } from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import { ChatReadVisibility } from "@/components/chat/ChatReadVisibility";
import { documentDownloads, documentKey } from "@/services/DocumentDownloads";
import {
  fileExtension,
  fileIcon,
  formatBytes,
} from "@/utils/messaging/presentation";

interface Props {
  ownerId: string;
  id: string;
  uri: string;
  name: string;
  size?: number;
  localSource?: boolean;
  onLongPress?: () => void;
}
function DocumentMessage({
  ownerId,
  id,
  uri,
  name,
  size,
  localSource,
  onLongPress,
}: Props) {
  const spec = useMemo(
    () => ({ ownerId, id, uri, name, localSource }),
    [ownerId, id, uri, name, localSource],
  );
  const key = documentKey(spec);
  const subscribe = useCallback(
    (listener: () => void) => documentDownloads.subscribe(key, listener),
    [key],
  );
  const snapshot = useCallback(() => documentDownloads.get(key), [key]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const coverReads = useContext(ChatReadVisibility);
  const alive = useRef(true);
  const opening = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    void documentDownloads.inspect(spec);
  }, [spec]);
  const busy = state.status === "queued" || state.status === "downloading";
  const percent = state.total
    ? Math.min(100, Math.floor((state.bytes / state.total) * 100))
    : null;
  const open = async () => {
    if (opening.current) return;
    setOpenError(null);
    if (!state.localUri) {
      await documentDownloads.download(spec);
      return;
    }
    opening.current = true;
    try {
      const file = await getInfoAsync(state.localUri);
      if (!file.exists) {
        await documentDownloads.download(spec);
        return;
      }
      // Lazy import keeps older native clients usable until their sharing module is rebuilt.
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("Native sharing unavailable");
      if (alive.current) {
        const release = coverReads();
        try {
          await Sharing.shareAsync(state.localUri, { dialogTitle: name });
        } finally {
          release();
        }
      }
    } catch {
      if (alive.current)
        setOpenError(
          "Couldn’t open this file. Check that a compatible app is installed, then retry.",
        );
    } finally {
      opening.current = false;
    }
  };
  const label =
    state.status === "queued"
      ? "Queued"
      : state.status === "downloading"
        ? percent == null
          ? `${formatBytes(state.bytes)} downloaded`
          : `${percent}% downloaded`
        : state.status === "ready"
          ? "Downloaded · Open / share"
          : state.status === "error"
            ? "Download failed · Retry"
            : "Download file";
  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onLongPress={onLongPress}
        onPress={() => {
          void open();
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${label}`}
        accessibilityState={{ busy, disabled: busy }}
        style={styles.row}
        activeOpacity={OPACITY.subtle}
      >
        <View style={styles.icon}>
          <Ionicons
            name={fileIcon(name)}
            size={25}
            color={COLORS.primaryDark}
          />
        </View>
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={2} ellipsizeMode="middle">
            {name}
          </Text>
          <Text style={styles.details}>
            {fileExtension(name)} · {formatBytes(state.total ?? size)}
          </Text>
          <Text style={styles.action}>{label}</Text>
        </View>
        <View style={styles.control}>
          {busy ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Ionicons
              name={
                state.status === "ready"
                  ? "open-outline"
                  : state.status === "error"
                    ? "refresh-outline"
                    : "download-outline"
              }
              size={21}
              color={COLORS.primaryDark}
            />
          )}
        </View>
      </TouchableOpacity>
      {busy && (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={
            percent == null
              ? { text: "Downloading" }
              : { min: 0, max: 100, now: percent }
          }
        >
          {percent != null && (
            <View style={[styles.progress, { width: `${percent}%` }]} />
          )}
        </View>
      )}
      {(openError || state.error) && (
        <Text accessibilityRole="alert" style={styles.error}>
          {openError || state.error}
        </Text>
      )}
    </View>
  );
}
export default memo(DocumentMessage);
const styles = StyleSheet.create({
  wrapper: { gap: SPACING.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 64,
  },
  icon: {
    width: 44,
    height: 48,
    backgroundColor: COLORS.primaryGhost,
    borderRadius: BORDER_RADIUS.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0, gap: SPACING.sm },
  name: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  details: { fontSize: TYPOGRAPHY.fontSize.md, color: COLORS.textGray },
  action: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.primaryDark,
    fontWeight: "500",
  },
  control: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    height: 3,
    overflow: "hidden",
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primaryGhostBorder,
  },
  progress: { height: "100%", backgroundColor: COLORS.primary },
  error: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.md,
    lineHeight: 18,
  },
});
