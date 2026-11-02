import { showAppDialog } from "@/services/AppDialogService";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as theme from "@/constants/theme";
import { SocialPost } from "@/types";

// Defer video-module evaluation and native resources; never preload a player on startup.
const PostVideo = React.lazy(() => import("@/components/messages/Videoplayer"));

function formatCount(n: number): string {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export interface SocialPostCardProps {
  post: SocialPost;
  onLike?: (postId: string, liked: boolean) => void | Promise<void>;
  onComment?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onBookmark?: (postId: string, bookmarked: boolean) => void | Promise<void>;
  onMenuPress?: (
    postId: string,
    anchor?: { x: number; y: number; width: number; height: number },
  ) => void;
  onTagPress?: (tag: string) => void;
  onUserPress?: (username: string) => void;
}

function PostCard({
  post,
  onLike,
  onComment,
  onShare,
  onBookmark,
  onMenuPress,
  onTagPress,
  onUserPress,
}: SocialPostCardProps) {
  const [videoWidth, setVideoWidth] = useState(0);
  const pendingLike = useRef(false);
  const pendingBookmark = useRef(false);
  const [liked, setLiked] = useState(post.isLiked ?? false);
  const [bookmarked, setBookmarked] = useState(post.isBookmarked ?? false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likeScale] = useState(new Animated.Value(1));
  const [imageLoading, setImageLoading] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(1));

  const menuButtonRef = useRef<any>(null);

  const mediaUrls = useMemo(
    () =>
      post.imageUrls && post.imageUrls.length > 0
        ? post.imageUrls
        : post.imageUrl
          ? [post.imageUrl]
          : [],
    [post.imageUrls, post.imageUrl],
  );
  const currentMedia = mediaUrls[mediaIndex] ?? "";
  const hasMultipleMedia = mediaUrls.length > 1;

  useEffect(() => {
    // Parent confirmation/reconciliation owns the durable state of this local optimistic snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiked(post.isLiked ?? false);
    setLikeCount(post.likeCount);
    setBookmarked(post.isBookmarked ?? false);
    setMediaIndex(0);
  }, [post.id, post.isLiked, post.likeCount, post.isBookmarked]);

  const handleMenuPress = useCallback(() => {
    menuButtonRef.current?.measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        onMenuPress?.(post.id, { x, y, width, height });
      },
    );
  }, [onMenuPress, post.id]);

  const goToNextMedia = useCallback(() => {
    if (mediaIndex < mediaUrls.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      setMediaIndex((i) => i + 1);
    }
  }, [mediaIndex, mediaUrls.length, fadeAnim]);

  const goToPrevMedia = useCallback(() => {
    if (mediaIndex > 0) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      setMediaIndex((i) => i - 1);
    }
  }, [mediaIndex, fadeAnim]);

  const handleLike = useCallback(async () => {
    if (!onLike || pendingLike.current) return;
    pendingLike.current = true;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : c - 1));
    try {
      await onLike(post.id, next);
    } catch (error) {
      setLiked(liked);
      setLikeCount(post.likeCount);
      showAppDialog({
        title: "Couldn’t update like",
        message: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      pendingLike.current = false;
    }

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
  }, [liked, onLike, post.id, post.likeCount, likeScale]);

  const handleBookmark = useCallback(async () => {
    if (!onBookmark || pendingBookmark.current) return;
    pendingBookmark.current = true;
    const next = !bookmarked;
    setBookmarked(next);
    try {
      await onBookmark(post.id, next);
    } catch (error) {
      setBookmarked(bookmarked);
      showAppDialog({
        title: "Couldn’t update bookmark",
        message: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      pendingBookmark.current = false;
    }
  }, [bookmarked, onBookmark, post.id]);

  const fadeStyle = useMemo(
    () => ({ opacity: fadeAnim, width: "100%" }),
    [fadeAnim],
  ) as ViewStyle;

  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        activeOpacity={theme.OPACITY.semiTransparent}
        onPress={() => onUserPress?.(post.author.username)}
      >
        <View style={styles.avatarWrapper}>
          <Image
            source={{ uri: post.author.avatarUrl ?? undefined }}
            style={styles.avatar}
          />
          {post.author.isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={theme.COLORS.accentPurple}
              />
            </View>
          )}
        </View>

        <View style={styles.userMeta}>
          <Text style={styles.userName}>{post.author.displayName}</Text>
          <Text style={styles.userHandle}>
            @{post.author.username} · {post.timestamp}
          </Text>
        </View>

        <TouchableOpacity
          ref={menuButtonRef}
          onPress={handleMenuPress}
          style={styles.menuBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={theme.COLORS.textMutedGray}
          />
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

      {post.videoUrl ? (
        <View style={styles.videoWrapper}>
          <View
            testID="post-video-frame"
            style={styles.videoFrame}
            onLayout={(event) => setVideoWidth(event.nativeEvent.layout.width)}
          >
            {videoWidth > 0 ? (
              <React.Suspense
                fallback={<ActivityIndicator color={theme.COLORS.primary} />}
              >
                <PostVideo
                  uri={post.videoUrl}
                  width={videoWidth}
                  height={(videoWidth * 9) / 16}
                />
              </React.Suspense>
            ) : (
              <ActivityIndicator color={theme.COLORS.primary} />
            )}
          </View>
        </View>
      ) : null}

      {/* Post Image */}
      {currentMedia ? (
        <TouchableOpacity activeOpacity={0.95} style={styles.imageWrapper}>
          <Animated.View style={fadeStyle}>
            <Image
              source={{ uri: currentMedia }}
              style={styles.postImage}
              resizeMode="cover"
              onLoadStart={() => setImageLoading(true)}
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
            />
          </Animated.View>
          {imageLoading && (
            <View style={styles.imageLoadingOverlay}>
              <ActivityIndicator size="small" color={theme.COLORS.primary} />
            </View>
          )}
          {hasMultipleMedia && (
            <View style={styles.mediaNavContainer}>
              {mediaIndex > 0 && (
                <TouchableOpacity
                  style={styles.mediaNavBtn}
                  onPress={goToPrevMedia}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="chevron-back"
                    size={24}
                    color={theme.COLORS.white}
                  />
                </TouchableOpacity>
              )}
              {mediaIndex < mediaUrls.length - 1 && (
                <TouchableOpacity
                  style={[styles.mediaNavBtn, styles.mediaNavBtnRight]}
                  onPress={goToNextMedia}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={24}
                    color={theme.COLORS.white}
                  />
                </TouchableOpacity>
              )}
              <View style={styles.mediaCounter}>
                <Text style={styles.mediaCounterText}>
                  {mediaIndex + 1}/{mediaUrls.length}
                </Text>
              </View>
            </View>
          )}
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
            accessibilityRole="button"
            accessibilityLabel={
              liked
                ? "Unlike post"
                : post.likeStateKnown === false
                  ? "Like post; existing like status is unavailable"
                  : "Like post"
            }
            style={[styles.actionBtn, liked && styles.actionBtnLiked]}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={22}
                color={
                  liked ? theme.COLORS.secondary : theme.COLORS.textMutedGray
                }
              />
            </Animated.View>
            <Text
              style={[styles.actionCount, liked && styles.actionCountLiked]}
            >
              {formatCount(likeCount)}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            onPress={() => onComment?.(post.id)}
            style={styles.actionBtn}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <Ionicons
              name="chatbubble-outline"
              size={20}
              color={theme.COLORS.textMutedGray}
            />
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
            <Ionicons
              name="share-outline"
              size={20}
              color={theme.COLORS.textMutedGray}
            />
            <Text style={styles.actionCount}>
              {formatCount(post.shareCount)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bookmark */}
        <TouchableOpacity
          onPress={handleBookmark}
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? "Remove bookmark" : "Bookmark post"}
          style={[styles.actionBtn, bookmarked && styles.actionBtnBookmarked]}
          activeOpacity={theme.OPACITY.semiTransparent}
        >
          <Ionicons
            name={bookmarked ? "bookmark" : "bookmark-outline"}
            size={20}
            color={
              bookmarked
                ? theme.COLORS.accentPurple
                : theme.COLORS.textMutedGray
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const MemoizedPostCard = React.memo(PostCard);

export default MemoizedPostCard;

const styles = StyleSheet.create({
  // Reserve responsive geometry before lazy code resolves, including constrained/tablet cards.
  videoFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    alignItems: "center",
    justifyContent: "center",
  },
  videoWrapper: {
    marginHorizontal: theme.SPACING.lg,
    marginBottom: theme.SPACING.lg,
  },
  card: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.cardBorder,
    marginBottom: theme.SPACING.lg,
    overflow: "hidden",
    ...theme.SHADOWS.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xl,
    paddingTop: theme.SPACING.xl,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.lg,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: theme.SIZING.avatarLg,
    height: theme.SIZING.avatarLg,
    borderRadius: theme.SIZING.avatarLg / 2,
    backgroundColor: theme.COLORS.bgLight,
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.full,
    padding: 2,
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textDark,
    lineHeight: 20,
  },
  userHandle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginTop: theme.SPACING.xs,
  },
  menuBtn: {
    padding: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  body: {
    paddingHorizontal: theme.SPACING.xl,
    paddingBottom: theme.SPACING.lg,
    gap: theme.SPACING.md,
  },
  content: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textPrimary,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xxl,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.SPACING.sm,
  },
  tagPill: {
    backgroundColor: theme.COLORS.primaryGhost,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  tag: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.tagText,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  imageWrapper: {
    marginHorizontal: theme.SPACING.xl,
    marginBottom: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.xxxl,
    overflow: "hidden",
    backgroundColor: theme.COLORS.bgImageWrapper,
  },
  postImage: {
    width: "100%",
    height: theme.SIZING.postImage,
  },
  imageLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaNavContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  mediaNavBtn: {
    position: "absolute",
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaNavBtnRight: {
    left: undefined,
    right: 8,
  },
  mediaCounter: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mediaCounterText: {
    color: theme.COLORS.white,
    fontSize: 11,
    fontWeight: "600",
  },
  divider: {
    height: theme.BORDER.width.xs,
    marginHorizontal: theme.SPACING.xl,
    backgroundColor: theme.COLORS.bgDivider,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.md,
  },
  actionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
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