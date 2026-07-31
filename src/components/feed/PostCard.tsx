import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import { SocialPost } from '@/types';

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

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

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
  const [likeScale] = useState(new Animated.Value(1));

  const handleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : c - 1));
    onLike?.(post.id, next);

    Animated.sequence([
      Animated.timing(likeScale, {
        toValue: 1.35,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(likeScale, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    onBookmark?.(post.id, next);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        activeOpacity={theme.OPACITY.semiTransparent}
        onPress={() => onUserPress?.(post.id)}
      >
        <View style={styles.avatarWrapper}>
          <Image
            source={{ uri: post.user.avatarUrl }}
            style={styles.avatar}
          />
          {post.user.isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={theme.COLORS.accentPurple} />
            </View>
          )}
        </View>

        <View style={styles.userMeta}>
          <Text style={styles.userName}>{post.user.name}</Text>
          <Text style={styles.userHandle}>
            @{post.user.username} · {post.timestamp}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => onMenuPress?.(post.id)}
          style={styles.menuBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.COLORS.textMutedGray} />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.content}>{post.content}</Text>

        {post.tags && post.tags.length > 0 && (
          <View style={styles.tags}>
            {post.tags.map((tag) => (
              <TouchableOpacity
                key={tag}
                onPress={() => onTagPress?.(tag)}
                activeOpacity={theme.OPACITY.semiTransparent}
              >
                <View style={styles.tagPill}>
                  <Text style={styles.tag}>#{tag}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Post Image */}
      {post.imageUrl ? (
        <TouchableOpacity activeOpacity={0.95}>
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: post.imageUrl }}
              style={styles.postImage}
              resizeMode="cover"
            />
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.actionsLeft}>
          {/* Like */}
          <TouchableOpacity
            onPress={handleLike}
            style={[styles.actionBtn, liked && styles.actionBtnLiked]}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={22}
                color={liked ? theme.COLORS.secondary : theme.COLORS.textMutedGray}
              />
            </Animated.View>
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
            <Ionicons name="chatbubble-outline" size={20} color={theme.COLORS.textMutedGray} />
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
            <Ionicons name="share-outline" size={20} color={theme.COLORS.textMutedGray} />
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
          <Ionicons
            name={bookmarked ? "bookmark" : "bookmark-outline"}
            size={20}
            color={bookmarked ? theme.COLORS.accentPurple : theme.COLORS.textMutedGray}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = {
  card: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.cardBorder,
    marginBottom: theme.SPACING.lg,
    overflow: 'hidden',
    ...theme.SHADOWS.sm,
  } as const,
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.SPACING.xl,
    paddingTop: theme.SPACING.xl,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.lg,
  } as const,
  avatarWrapper: {
    position: 'relative',
  } as const,
  avatar: {
    width: theme.SIZING.avatarLg,
    height: theme.SIZING.avatarLg,
    borderRadius: theme.SIZING.avatarLg / 2,
    backgroundColor: theme.COLORS.bgLight,
  } as const,
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.full,
    padding: 2,
  } as const,
  userMeta: {
    flex: 1,
  } as const,
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textDark,
    lineHeight: 20,
  } as const,
  userHandle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginTop: theme.SPACING.xs,
  } as const,
  menuBtn: {
    padding: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
  } as const,
  body: {
    paddingHorizontal: theme.SPACING.xl,
    paddingBottom: theme.SPACING.lg,
    gap: theme.SPACING.md,
  } as const,
  content: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textPrimary,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xxl,
  } as const,
  tags: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.SPACING.sm,
  } as const,
  tagPill: {
    backgroundColor: theme.COLORS.primaryGhost,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.primaryGhostBorder,
  } as const,
  tag: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.tagText,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  } as const,
  imageWrapper: {
    marginHorizontal: theme.SPACING.xl,
    marginBottom: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.xxxl,
    overflow: 'hidden',
    backgroundColor: theme.COLORS.bgImageWrapper,
  } as const,
  postImage: {
    width: '100%',
    height: theme.SIZING.postImage,
  } as const,
  divider: {
    height: theme.BORDER.width.xs,
    marginHorizontal: theme.SPACING.xl,
    backgroundColor: theme.COLORS.bgDivider,
  } as const,
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.md,
  } as const,
  actionsLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.SPACING.xs,
  } as const,
  actionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xl,
  } as const,
  actionBtnLiked: {
    backgroundColor: theme.COLORS.likedActionBg,
  } as const,
  actionBtnBookmarked: {
    backgroundColor: theme.COLORS.bookmarkedActionBg,
  } as const,
  actionCount: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textDark,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  } as const,
  actionCountLiked: {
    color: theme.COLORS.secondary,
  } as const,
};
