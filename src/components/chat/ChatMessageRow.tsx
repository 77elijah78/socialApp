import { memo, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { MessageRow } from "@/db/schema";
import type { ChatListItem } from "@/utils/messaging/listItems";
import theme from "@/constants/theme";
import MessageCard from "../messages/MessageCard";

interface Props {
  item: ChatListItem;
  userId: string;
  receiverName: string;
  onAction: (message: MessageRow) => void;
  onRetry: (message: MessageRow) => void;
}
function messageType(type: string) {
  return (
    (
      {
        TEXT: "text",
        IMAGE: "image/jpeg",
        VIDEO: "video/mp4",
        AUDIO: "audio/mpeg",
        DOCUMENT: "document",
      } as Record<string, string>
    )[type] ?? type
  );
}
function ChatMessageRow({
  item,
  userId,
  receiverName,
  onAction,
  onRetry,
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
  const row = item.message;
  return (
    <MessageCard
      message={row.content}
      time={row.timestamp}
      sender={row.senderId === userId ? "You" : receiverName}
      isRead={row.isRead || row.status === "READ"}
      isSent={row.senderId === userId}
      status={row.status}
      type={messageType(row.type)}
      uri={row.mediaUrl ?? ""}
      thumbnailUri={row.thumbnailUrl ?? undefined}
      playbackId={row.localId}
      duration={row.duration ?? undefined}
      repliedTo={item.repliedTo}
      onLongPress={action}
      onRetry={retry}
    />
  );
}
export default memo(ChatMessageRow);
const styles = StyleSheet.create({
  date: {
    alignItems: "center",
    paddingVertical: theme.SPACING.xs,
    marginVertical: theme.SPACING.xs,
  },
  dateText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: "600",
    color: theme.COLORS.textSecondary,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  unread: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.SPACING.lg,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
    gap: theme.SPACING.md,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.COLORS.primaryGhostBorder,
  },
  unreadText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: "600",
    color: theme.COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
