import type { PrivateMessageCardProps } from "@/types";
import theme from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function PrivateMessageCard({
  message,
  sender,
  avatar,
  avatarUrl,
  avatarInitial,
  time,
  onPress,
  isSent,
  type,
  newMessages,
  unreadCount,
  lastMessageStatus,
  onLongPress,
}: PrivateMessageCardProps) {
  const isUnread = Boolean(newMessages || (unreadCount && unreadCount > 0));
  const displayTime = typeof time === "number" ? formatTime(time) : String(time ?? "");
  const lastMessageText = getLastMessageText(message, type, isSent);
  const avatarSource = avatarUrl ? { uri: avatarUrl } : avatar;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      style={[styles.container, isUnread && styles.containerUnread]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={240}
      activeOpacity={0.78}
    >
      <View style={styles.avatarWrap}>
        {avatarSource && avatarUrl ? (
          <Image source={avatarSource} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{avatarInitial || sender.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text style={[styles.senderName, isUnread && styles.senderNameUnread]} numberOfLines={1}>
            {String(sender ?? "")}
          </Text>
          <Text style={[styles.time, isUnread && styles.timeUnread]}>{displayTime}</Text>
        </View>

        <View style={styles.bottomLine}>
          {isSent ? (
            <View style={styles.statusIconContainer}>
              <StatusCheckmarks status={lastMessageStatus} />
            </View>
          ) : null}
          <Text style={[styles.message, isUnread && styles.messageUnread]} numberOfLines={1}>
            {lastMessageText}
          </Text>
          {typeof unreadCount === "number" && unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? "99+" : String(unreadCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {!unreadCount ? (
        <Ionicons name="chevron-forward" size={16} color="#C4C2D1" style={styles.chevron} />
      ) : null}
    </TouchableOpacity>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Now";
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
  if (type === "media") return isSent ? "You sent an attachment" : "Sent an attachment";
  if (type === "SHARED_POST") return isSent ? "You shared a post" : "Shared a post";
  if (type === "SHARED_STORY") return isSent ? "You shared a story" : "Shared a story";
  if (message && message.trim().length > 0) return message;
  return isSent ? "You sent a message" : "Start a conversation";
}

function StatusCheckmarks({ status }: { status?: string }) {
  const color = status === "READ" ? theme.COLORS.accentBlue : "#A5A3B2";
  return (
    <View style={styles.checkmarks}>
      <Ionicons name="checkmark-sharp" size={14} color={color} />
      {status === "DELIVERED" || status === "READ" ? (
        <Ionicons name="checkmark-sharp" size={14} color={color} style={styles.secondCheck} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    ...theme.SHADOWS.sm,
  },
  containerUnread: {
    borderColor: "rgba(108,92,231,0.22)",
    backgroundColor: "#FFFEFF",
  },
  avatarWrap: {
    width: 56,
    height: 56,
    marginRight: theme.SPACING.md,
    position: "relative",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEEAFE",
  },
  avatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  content: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
    gap: theme.SPACING.sm,
  },
  senderName: {
    flex: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  senderNameUnread: {
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  time: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  timeUnread: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  bottomLine: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  statusIconContainer: {
    marginRight: 4,
  },
  checkmarks: {
    flexDirection: "row",
    alignItems: "center",
  },
  secondCheck: {
    marginLeft: -8,
  },
  message: {
    flex: 1,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
  },
  messageUnread: {
    color: theme.COLORS.textPrimary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  unreadBadge: {
    minWidth: 23,
    height: 23,
    paddingHorizontal: 6,
    borderRadius: 12,
    marginLeft: theme.SPACING.sm,
    backgroundColor: theme.COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  chevron: {
    marginLeft: theme.SPACING.xs,
  },
});
