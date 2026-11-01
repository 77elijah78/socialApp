import React, { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import { COLORS } from "@/constants/theme";
import { activityDestination, activityTime, type ActivityItem, type ActivityType } from "@/services/NotificationService";

const ICONS: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  LIKE: "heart", COMMENT: "chatbubble", FOLLOW: "person-add", MESSAGE: "mail", MENTION: "at", SHARE: "arrow-redo",
};
const TINTS: Record<ActivityType, string> = {
  LIKE: COLORS.secondary, COMMENT: COLORS.primary, FOLLOW: COLORS.accentBlue,
  MESSAGE: COLORS.primary, MENTION: COLORS.accentPurple, SHARE: COLORS.green,
};
interface Props {
  item: ActivityItem;
  now: number;
  onOpen(item: ActivityItem): void;
  onActor(item: ActivityItem): void;
  onRead(item: ActivityItem): void;
}

/** Memoized at the row boundary: reads/arrivals keep unaffected item references.
 * Variable-height copy, bounded lines, no guessed row heights or media players. */
function ActivityRow({ item, now, onOpen, onActor, onRead }: Props) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const actor = item.actor;
  const name = actor ? `@${actor.username}` : item.hydrated ? "Unavailable account" : "Someone";
  const destination = activityDestination(item);
  const thumbnail = item.post?.imageUrls[0];
  const preview = item.comment?.content || item.post?.content;
  const label = destination?.kind === "post" ? "View post"
    : destination?.kind === "profile" ? "View profile" : destination?.kind === "messages" ? "Open messages"
      : !item.hydrated ? "Syncing details" : "Details unavailable";

  return (
    <Pressable
      testID={`activity-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.isRead ? "" : "Unread. "}${name} ${item.content}. ${activityTime(item.createdAt, now)}`}
      accessibilityHint={destination ? label : "Mark this activity as read and check availability"}
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.row, !item.isRead && styles.unreadRow, pressed && styles.pressed]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actor ? `View ${actor.username}'s profile` : "Profile unavailable"}
        disabled={!actor}
        onPress={event => { event.stopPropagation(); onActor(item); }}
        style={styles.avatarWrap}
      >
        {actor?.avatarUrl && failedAvatar !== actor.avatarUrl ? (
          <AuthenticatedImage uri={actor.avatarUrl} style={styles.avatar} contentFit="cover"
            onError={() => setFailedAvatar(actor.avatarUrl)} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            {actor ? <Text style={styles.initial}>{actor.username.charAt(0).toUpperCase()}</Text>
              : <Ionicons name="person-outline" size={22} color={COLORS.textSecondary} />}
          </View>
        )}
        <View style={[styles.typeBadge, { backgroundColor: TINTS[item.type] }]}>
          <Ionicons name={ICONS[item.type]} size={11} color={COLORS.white} />
        </View>
      </Pressable>
      <View style={styles.copy}>
        <Text style={styles.message} numberOfLines={3}>
          <Text style={styles.username} accessibilityRole={actor ? "link" : undefined}
            onPress={actor ? event => { event.stopPropagation(); onActor(item); } : undefined}>{name}</Text>
          {" "}{item.content}
        </Text>
        {preview ? <Text style={styles.preview} numberOfLines={2}>{preview}</Text> : null}
        <View style={styles.meta}>
          {!item.isRead ? <View testID="unread-indicator" accessibilityLabel="Unread" style={styles.unreadDot} /> : null}
          <Text style={styles.time} accessibilityLabel={new Date(item.createdAt).toLocaleString()}>{activityTime(item.createdAt, now)}</Text>
          <Text style={[styles.destination, !destination && styles.unavailable]} numberOfLines={1}>{label}</Text>
        </View>
      </View>
      <View style={styles.trailing}>
        {item.post ? (
          <View style={styles.thumbnail}>
            {thumbnail && failedThumbnail !== thumbnail ? (
              <AuthenticatedImage uri={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover"
                onError={() => setFailedThumbnail(thumbnail)} />
            ) : <Ionicons name={item.post.videoUrl ? "videocam-outline" : "document-text-outline"} size={21} color={COLORS.primary} />}
          </View>
        ) : null}
        {!item.isRead ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Mark activity from ${name} as read`}
            onPress={event => { event.stopPropagation(); onRead(item); }} style={styles.readButton} hitSlop={2}>
            <Ionicons name="checkmark" size={18} color={COLORS.primary} />
          </Pressable>
        ) : <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} style={styles.chevron} />}
      </View>
    </Pressable>
  );
}
export default memo(ActivityRow);
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, minHeight: 108,
    backgroundColor: COLORS.bgWhite, borderWidth: 1, borderColor: COLORS.bgWhite, borderRadius: 20 },
  unreadRow: { borderColor: COLORS.primaryGhostBorder, backgroundColor: COLORS.bgCard },
  pressed: { opacity: 0.7 },
  avatarWrap: { width: 46, height: 50, marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: 17 },
  avatarFallback: { backgroundColor: COLORS.bgInput, alignItems: "center", justifyContent: "center" },
  initial: { color: COLORS.primaryDark, fontWeight: "700", fontSize: 20 },
  typeBadge: { position: "absolute", bottom: 0, right: -3, width: 21, height: 21, borderRadius: 8,
    borderWidth: 2, borderColor: COLORS.bgWhite, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 6 },
  message: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 21 },
  username: { fontWeight: "700" },
  preview: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  meta: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 },
  time: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 17 },
  destination: { color: COLORS.primaryDark, fontSize: 11, lineHeight: 17, flexShrink: 1 },
  unavailable: { color: COLORS.textSecondary },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  trailing: { width: 44, alignItems: "center", gap: 1 },
  thumbnail: { width: 44, height: 44, overflow: "hidden", borderRadius: 12,
    backgroundColor: COLORS.bgInput, alignItems: "center", justifyContent: "center" },
  readButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  chevron: { marginVertical: 12 },
});
