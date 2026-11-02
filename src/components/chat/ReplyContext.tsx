import { memo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { ReplyContextItem } from "@/utils/messaging/listItems";
import {
  authorName,
  messageMetadata,
  previewText,
  replyPreview,
} from "@/utils/messaging/presentation";
import {
  BORDER_RADIUS,
  COLORS,
  LAYOUT,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface Props {
  item: ReplyContextItem;
  userId: string;
  onNavigate: (id: string, context?: boolean) => void;
  onClose: () => void;
  onPage: (page: number) => void;
  onRefresh: () => void;
}
function ReplyContext({
  item,
  userId,
  onNavigate,
  onClose,
  onPage,
  onRefresh,
}: Props) {
  const parentAuthor =
    item.parent.senderId === userId
      ? "you"
      : authorName(messageMetadata(item.parent).author);
  return (
    <View style={styles.outer} testID="reply-context-panel">
      <View style={styles.panel}>
        <View style={styles.header}>
          <Ionicons
            name="return-down-forward-outline"
            size={19}
            color={COLORS.primaryDark}
          />
          <View style={styles.heading}>
            <Text style={styles.title}>Reply context</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Replies to {parentAuthor}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close reply context"
            style={styles.action}
            onPress={onClose}
          >
            <Ionicons name="close" size={19} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        {item.replies.map((row) => {
          const metadata = messageMetadata(row),
            own = row.senderId === userId;
          const sender = own ? "You" : authorName(metadata.author);
          return (
            <TouchableOpacity
              key={row.localId}
              style={[styles.reply, own && styles.ownReply]}
              onPress={() => onNavigate(row.id || row.localId, false)}
              accessibilityRole="button"
              accessibilityLabel={`Go to reply from ${sender}. ${previewText(replyPreview(row))}`}
            >
              {metadata.author?.avatarUrl ? (
                <Image
                  source={{ uri: metadata.author.avatarUrl }}
                  style={styles.avatar}
                  cachePolicy="memory-disk"
                  recyclingKey={metadata.author.avatarUrl}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons
                    name="person-outline"
                    size={15}
                    color={COLORS.primaryDark}
                  />
                </View>
              )}
              <View style={styles.replyCopy}>
                <Text style={styles.sender} numberOfLines={1}>
                  {sender}
                </Text>
                <Text style={styles.preview} numberOfLines={2}>
                  {previewText(replyPreview(row))}
                </Text>
              </View>
              <Ionicons
                name="arrow-forward-outline"
                size={15}
                color={COLORS.primaryDark}
              />
            </TouchableOpacity>
          );
        })}
        {!item.total && item.selection.status !== "loading" && (
          <Text style={styles.note}>
            No replies found in the available history.
          </Text>
        )}
        {item.selection.status === "loading" ? (
          <View style={styles.status}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.note}>Checking full reply history…</Text>
          </View>
        ) : (
          <Text style={styles.note}>
            {item.selection.status === "complete"
              ? `${item.total} ${item.total === 1 ? "reply" : "replies"} found`
              : "Cached replies · May be incomplete"}
          </Text>
        )}
        {!!item.selection.error && (
          <Text style={styles.note} accessibilityRole="alert">
            {item.selection.error}
          </Text>
        )}
        {(item.selection.status === "cached" ||
          item.selection.status === "error") && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry loading full reply context"
            style={styles.refresh}
            onPress={onRefresh}
          >
            <Text style={styles.link}>Check for more replies</Text>
          </TouchableOpacity>
        )}
        {item.pageCount > 1 && (
          <View style={styles.pager}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Previous replies"
              accessibilityState={{ disabled: item.page === 0 }}
              disabled={item.page === 0}
              style={styles.action}
              onPress={() => onPage(item.page - 1)}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={item.page ? COLORS.primaryDark : COLORS.textMuted}
              />
            </TouchableOpacity>
            <Text style={styles.note}>
              {item.page + 1} / {item.pageCount} · chronological order
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Next replies"
              accessibilityState={{ disabled: item.page + 1 >= item.pageCount }}
              disabled={item.page + 1 >= item.pageCount}
              style={styles.action}
              onPress={() => onPage(item.page + 1)}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  item.page + 1 < item.pageCount
                    ? COLORS.primaryDark
                    : COLORS.textMuted
                }
              />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.parent}>
          <Text style={styles.link}>Original message below</Text>
          <Ionicons name="arrow-down" color={COLORS.primaryDark} size={15} />
        </View>
      </View>
    </View>
  );
}
export default memo(ReplyContext);
const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: LAYOUT.listPaddingHorizontal,
    paddingVertical: SPACING.md,
  },
  panel: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    borderRadius: BORDER_RADIUS.xxxl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  heading: { flex: 1, minWidth: 0 },
  title: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: "600",
  },
  subtitle: { color: COLORS.textGray, fontSize: TYPOGRAPHY.fontSize.md },
  action: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  reply: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.bgWhite,
  },
  ownReply: { backgroundColor: COLORS.bubbleBg },
  avatar: { width: 28, height: 28, borderRadius: BORDER_RADIUS.full },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  replyCopy: { flex: 1, minWidth: 0 },
  sender: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: "600",
  },
  preview: {
    color: COLORS.textGray,
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: 18,
  },
  note: {
    color: COLORS.textGray,
    fontSize: TYPOGRAPHY.fontSize.md,
    lineHeight: 18,
  },
  status: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refresh: { minHeight: 44, justifyContent: "center" },
  parent: {
    flexDirection: "row",
    gap: SPACING.md,
    justifyContent: "flex-end",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.primaryGhostBorder,
    paddingTop: SPACING.md,
  },
  link: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
  },
});
