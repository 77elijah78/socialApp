import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import theme from '@/constants/theme';
import { SocialPost } from '@/types';
import { PostUser } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────



export interface SocialPostCardProps {
  post: SocialPost;
  onLike?: (postId: string, liked: boolean) => void;
  onComment?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onBookmark?: (postId: string, bookmarked: boolean) => void;
  onMenuPress?: (postId: string) => void;
  onTagPress?: (tag: string) => void;
  onUserPress?: (userId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// ─── Icons ────────────────────────────────────────────────────────────────────
// Using text-based icons for zero-dependency setup.
// Replace with react-native-vector-icons or @expo/vector-icons as needed.

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.xxxl, color: filled ? theme.COLORS.secondary : theme.COLORS.textMutedGray }}>
    {filled ? '♥' : '♡'}
  </Text>
);

const CommentIcon = () => (
  <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.xxl, color: theme.COLORS.textMutedGray }}>💬</Text>
);

const ShareIcon = () => (
  <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.xxl, color: theme.COLORS.textMutedGray }}>↑</Text>
);

const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.xxl, color: filled ? theme.COLORS.accentPurple : theme.COLORS.textMutedGray }}>
    {filled ? '🔖' : '🏷'}
  </Text>
);

const DotsIcon = () => (
  <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.xl5, color: theme.COLORS.textMutedGray, letterSpacing: theme.TYPOGRAPHY.letterSpacing.sm }}>···</Text>
);

const CheckIcon = () => (
  <Text style={{ fontSize: 8, color: theme.COLORS.textWhite }}>✓</Text>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostCard({
  post,
  onLike,
  onComment,
  onShare,
  onBookmark,
  onMenuPress,
  onTagPress,
  onUserPress,
}: SocialPostCardProps) {
  const [liked, setLiked] = useState(post.isLiked ?? false);
  const [bookmarked, setBookmarked] = useState(post.isBookmarked ?? false);
  const [likeCount, setLikeCount] = useState(post.likeCount);

  const handleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : c - 1));
    onLike?.(post.id, next);
  };

  const handleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    onBookmark?.(post.id, next);
  };

  return (
    <View style={styles.card}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => onUserPress?.(post.id)}
          activeOpacity={theme.OPACITY.semiTransparent}
        >
          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: post.user.avatarUrl }}
              style={styles.avatar}
            />
            {post.user.isVerified && (
              <View style={styles.verifiedBadge}>
                <CheckIcon />
              </View>
            )}
          </View>

          {/* Meta */}
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{post.user.name}</Text>
            <Text style={styles.userHandle}>
              @{post.user.username} · {post.timestamp}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 3-dot menu */}
        <TouchableOpacity
          onPress={() => onMenuPress?.(post.id)}
          style={styles.menuBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <DotsIcon />
        </TouchableOpacity>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>
        <Text style={styles.content}>{post.content}</Text>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <View style={styles.tags}>
            {post.tags.map((tag) => (
              <TouchableOpacity
                key={tag}
                onPress={() => onTagPress?.(tag)}
                activeOpacity={theme.OPACITY.semiTransparent}
              >
                <Text style={styles.tag}>#{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Post Image ── */}
      {post.imageUrl ? (
        <View style={styles.imageWrapper}>
          <Image
            source={{ uri: post.imageUrl }}
            style={styles.postImage}
            resizeMode="cover"
          />
        </View>
      ) : null}

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <View style={styles.actionsLeft}>
          {/* Like */}
          <TouchableOpacity
            onPress={handleLike}
            style={[styles.actionBtn, liked && styles.actionBtnLiked]}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <HeartIcon filled={liked} />
            <Text style={[styles.actionCount, liked && styles.actionCountLiked]}>
              {formatCount(likeCount)}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            onPress={() => onComment?.(post.id)}
            style={styles.actionBtn}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <CommentIcon />
            <Text style={styles.actionCount}>
              {formatCount(post.commentCount)}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            onPress={() => onShare?.(post.id)}
            style={styles.actionBtn}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <ShareIcon />
            <Text style={styles.actionCount}>
              {formatCount(post.shareCount)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bookmark */}
        <TouchableOpacity
          onPress={handleBookmark}
          style={[styles.actionBtn, bookmarked && styles.actionBtnBookmarked]}
          activeOpacity={theme.OPACITY.semiTransparent}
        >
          <BookmarkIcon filled={bookmarked} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxl,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.cardBorder,
    marginBottom: theme.SPACING.lg,
    overflow: 'hidden',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.SPACING.xl,
    paddingTop: theme.SPACING.xl,
    paddingBottom: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: theme.SPACING.lg,
  },
  avatar: {
    width: theme.SIZING.avatarMd,
    height: theme.SIZING.avatarMd,
    borderRadius: 21,
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.verifiedBorder,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -theme.SPACING.xs,
    right: -theme.SPACING.xs,
    width: theme.SIZING.iconXs,
    height: theme.SIZING.iconXs,
    borderRadius: theme.BORDER_RADIUS.xl,
    backgroundColor: theme.COLORS.accentPurple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.textDark,
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textDark,
    lineHeight: 18,
  },
  userHandle: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textDark,
    marginTop: theme.SPACING.xs,
  },
  menuBtn: {
    padding: 4,
    borderRadius: theme.BORDER_RADIUS.lg,
  },
  // Body
  body: {
    paddingHorizontal: theme.SPACING.xl,
    paddingBottom: theme.SPACING.lg,
  },
  content: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textDark,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xxl,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.SPACING.md,
    marginTop: theme.SPACING.md,
  },
  tag: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.tagText,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  // Image
  imageWrapper: {
    marginHorizontal: theme.SPACING.xl,
    marginBottom: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.xxxl,
    overflow: 'hidden',
    backgroundColor: theme.COLORS.bgImageWrapper,
  },
  postImage: {
    width: '100%',
    height: theme.SIZING.postImage,
  },
  // Divider
  divider: {
    height: 1,
    marginHorizontal: theme.SPACING.xl,
    backgroundColor: theme.COLORS.bgDivider,
  },
  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.md,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xl,
  },
  actionBtnLiked: {
    backgroundColor: theme.COLORS.likedActionBg,
  },
  actionBtnBookmarked: {
    backgroundColor: theme.COLORS.bookmarkedActionBg,
  },
  actionCount: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textDark,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  actionCountLiked: {
    color: theme.COLORS.secondary,
  },
});
