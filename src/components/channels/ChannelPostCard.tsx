import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import Videoplayer from "@/components/messages/Videoplayer";
import VoiceMessage from "@/components/messages/VoiceMessage";
import DocumentMessage from "@/components/messages/DocumentMessage";
import StickerImage from "@/components/stickers/StickerImage";
import { findBuiltinSticker, parseStickerMarker } from "@/constants/stickers";
import type { Sticker } from "@/constants/stickers";
import type { ChannelPost } from "@/services/ChannelService";
import {
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface Props {
  post: ChannelPost;
  canManage: boolean;
  onMenu: (post: ChannelPost) => void;
  ownerId?: string;
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function StickerPost({ post }: { post: ChannelPost }) {
  const marker = parseStickerMarker(post.content);
  const builtin = marker ? findBuiltinSticker(marker.packId, marker.stickerId) : undefined;
  const sticker: Sticker | null =
    builtin ??
    (marker && post.mediaUrl
      ? {
          id: marker.stickerId,
          packId: marker.packId,
          name: marker.stickerId,
          tags: [],
          url: post.mediaUrl,
          width: 256,
          height: 256,
        }
      : null);
  if (!sticker) return null;
  return <StickerImage sticker={sticker} size={154} />;
}

function ChannelPostCard({ post, canManage, onMenu, ownerId = "channel" }: Props) {
  const { width } = useWindowDimensions();
  const [mediaError, setMediaError] = useState(false);
  const contentWidth = Math.min(width - SPACING.xl * 2 - SPACING.lg * 2, 520);
  const marker = parseStickerMarker(post.content);
  const isSticker = post.type === "STICKER" || Boolean(marker);
  return (
    <View style={[styles.card, post.pinned && styles.cardPinned]}>
      {post.pinned ? (
        <View style={styles.pinnedRow}>
          <Ionicons name="pin" size={12} color={COLORS.accentBlue} />
          <Text style={styles.pinnedText}>Pinned post</Text>
        </View>
      ) : null}
      <View style={styles.header}>
        <View style={styles.authorAvatar}>
          {post.author?.avatarUrl ? (
            <Image source={{ uri: post.author.avatarUrl }} style={styles.authorImage} contentFit="cover" />
          ) : (
            <Ionicons name="megaphone" size={16} color={COLORS.accentBlue} />
          )}
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author?.displayName || post.author?.username || "Channel"}
          </Text>
          <Text style={styles.time}>{relativeTime(post.createdAt)}</Text>
        </View>
        {canManage ? (
          <Pressable
            onPress={() => onMenu(post)}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            style={styles.menuButton}
          >
            <Ionicons name="ellipsis-horizontal" size={19} color={COLORS.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {!isSticker && post.content ? (
        <Text style={styles.content} selectable>{post.content}</Text>
      ) : null}

      {isSticker ? (
        <View style={styles.stickerWrap}><StickerPost post={post} /></View>
      ) : post.type === "IMAGE" && post.mediaUrl ? (
        <View style={styles.mediaWrap}>
          {!mediaError ? (
            <AuthenticatedImage
              uri={post.mediaUrl}
              style={[styles.image, { width: contentWidth }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={post.mediaUrl}
              onError={() => setMediaError(true)}
            />
          ) : (
            <View style={[styles.mediaUnavailable, { width: contentWidth }]}>
              <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.mediaUnavailableText}>Image unavailable</Text>
            </View>
          )}
        </View>
      ) : post.type === "VIDEO" && post.mediaUrl ? (
        <Videoplayer
          playbackId={post.id}
          uri={post.mediaUrl}
          width={contentWidth}
          thumbnail={post.thumbnailUrl ?? undefined}
          duration={post.duration ?? undefined}
          ownerId={`${ownerId}:channel`}
          id={post.id}
          mimeType={post.fileMimeType}
        />
      ) : post.type === "AUDIO" && post.mediaUrl ? (
        <VoiceMessage
          audioUri={post.mediaUrl}
          playbackId={post.id}
          duration={post.duration ?? 0}
          ownerId={`${ownerId}:channel`}
          name={post.fileName}
          mimeType={post.fileMimeType}
          style={styles.audioCard}
        />
      ) : post.type === "DOCUMENT" && post.mediaUrl ? (
        <DocumentMessage
          ownerId={`${ownerId}:channel`}
          id={post.id}
          uri={post.mediaUrl}
          name={post.fileName || "Document"}
          size={post.fileSize ?? undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING.lg,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#E8EEF9",
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  cardPinned: { borderColor: "#B9D3FF", backgroundColor: "#FBFDFF" },
  pinnedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  pinnedText: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  authorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FF",
    overflow: "hidden",
  },
  authorImage: { width: "100%", height: "100%" },
  headerCopy: { flex: 1, minWidth: 0 },
  authorName: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "700" },
  time: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm, marginTop: 1 },
  menuButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  content: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, lineHeight: 22 },
  mediaWrap: { borderRadius: 16, overflow: "hidden", backgroundColor: COLORS.bgInput },
  image: { height: 220, borderRadius: 16 },
  mediaUnavailable: {
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.bgInput,
    borderRadius: 16,
  },
  mediaUnavailableText: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md },
  stickerWrap: { alignItems: "center", paddingVertical: SPACING.md, backgroundColor: "transparent" },
  videoCard: {
    height: 190,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: "#1A1A2E",
  },
  videoShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(20,18,36,0.36)" },
  videoLabel: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "600" },
  audioCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: "#F2F8FF",
  },
  audioIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF" },
  audioCopy: { flex: 1, minWidth: 0 },
  audioTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "600" },
  audioMeta: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm, marginTop: 1 },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  documentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF" },
});

export default memo(ChannelPostCard);
