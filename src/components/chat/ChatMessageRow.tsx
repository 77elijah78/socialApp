import { memo, useCallback, useEffect, useState } from "react";
import { Animated, View, Text, StyleSheet } from "react-native";
import type { MessageRow } from "@/db/schema";
import type { ChatListItem } from "@/utils/messaging/listItems";
import { authorName, messageMetadata } from "@/utils/messaging/presentation";
import {
  BORDER_RADIUS,
  COLORS,
  LAYOUT,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import MessageCard from "../messages/MessageCard";
import ReplyContext from "./ReplyContext";

interface Props {
  item: ChatListItem;
  userId: string;
  receiverName: string;
  isGroup?: boolean;
  onAction: (message: MessageRow) => void;
  onRetry: (message: MessageRow) => void;
  onNavigate: (id: string, context?: boolean) => void;
  onContextClose: () => void;
  onContextPage: (page: number) => void;
  onContextRefresh: () => void;
  highlight?: number;
}
function Highlight({ token }: { token: number }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    opacity.setValue(OPACITY.light);
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 1600,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, token]);
  return (
    <Animated.View
      testID="message-navigation-highlight"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.highlight, { opacity }]}
    />
  );
}
function ChatMessageRow({
  item,
  userId,
  receiverName,
  isGroup = false,
  onAction,
  onRetry,
  onNavigate,
  onContextClose,
  onContextPage,
  onContextRefresh,
  highlight = 0,
}: Props) {
  const message = item.kind === "message" ? item.message : null;
  const action = useCallback(() => {
    if (message) onAction(message);
  }, [message, onAction]);
  const retry = useCallback(() => {
    if (message) onRetry(message);
  }, [message, onRetry]);
  if (item.kind === "date")
    return (
      <View style={styles.date}>
        <Text style={styles.dateText}>{item.label}</Text>
      </View>
    );
  if (item.kind === "unread")
    return (
      <View style={styles.unread}>
        <View style={styles.line} />
        <Text style={styles.unreadText}>New messages</Text>
        <View style={styles.line} />
      </View>
    );
  if (item.kind === "reply-context")
    return (
      <ReplyContext
        item={item}
        userId={userId}
        onNavigate={onNavigate}
        onClose={onContextClose}
        onPage={onContextPage}
        onRefresh={onContextRefresh}
      />
    );
  const row = item.message,
    own = row.senderId === userId,
    metadata = messageMetadata(row);
  return (
    <View style={styles.message}>
      <MessageCard
        message={row.content}
        time={row.timestamp}
        sender={authorName(
          metadata.author,
          own ? "You" : isGroup ? "Unknown sender" : receiverName,
        )}
        senderAvatar={metadata.author?.avatarUrl}
        showAuthor={isGroup}
        ownerId={userId}
        isRead={row.isRead || row.status === "READ"}
        isSent={own}
        status={row.status}
        type={row.type}
        uri={row.mediaUrl ?? ""}
        thumbnailUri={row.thumbnailUrl ?? undefined}
        playbackId={row.localId}
        duration={row.duration ?? undefined}
        attachment={metadata.attachment}
        repliedTo={item.repliedTo}
        onReplyPress={onNavigate}
        onLongPress={action}
        onRetry={retry}
      />
      {highlight > 0 && <Highlight token={highlight} />}
    </View>
  );
}
export default memo(ChatMessageRow);
const styles = StyleSheet.create({
  message: { width: "100%", position: "relative" },
  highlight: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
  },
  date: {
    alignItems: "center",
    paddingVertical: SPACING.xs,
    marginVertical: SPACING.xs,
  },
  dateText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  unread: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.lg,
    paddingHorizontal: LAYOUT.listPaddingHorizontal,
    gap: SPACING.md,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.primaryGhostBorder,
  },
  unreadText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: "600",
    color: COLORS.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
