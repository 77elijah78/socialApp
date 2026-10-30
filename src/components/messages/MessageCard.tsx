import type { MessageCardProps } from "@/types";
import {
  BORDER_RADIUS,
  COLORS,
  LAYOUT,
  OPACITY,
  SIZING,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  TouchableOpacity,
  Linking,
} from "react-native";
import { memo, useMemo, useCallback } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import VoiceMessage from "./VoiceMessage";
import VideoPlayer from "./Videoplayer";
import ImageMessage from "./ImageMessage";
import DocumentMessage from "./DocumentMessage";
import ReplyPreview from "./ReplyPreview";
import MessageMeta from "./MessageMeta";
import SharedPostCard from "./SharedPostCard";
import SharedStoryCard from "./SharedStoryCard";
import { useOverlay } from "@/providers/OverlayProvider";
import { showAppDialog } from "@/services/AppDialogService";
import { fileNameFromUri } from "@/utils/messaging/presentation";

function kind(type: string) {
  if (type.startsWith("image/") || type === "IMAGE") return "IMAGE";
  if (type.startsWith("video/") || type === "VIDEO") return "VIDEO";
  if (type.startsWith("audio/") || type === "AUDIO") return "AUDIO";
  return type.toUpperCase() === "TEXT"
    ? "TEXT"
    : type.toUpperCase() === "DOCUMENT"
      ? "DOCUMENT"
      : type;
}
function MessageCard({
  type,
  message,
  time,
  sender,
  senderAvatar,
  showAuthor,
  isSent,
  status,
  uri,
  onPress,
  onLongPress,
  repliedTo,
  onReplyPress,
  thumbnailUri,
  playbackId,
  duration,
  onRetry,
  ownerId = "local",
  attachment,
}: MessageCardProps) {
  const { width } = useWindowDimensions();
  const { openActionMenu } = useOverlay();
  const attachmentMenu = useCallback(
    () =>
      openActionMenu([
        {
          key: "open",
          icon: "open-outline",
          label: "Open in browser",
          onPress: () => {
            void Linking.openURL(uri).catch(() =>
              showAppDialog({
                title: "Couldn’t open attachment",
                message: "The original file may be unavailable.",
                tone: "error",
              }),
            );
          },
        },
        {
          key: "cancel",
          icon: "close-outline",
          label: "Cancel",
          onPress: () => {},
        },
      ]),
    [uri, openActionMenu],
  );
  const bubbleWidth = Math.min(SIZING.messageMaxImage + 24, width * 0.84);
  const contentWidth = Math.max(1, bubbleWidth - SPACING.lg * 2 - 2);
  const messageKind = kind(type);
  const shared = useMemo(() => {
    if (messageKind !== "SHARED_POST" && messageKind !== "SHARED_STORY")
      return null;
    try {
      const parsed = JSON.parse(message || "{}");
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, string | null>)
        : null;
    } catch {
      return null;
    }
  }, [message, messageKind]);
  const media = messageKind !== "TEXT";
  return (
    <View
      style={[styles.container, isSent ? styles.outgoing : styles.incoming]}
    >
      <TouchableOpacity
        onPress={
          onPress ??
          (repliedTo && onReplyPress
            ? () => onReplyPress(repliedTo.id)
            : undefined)
        }
        onLongPress={onLongPress}
        delayLongPress={300}
        activeOpacity={OPACITY.subtle}
        style={[
          styles.bubble,
          isSent ? styles.sent : styles.received,
          { maxWidth: bubbleWidth },
          media && { width: bubbleWidth },
        ]}
      >
        {(showAuthor || repliedTo) && (
          <View style={styles.author}>
            {senderAvatar ? (
              <Image
                source={{ uri: senderAvatar }}
                style={styles.avatar}
                cachePolicy="memory-disk"
                recyclingKey={senderAvatar}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons
                  name="person-outline"
                  size={13}
                  color={COLORS.primaryDark}
                />
              </View>
            )}
            <Text style={styles.authorName} numberOfLines={1}>
              {sender}
            </Text>
            {isSent && sender !== "You" && <Text style={styles.you}>You</Text>}
          </View>
        )}
        {repliedTo && (
          <ReplyPreview
            message={repliedTo}
            userId={ownerId}
            onPress={onReplyPress}
          />
        )}
        {messageKind === "TEXT" && <Text style={styles.text}>{message}</Text>}
        {messageKind === "IMAGE" && (
          <ImageMessage
            key={uri}
            uri={uri}
            thumbnail={thumbnailUri}
            name={sender}
            maxWidth={contentWidth}
            mediaWidth={attachment?.width}
            mediaHeight={attachment?.height}
            onLongPress={onLongPress}
          />
        )}
        {messageKind === "VIDEO" && (
          <VideoPlayer
            playbackId={playbackId}
            uri={uri}
            width={contentWidth}
            onLongPress={onLongPress}
            thumbnail={thumbnailUri}
            duration={duration}
            mediaWidth={attachment?.width}
            mediaHeight={attachment?.height}
          />
        )}
        {messageKind === "AUDIO" && !!message && (
          <Text style={styles.text} numberOfLines={1}>
            {message}
          </Text>
        )}
        {messageKind === "AUDIO" && (
          <VoiceMessage
            playbackId={playbackId}
            audioUri={uri}
            duration={duration ?? 0}
            waveform={attachment?.waveform}
            isOwn={isSent}
            onLongPress={onLongPress}
          />
        )}
        {messageKind === "DOCUMENT" && (
          <DocumentMessage
            key={uri}
            id={playbackId || uri}
            ownerId={ownerId}
            uri={uri}
            name={attachment?.name || message || fileNameFromUri(uri)}
            size={attachment?.size}
            localSource={isSent}
            onLongPress={onLongPress}
          />
        )}
        {(messageKind === "IMAGE" || messageKind === "VIDEO") && !!message && (
          <Text style={styles.text}>{message}</Text>
        )}
        {messageKind === "SHARED_POST" &&
          (shared ? (
            <SharedPostCard
              onLongPress={onLongPress}
              content={shared.content ?? "Shared post"}
              authorName={shared.authorName ?? "User"}
              authorAvatarUrl={shared.authorAvatarUrl ?? null}
              imageUrl={shared.imageUrl ?? null}
              onPress={() => {
                const id = shared.sharedPostId ?? shared.postId;
                if (id) router.push(`/posts/${id}/comments`);
              }}
            />
          ) : (
            <Text style={styles.text}>Shared post unavailable</Text>
          ))}
        {messageKind === "SHARED_STORY" &&
          (shared ? (
            <SharedStoryCard
              onLongPress={onLongPress}
              mediaUrl={shared.mediaUrl ?? ""}
              mediaType={shared.mediaType ?? "image"}
              caption={shared.caption ?? null}
              authorName={shared.authorName ?? "User"}
              authorAvatarUrl={shared.authorAvatarUrl ?? null}
              onPress={() => {
                const id = shared.sharedStoryId ?? shared.storyId;
                if (id)
                  router.push(
                    `/stories/viewer?storyId=${encodeURIComponent(id)}`,
                  );
              }}
            />
          ) : (
            <Text style={styles.text}>Shared story unavailable</Text>
          ))}
        {![
          "TEXT",
          "IMAGE",
          "VIDEO",
          "AUDIO",
          "DOCUMENT",
          "SHARED_POST",
          "SHARED_STORY",
        ].includes(messageKind) && (
          <Text style={styles.text}>{message || "Attachment unavailable"}</Text>
        )}
        <View style={styles.footer}>
          {["IMAGE", "VIDEO", "AUDIO"].includes(messageKind) && !!uri && (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.options}
              accessibilityLabel="Attachment options"
              onPress={attachmentMenu}
              onLongPress={onLongPress}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={COLORS.textGray}
              />
            </TouchableOpacity>
          )}
          <MessageMeta
            time={time}
            status={status}
            isSent={isSent}
            onRetry={onRetry}
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}
export default memo(MessageCard);
const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: SPACING.sm,
  },
  options: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    marginVertical: SPACING.xs,
    paddingHorizontal: LAYOUT.listPaddingHorizontal,
  },
  outgoing: { alignItems: "flex-end" },
  incoming: { alignItems: "flex-start" },
  bubble: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xxxxxl,
    borderWidth: 1,
    gap: SPACING.sm,
    overflow: "hidden",
  },
  sent: {
    backgroundColor: COLORS.bubbleBg,
    borderColor: COLORS.primaryGhostBorder,
    borderBottomRightRadius: BORDER_RADIUS.sm,
  },
  received: {
    backgroundColor: COLORS.bgWhite,
    borderColor: COLORS.borderGray,
    borderBottomLeftRadius: BORDER_RADIUS.sm,
  },
  text: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    lineHeight: TYPOGRAPHY.lineHeight.xl,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  author: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  avatar: { width: 24, height: 24, borderRadius: BORDER_RADIUS.full },
  avatarFallback: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryGhost,
  },
  authorName: {
    flex: 1,
    minWidth: 0,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  you: { fontSize: TYPOGRAPHY.fontSize.sm, color: COLORS.textGray },
});
