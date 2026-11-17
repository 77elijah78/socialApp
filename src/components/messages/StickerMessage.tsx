import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import MessageMeta from "./MessageMeta";
import ReplyPreview from "./ReplyPreview";
import { findBuiltinSticker } from "@/constants/stickers";
import {
  BORDER_RADIUS,
  COLORS,
  LAYOUT,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import type { ReplyPreviewModel } from "@/utils/messaging/presentation";

interface Props {
  packId: string;
  stickerId: string;
  uri: string;
  time: string | number;
  status?: string;
  isSent: boolean;
  showAuthor?: boolean;
  sender: string;
  senderAvatar?: string | null;
  ownerId: string;
  repliedTo?: ReplyPreviewModel;
  onReplyPress?: (id: string) => void;
  onLongPress?: () => void;
  onRetry?: () => void;
}

function StickerMessage({
  packId,
  stickerId,
  uri,
  time,
  status,
  isSent,
  showAuthor,
  sender,
  senderAvatar,
  ownerId,
  repliedTo,
  onReplyPress,
  onLongPress,
  onRetry,
}: Props) {
  const bundled = findBuiltinSticker(packId, stickerId);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const artwork = bundled?.asset ? (
    <Image
      source={bundled.asset}
      style={styles.artwork}
      contentFit="contain"
      cachePolicy="memory"
      accessibilityLabel={`${bundled.name} sticker`}
      onLoad={() => setLoading(false)}
      onError={() => {
        setLoading(false);
        setFailed(true);
      }}
    />
  ) : uri ? (
    <AuthenticatedImage
      uri={uri}
      style={styles.artwork}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={`${packId}:${stickerId}:${uri}`}
      accessibilityLabel="Sticker"
      onLoad={() => setLoading(false)}
      onError={() => {
        setLoading(false);
        setFailed(true);
      }}
    />
  ) : null;

  return (
    <View style={[styles.container, isSent ? styles.outgoing : styles.incoming]}>
      <View style={styles.stack}>
        {showAuthor ? (
          <View style={styles.author}>
            {senderAvatar ? (
              <Image source={{ uri: senderAvatar }} style={styles.avatar} cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person-outline" size={12} color={COLORS.primaryDark} />
              </View>
            )}
            <Text style={styles.authorName} numberOfLines={1}>{sender}</Text>
          </View>
        ) : null}
        {repliedTo ? (
          <View style={styles.reply}>
            <ReplyPreview message={repliedTo} userId={ownerId} onPress={onReplyPress} />
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={OPACITY.subtle}
          onLongPress={onLongPress}
          delayLongPress={300}
          accessibilityRole="imagebutton"
          accessibilityLabel={bundled ? `${bundled.name} sticker` : "Sticker message"}
          style={styles.artWrap}
        >
          {artwork}
          {loading && !failed ? (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : null}
          {failed ? (
            <View style={styles.unavailable} pointerEvents="none">
              <Ionicons name="image-outline" size={30} color={COLORS.textMuted} />
              <Text style={styles.unavailableText}>Sticker unavailable</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <View style={styles.footer}>
          <MessageMeta time={time} status={status ?? "SENT"} isSent={isSent} onRetry={onRetry} />
        </View>
      </View>
    </View>
  );
}

const ART = 168;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginVertical: SPACING.xs,
    paddingHorizontal: LAYOUT.listPaddingHorizontal,
  },
  outgoing: { alignItems: "flex-end" },
  incoming: { alignItems: "flex-start" },
  stack: { maxWidth: ART + 24, gap: 2 },
  artWrap: {
    width: ART,
    minHeight: ART,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  artwork: { width: ART, height: ART, backgroundColor: "transparent" },
  loading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  unavailable: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: SPACING.xs },
  unavailableText: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm },
  footer: { alignItems: "flex-end", paddingHorizontal: SPACING.sm, marginTop: -2 },
  author: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingBottom: 2,
  },
  avatar: { width: 22, height: 22, borderRadius: BORDER_RADIUS.full },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryGhost,
  },
  authorName: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: "600",
  },
  reply: { width: ART + 24, marginBottom: SPACING.xs },
});

export default memo(StickerMessage);
