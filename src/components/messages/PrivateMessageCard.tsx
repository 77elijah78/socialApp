import { icons } from "@/constants";
import { PrivateMessageCardProps } from "@/types";
import theme from "@/constants/theme";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";

export default function PrivateMessageCard({
  message,
  sender,
  avatar,
  time,
  onPress,
  isRead,
  isSent,
  isBookmarked,
  onBookmarkPress,
  type,
  duration,
  newMessages,
  unreadCount,
  status,
  lastMessageStatus,
  onLongPress,
}: PrivateMessageCardProps) {
  const isUnread = newMessages || (unreadCount && unreadCount > 0);
  const displayTime = typeof time === "number" ? formatTime(time) : String(time ?? "");
  const lastMessageText = getLastMessageText(message, type, isSent);
  const messageStyle = isUnread ? styles.messageNotRead : styles.messageRead;
  const statusIcon = getStatusIcon(lastMessageStatus, isSent);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} onLongPress={onLongPress}>
      <Image source={avatar} style={styles.avatar} />
      <View style={styles.content}>
        <View style={styles.senderRow}>
          <Text style={styles.senderName}>{String(sender ?? "")}</Text>
          <Text style={styles.time}>{displayTime}</Text>
        </View>
        <View style={styles.messageRow}>
          {statusIcon ? <View style={styles.statusIconContainer}>{statusIcon}</View> : null}
          <Text style={messageStyle} numberOfLines={1}>
            {lastMessageText}
          </Text>
        </View>
        {typeof unreadCount === "number" && unreadCount > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? "99+" : String(unreadCount)}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getLastMessageText(message: string, type: string, isSent: boolean): string {
  if (type === "image") return isSent ? "You sent a photo" : "Photo";
  if (type === "video") return isSent ? "You sent a video" : "Video";
  if (type === "voice" || type === "audio") return isSent ? "You sent a voice message" : "Voice message";
  if (type === "document") return isSent ? "You sent a document" : "Document";
  if (type === "media") return isSent ? "You sent a media" : "Media";
  if (message && message.trim().length > 0) return message;
  return isSent ? "You sent a message" : "Message";
}

function getStatusIcon(status: string | undefined, isSent: boolean): React.ReactNode {
  if (!isSent) return null;

  switch (status) {
    case "READ":
      return (
        <View style={styles.statusRead}>
          <View style={styles.checkmark} />
          <View style={styles.checkmark} />
        </View>
      );
    case "DELIVERED":
      return (
        <View style={styles.statusDelivered}>
          <View style={styles.checkmark} />
        </View>
      );
    case "SENT":
    default:
      return (
        <View style={styles.statusSent}>
          <View style={styles.checkmark} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: theme.COLORS.white,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 15,
    height: theme.SIZING.privateMessageCard,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
  },
  avatar: {
    width: theme.SIZING.avatarXl,
    height: theme.SIZING.avatarXl,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxxl,
    marginRight: 10,
  },
  content: {
    flexDirection: "column",
    flex: 1,
    justifyContent: "center",
  },
  senderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  senderName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
  },
  time: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textTimeRead,
    marginLeft: 8,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusIconContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
  messageRead: {
    color: theme.COLORS.textTimeRead,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    flex: 1,
  },
  messageNotRead: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    flex: 1,
  },
  statusSent: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  statusDelivered: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  statusRead: {
    width: 20,
    height: 16,
    flexDirection: "row",
    marginLeft: 2,
  },
  checkmark: {
    width: 6,
    height: 10,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.COLORS.primary,
    transform: [{ rotate: "45deg" }],
    marginLeft: -2,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: theme.COLORS.textWhite,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
});
