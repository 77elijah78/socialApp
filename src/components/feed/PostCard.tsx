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
  <Text style={{ fontSize: 16, color: filled ? '#f43f5e' : '#6b7280' }}>
    {filled ? '♥' : '♡'}
  </Text>
);

const CommentIcon = () => (
  <Text style={{ fontSize: 15, color: '#6b7280' }}>💬</Text>
);

const ShareIcon = () => (
  <Text style={{ fontSize: 15, color: '#6b7280' }}>↑</Text>
);

const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <Text style={{ fontSize: 15, color: filled ? '#7c3aed' : '#6b7280' }}>
    {filled ? '🔖' : '🏷'}
  </Text>
);

const DotsIcon = () => (
  <Text style={{ fontSize: 20, color: '#6b7280', letterSpacing: 1 }}>···</Text>
);

const CheckIcon = () => (
  <Text style={{ fontSize: 8, color: '#fff' }}>✓</Text>
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
          activeOpacity={0.7}
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
                activeOpacity={0.7}
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
            activeOpacity={0.7}
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
            activeOpacity={0.7}
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
            activeOpacity={0.7}
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
          activeOpacity={0.7}
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
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff12',
    marginBottom: 12,
    overflow: 'hidden',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#7c3aed59',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#16161d',
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16161d',
    lineHeight: 18,
  },
  userHandle: {
    fontSize: 12,
    color: '#16161d',
    marginTop: 2,
  },
  menuBtn: {
    padding: 4,
    borderRadius: 8,
  },
  // Body
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  content: {
    fontSize: 14,
    color: '#16161d)',
    lineHeight: 22,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    fontSize: 13,
    color: '#a78bfa',
    fontWeight: '500',
  },
  // Image
  imageWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  postImage: {
    width: '100%',
    height: 210,
  },
  // Divider
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  actionBtnLiked: {
    backgroundColor: 'rgba(244,63,94,0.1)',
  },
  actionBtnBookmarked: {
    backgroundColor: 'rgba(124,58,237,0.1)',
  },
  actionCount: {
    fontSize: 13,
    color: '#16161d',
    fontWeight: '500',
  },
  actionCountLiked: {
    color: '#f43f5e',
  },
});