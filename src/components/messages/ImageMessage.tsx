import { memo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
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

interface Props {
  uri: string;
  thumbnail?: string;
  name: string;
  maxWidth: number;
  mediaWidth?: number;
  mediaHeight?: number;
  onLongPress?: () => void;
}
function ImageMessage({
  uri,
  thumbnail,
  name,
  maxWidth,
  mediaWidth,
  mediaHeight,
  onLongPress,
}: Props) {
  const { height } = useWindowDimensions();
  const [dimensions, setDimensions] = useState(() =>
    mediaWidth && mediaHeight
      ? { width: mediaWidth, height: mediaHeight }
      : getMediaGeometry(uri),
  );
  const [state, setState] = useState<"loading" | "ready" | "error">(
    uri ? "loading" : "error",
  );
  const [attempt, setAttempt] = useState(0);
  const frame = fitMedia(
    dimensions?.width ?? 4,
    dimensions?.height ?? 3,
    maxWidth,
    height * 0.5,
  );
  const source = thumbnail || uri;
  return (
    <View style={[styles.frame, frame]}>
      {state !== "error" && (
        <TouchableOpacity
          onLongPress={onLongPress}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`Open photo from ${name}`}
          activeOpacity={OPACITY.subtle}
          onPress={() =>
            router.push({
              pathname: "/(chatRoom)/imageViewer",
              params: { uri, name },
            })
          }
        >
          <Image
            key={`${source}:${attempt}`}
            source={{ uri: source }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={source}
            transition={120}
            allowDownscaling
            onLoad={(event) => {
              const { width, height: sourceHeight } = event.source;
              rememberMediaGeometry(uri, width, sourceHeight);
              if (width > 0 && sourceHeight > 0)
                setDimensions({ width, height: sourceHeight });
              setState("ready");
            }}
            onError={() => setState("error")}
          />
        </TouchableOpacity>
      )}
      {state === "loading" && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.hint}>Loading photo</Text>
        </View>
      )}
      {state === "error" && (
        <View style={styles.overlay}>
          <Ionicons
            name="image-outline"
            size={28}
            color={COLORS.textSecondary}
          />
          <Text style={styles.hint}>Photo unavailable</Text>
          {!!uri && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry photo"
              style={styles.retry}
              onPress={() => {
                setAttempt((value) => value + 1);
                setState("loading");
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
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
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  hint: { color: COLORS.textGray, fontSize: TYPOGRAPHY.fontSize.lg },
  retry: {
    minHeight: 44,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.bgWhite,
  },
  retryText: {
    color: COLORS.primaryDark,
    fontWeight: "600",
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
});
