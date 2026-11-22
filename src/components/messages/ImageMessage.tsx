import { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import { fitMedia } from "@/utils/messaging/presentation";
import {
  getMediaGeometry,
  rememberMediaGeometry,
} from "@/utils/messaging/mediaGeometry";
import {
  chatMediaSpec,
  useChatMediaDownload,
} from "@/services/ChatMediaDownloads";

interface Props {
  uri: string;
  thumbnail?: string;
  name: string;
  maxWidth: number;
  mediaWidth?: number;
  mediaHeight?: number;
  onLongPress?: () => void;
  ownerId?: string;
  id?: string;
  mimeType?: string | null;
  isOwn?: boolean;
}
function ImageMessage({
  uri,
  thumbnail,
  name,
  maxWidth,
  mediaWidth,
  mediaHeight,
  onLongPress,
  ownerId,
  id,
  mimeType,
  isOwn = false,
}: Props) {
  const { height } = useWindowDimensions();
  const [dimensions, setDimensions] = useState(() =>
    mediaWidth && mediaHeight
      ? { width: mediaWidth, height: mediaHeight }
      : getMediaGeometry(uri),
  );
  const [imageError, setImageError] = useState(false);
  const spec = useMemo(
    () =>
      uri
        ? chatMediaSpec({
            ownerId: ownerId ?? "local",
            id: id ?? uri,
            uri,
            mimeType: mimeType ?? "image/jpeg",
            localSource: isOwn,
          })
        : null,
    [uri, ownerId, id, mimeType, isOwn],
  );
  const media = useChatMediaDownload(spec);
  const frame = fitMedia(
    dimensions?.width ?? 4,
    dimensions?.height ?? 3,
    maxWidth,
    height * 0.5,
  );
  const localUri = media.localUri;
  const previewUri =
    thumbnail && thumbnail !== uri ? thumbnail : undefined;

  return (
    <View style={[styles.frame, frame]}>
      {media.ready && localUri ? (
        <TouchableOpacity
          onLongPress={onLongPress}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`Open photo from ${name}`}
          activeOpacity={OPACITY.subtle}
          onPress={() =>
            router.push({
              pathname: "/(chatRoom)/imageViewer",
              params: { uri: localUri, name },
            })
          }
        >
          <Image
            source={{ uri: localUri }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={localUri}
            transition={120}
            allowDownscaling
            onLoad={(event) => {
              const { width, height: sourceHeight } = event.source;
              rememberMediaGeometry(uri, width, sourceHeight);
              if (width > 0 && sourceHeight > 0)
                setDimensions({ width, height: sourceHeight });
              setImageError(false);
            }}
            onError={() => setImageError(true)}
          />
        </TouchableOpacity>
      ) : (
        <>
          {/* Only the small preview is fetched before the photo is downloaded.
              Playback/opening always uses the downloaded local file. */}
          {previewUri ? (
            <AuthenticatedImage
              uri={previewUri}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={previewUri}
              transition={120}
              onLoad={(event) => {
                const { width, height: sourceHeight } = event.source;
                rememberMediaGeometry(uri, width, sourceHeight);
                if (width > 0 && sourceHeight > 0)
                  setDimensions({ width, height: sourceHeight });
              }}
            />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="image-outline" size={30} color={COLORS.textSecondary} />
            </View>
          )}
          <TouchableOpacity
            style={styles.downloadOverlay}
            accessibilityRole="button"
            accessibilityState={{ busy: media.busy, disabled: media.busy }}
            accessibilityLabel={
              media.busy
                ? media.percent == null
                  ? "Downloading photo"
                  : `Downloading photo, ${media.percent} percent`
                : media.state.status === "error"
                  ? "Retry photo download"
                  : "Download photo"
            }
            disabled={media.busy}
            onPress={() => void media.download()}
            activeOpacity={0.8}
          >
            {media.busy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Ionicons
                name={
                  media.state.status === "error"
                    ? "refresh"
                    : "cloud-download-outline"
                }
                size={26}
                color={COLORS.white}
              />
            )}
            <Text style={styles.downloadText}>
              {media.busy
                ? media.percent == null
                  ? "Downloading…"
                  : `${media.percent}%`
                : media.state.status === "error"
                  ? "Download failed · Retry"
                  : "Tap to download"}
            </Text>
          </TouchableOpacity>
        </>
      )}
      {media.ready && imageError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="image-outline" size={28} color={COLORS.textSecondary} />
          <Text style={styles.hint}>Photo unavailable</Text>
        </View>
      )}
    </View>
  );
}
export default memo(ImageMessage);
const styles = StyleSheet.create({
  frame: {
    position: "relative",
    borderRadius: BORDER_RADIUS.xxxl,
    overflow: "hidden",
    backgroundColor: COLORS.bgChat,
  },
  image: { width: "100%", height: "100%" },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgInput,
  },
  downloadOverlay: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -33,
    minWidth: 66,
    minHeight: 66,
    paddingHorizontal: SPACING.md,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(20,18,42,0.72)",
  },
  downloadText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  hint: { color: COLORS.textGray, fontSize: TYPOGRAPHY.fontSize.lg },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.bgChat,
  },
});
