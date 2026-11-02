import React, { useState } from "react";
import {
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { BORDER_RADIUS, COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";
import { Comment } from "@/types";

export interface CommentThreadNode {
  comment: Comment;
  replies: CommentThreadNode[];
  replyCount: number;
}

export function buildCommentThreads(comments: Comment[]): CommentThreadNode[] {
  const flattened: Comment[] = [];
  const seen = new Set<string>();

  const addComment = (comment: Comment, parentId?: string) => {
    const id = String(comment.id ?? "");
    if (!id || seen.has(id)) return;
    seen.add(id);

    const normalized = parentId && !comment.repliedToId
      ? { ...comment, repliedToId: parentId }
      : comment;
    flattened.push(normalized);

    for (const reply of comment.replies ?? []) {
      addComment(reply, normalized.id);
    }
  };

  comments.forEach((comment) => addComment(comment));

  const nodes = flattened.map((comment) => ({
    comment,
    replies: [] as CommentThreadNode[],
    replyCount: 0,
  }));
  const nodesById = new Map(nodes.map((node) => [node.comment.id, node]));
  const roots: CommentThreadNode[] = [];

  for (const node of nodes) {
    const parentId = node.comment.repliedToId;
    const parent = parentId ? nodesById.get(parentId) : undefined;
    if (parent && parent !== node) parent.replies.push(node);
    else roots.push(node);
  }

  const sortByDate = (left: CommentThreadNode, right: CommentThreadNode) =>
    new Date(left.comment.createdAt).getTime() -
    new Date(right.comment.createdAt).getTime();

  const setCountsAndSort = (items: CommentThreadNode[]) => {
    items.sort(sortByDate);
    items.forEach((item) => {
      setCountsAndSort(item.replies);
      item.replyCount = Math.max(
        Number(item.comment.repliesCount ?? item.comment._count?.replies ?? 0),
        item.replies.length,
      );
    });
  };

  setCountsAndSort(roots);
  return roots;
}

interface CommentThreadProps {
  node: CommentThreadNode;
  currentUserId?: string;
  keyboardIsVisible: boolean;
  onReply: (comment: Comment) => void;
  onProfilePress: (username: string) => void;
  depth?: number;
}

export function CommentThread({
  node,
  currentUserId,
  keyboardIsVisible,
  onReply,
  onProfilePress,
  depth = 0,
}: CommentThreadProps) {
  const { comment, replies, replyCount } = node;
  const authorName =
    comment.author?.username ?? comment.author?.displayName ?? "Unknown";
  const username = comment.author?.username;
  const isOwn = Boolean(currentUserId && (comment.authorId || comment.author?.id) === currentUserId);
  const timeLabel = formatCommentTime(comment.createdAt);
  const canShowReplies = replyCount > 0 || replies.length > 0;
  const [repliesExpanded, setRepliesExpanded] = useState(false);

  const handleProfilePress = () => {
    if (!username) return;
    if (keyboardIsVisible) {
      Keyboard.dismiss();
      return;
    }
    onProfilePress(username);
  };


  return (
    <View style={[styles.thread, depth > 0 && styles.replyThread]}>
      <View style={styles.commentRow}>
        <TouchableOpacity
          accessibilityRole={username ? "button" : undefined}
          accessibilityLabel={username ? `Open ${authorName}'s profile` : undefined}
          disabled={!username}
          onPress={handleProfilePress}
          activeOpacity={0.75}
          style={styles.avatarTapTarget}
        >
          <View style={styles.avatar}>
            {comment.author?.avatarUrl ? (
              <Image source={{ uri: comment.author.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>{authorName.charAt(0).toUpperCase() || "?"}</Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.commentMain}>
          <View style={styles.commentBubble}>
            <TouchableOpacity
              accessibilityRole={username ? "button" : undefined}
              disabled={!username}
              onPress={handleProfilePress}
              activeOpacity={0.75}
            >
              <Text style={styles.authorName}>
                {authorName}
                {isOwn ? <Text style={styles.youBadge}> · you</Text> : null}
              </Text>
            </TouchableOpacity>
            <Text style={styles.commentText}>{comment.content}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{timeLabel}</Text>
            <TouchableOpacity onPress={() => onReply(comment)} activeOpacity={0.7}>
              <Text style={styles.metaAction}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>

      {canShowReplies ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: repliesExpanded }}
          onPress={() => setRepliesExpanded((expanded) => !expanded)}
          activeOpacity={0.75}
          style={styles.repliesToggle}
        >
          <View style={styles.replyConnector} />
          <Text style={styles.repliesToggleText}>
            {repliesExpanded
              ? "Hide replies"
              : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
          </Text>
        </TouchableOpacity>
      ) : null}

      {repliesExpanded ? (
        <View style={styles.repliesList}>
          {replies.length > 0 ? (
            replies.map((reply) => (
              <CommentThread
                key={reply.comment.id}
                node={reply}
                currentUserId={currentUserId}
                keyboardIsVisible={keyboardIsVisible}
                onReply={onReply}
                onProfilePress={onProfilePress}
                depth={depth + 1}
              />
            ))
          ) : (
            <Text style={styles.replyUnavailable}>Replies will appear here.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function formatCommentTime(value: string | Date): string {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return "";

  const diffMs = Math.max(0, Date.now() - createdAt.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return createdAt.toLocaleDateString([], { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  thread: {
    paddingVertical: SPACING.xs,
  },
  replyThread: {
    paddingTop: 2,
    paddingBottom: SPACING.xs,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  avatarTapTarget: {
    paddingTop: 2,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.primary,
  },
  commentMain: {
    flex: 1,
    minWidth: 0,
  },
  commentBubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: COLORS.bgLight,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  authorName: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    marginBottom: 2,
  },
  youBadge: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  commentText: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: TYPOGRAPHY.lineHeight.lg,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingTop: 6,
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  metaAction: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  metaActionLiked: {
    color: COLORS.secondary,
  },
  likeButton: {
    width: 30,
    minHeight: 34,
    alignItems: "center",
    paddingTop: 7,
    gap: 1,
  },
  likeCount: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  likeCountLiked: {
    color: COLORS.secondary,
  },
  repliesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginLeft: 45,
    marginTop: 2,
    paddingVertical: SPACING.xs,
    alignSelf: "flex-start",
  },
  replyConnector: {
    width: 22,
    height: 1,
    backgroundColor: COLORS.borderGray,
  },
  repliesToggleText: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  repliesList: {
    marginLeft: 29,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.primaryGhostBorder,
    paddingLeft: SPACING.sm,
    marginTop: SPACING.xs,
  },
  replyUnavailable: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.sm,
    paddingVertical: SPACING.xs,
  },
});
