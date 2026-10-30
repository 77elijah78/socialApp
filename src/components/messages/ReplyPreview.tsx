import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import {
  authorName,
  previewText,
  fileIcon,
  type ReplyPreviewModel,
} from "@/utils/messaging/presentation";

interface Props {
  message: ReplyPreviewModel;
  userId: string;
  onPress?: (id: string) => void;
  compact?: boolean;
}
function ReplyPreview({ message, userId, onPress, compact = false }: Props) {
  const name = message.senderId === userId ? "You" : authorName(message.sender);
  const text = previewText(message);
  const thumbnail =
    !message.deleted &&
    (message.type === "IMAGE"
      ? message.thumbnailUrl || message.mediaUrl
      : message.type === "VIDEO"
        ? message.thumbnailUrl
        : null);
  const icon =
    message.type === "AUDIO"
      ? "mic-outline"
      : message.type === "VIDEO"
        ? "videocam-outline"
        : message.type === "IMAGE"
          ? "image-outline"
          : message.type === "DOCUMENT"
            ? fileIcon(message.content || message.mediaUrl || "")
            : "arrow-undo-outline";
  return (
    <TouchableOpacity
      onPress={() => onPress?.(message.id)}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Original message from ${name}. ${text}. ${onPress ? "Go to original message" : ""}`}
      activeOpacity={OPACITY.subtle}
      style={[styles.quote, compact && styles.compact]}
    >
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={thumbnail}
        />
      ) : (
        <View style={styles.type}>
          <Ionicons name={icon} color={COLORS.primaryDark} size={19} />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.preview} numberOfLines={2}>
          {text}
        </Text>
      </View>
      {onPress && (
        <Ionicons
          name="arrow-up-outline"
          size={15}
          color={COLORS.primaryDark}
        />
      )}
    </TouchableOpacity>
  );
}
export default memo(ReplyPreview);
const styles = StyleSheet.create({
  quote: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primaryGhost,
  },
  compact: { flex: 1, backgroundColor: COLORS.transparent },
  thumbnail: {
    width: 38,
    height: 38,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryGhostBorder,
  },
  type: { width: 30, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: SPACING.xs },
  name: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  preview: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: 18,
    color: COLORS.textGray,
  },
});
