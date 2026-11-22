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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { FEED } from "@/constants/feedTheme";
import * as theme from "@/constants/theme";
import { SocialPost } from "@/types";
import { formatCount } from "@/utils/format";

// Defer video-module evaluation and native resources; never preload a player on startup.
const PostVideo = React.lazy(() => import("@/components/messages/Videoplayer"));

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
  /** Opens the shared post-detail route; never opens comments implicitly. */
  onOpen?: (postId: string) => void;
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
  onOpen,
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

  const hasImageCard = Boolean(currentMedia) && !post.videoUrl;

  const renderHeader = (overlay = false) => (
    <TouchableOpacity
      style={[styles.header, overlay && styles.headerOverlay]}
      activeOpacity={theme.OPACITY.semiTransparent}
      onPress={() => onUserPress?.(post.author.username)}
    >
      <View style={styles.avatarWrapper}>
        <Image
          source={{ uri: post.author.avatarUrl ?? undefined }}
          style={[styles.avatar, overlay && styles.avatarOverlay]}
        />
        {post.author.isVerified && (
          <View style={styles.verifiedBadge}>
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={overlay ? theme.COLORS.white : theme.COLORS.accentPurple}
            />
          </View>
        )}
      </View>

      <View style={styles.userMeta}>
        <Text
          style={[styles.userName, overlay && styles.userNameOverlay]}
          numberOfLines={1}
        >
          {post.author.displayName}
        </Text>
        <Text
          style={[styles.userHandle, overlay && styles.userHandleOverlay]}
          numberOfLines={1}
        >
          @{post.author.username} · {post.timestamp}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity
          onPress={handleBookmark}
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? "Remove bookmark" : "Bookmark post"}
          style={[styles.headerAction, overlay && styles.headerActionOverlay]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={bookmarked ? "bookmark" : "bookmark-outline"}
            size={20}
            color={
              overlay
                ? theme.COLORS.white
                : bookmarked
                  ? FEED.accent
                  : FEED.text
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          ref={menuButtonRef}
          onPress={handleMenuPress}
          style={[styles.headerAction, overlay && styles.headerActionOverlay]}
          accessibilityRole="button"
          accessibilityLabel="Post options"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={overlay ? theme.COLORS.white : FEED.muted}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderActions = (overlay = false) => (
    <View style={[styles.actions, overlay && styles.actionsOverlay]}>
      <View style={styles.actionsLeft}>
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
          style={[
            styles.actionBtn,
            overlay && styles.actionBtnOverlay,
            liked && styles.actionBtnLiked,
          ]}
          activeOpacity={theme.OPACITY.semiTransparent}
        >
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={22}
              color={
                overlay
                  ? liked
                    ? "#FF7185"
                    : theme.COLORS.white
                  : liked
                    ? theme.COLORS.secondary
                    : theme.COLORS.textMutedGray
              }
            />
          </Animated.View>
          <Text
            style={[
              styles.actionCount,
              overlay && styles.actionCountOverlay,
              liked && styles.actionCountLiked,
            ]}
          >
            {formatCount(likeCount)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onComment?.(post.id)}
          style={[styles.actionBtn, overlay && styles.actionBtnOverlay]}
          activeOpacity={theme.OPACITY.semiTransparent}
        >
          <Ionicons
            name="chatbubble-outline"
            size={20}
            color={overlay ? theme.COLORS.white : theme.COLORS.textMutedGray}
          />
          <Text
            style={[styles.actionCount, overlay && styles.actionCountOverlay]}
          >
            {formatCount(post.commentCount)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onShare?.(post.id)}
          style={[styles.actionBtn, overlay && styles.actionBtnOverlay]}
          activeOpacity={theme.OPACITY.semiTransparent}
        >
          <Ionicons
            name="share-outline"
            size={20}
            color={overlay ? theme.COLORS.white : theme.COLORS.textMutedGray}
          />
          <Text
            style={[styles.actionCount, overlay && styles.actionCountOverlay]}
          >
            {formatCount(post.shareCount)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (hasImageCard) {
    return (
      <View style={[styles.card, styles.imageCard]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: currentMedia }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoadStart={() => setImageLoading(true)}
            onLoad={() => setImageLoading(false)}
            onError={() => setImageLoading(false)}
          />
        </Animated.View>

        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0.62)", "rgba(0,0,0,0.18)", "transparent"]}
          style={styles.imageTopScrim}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(0,0,0,0.32)", "rgba(0,0,0,0.86)"]}
          style={styles.imageBottomScrim}
        />

        {imageLoading ? (
          <View style={styles.imageLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={theme.COLORS.white} />
          </View>
        ) : null}

        {hasMultipleMedia ? (
          <View style={styles.mediaNavContainer} pointerEvents="box-none">
            {mediaIndex > 0 ? (
              <TouchableOpacity
                style={styles.mediaNavBtn}
                onPress={goToPrevMedia}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color={theme.COLORS.white}
                />
              </TouchableOpacity>
            ) : null}
            {mediaIndex < mediaUrls.length - 1 ? (
              <TouchableOpacity
                style={[styles.mediaNavBtn, styles.mediaNavBtnRight]}
                onPress={goToNextMedia}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={theme.COLORS.white}
                />
              </TouchableOpacity>
            ) : null}
            <View style={styles.imageCounter}>
              <Text style={styles.mediaCounterText}>
                {mediaIndex + 1}/{mediaUrls.length}
              </Text>
            </View>
          </View>
        ) : null}

        {renderHeader(true)}

        <View style={styles.imageBottomContent}>
          {post.content ? (
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={!onOpen}
              onPress={() => onOpen?.(post.id)}
            >
              <Text style={styles.imageContent} numberOfLines={4}>
                {post.content}
              </Text>
            </TouchableOpacity>
          ) : null}

          {post.tags && post.tags.length > 0 ? (
            <View style={styles.tags}>
              {post.tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => onTagPress?.(tag)}
                  activeOpacity={theme.OPACITY.semiTransparent}
                  style={styles.tagPillOverlay}
                >
                  <Text style={styles.tagOverlay}>#{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {renderActions(true)}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {renderHeader()}

      {/* Body */}
      <TouchableOpacity
        activeOpacity={0.92}
        disabled={!onOpen}
        onPress={() => onOpen?.(post.id)}
        style={styles.body}
      >
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
      </TouchableOpacity>

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
        <TouchableOpacity
          activeOpacity={0.95}
          disabled={!onOpen}
          onPress={() => onOpen?.(post.id)}
          style={styles.imageWrapper}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
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

      {renderActions()}
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
    backgroundColor: FEED.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: FEED.border,
    marginBottom: theme.SPACING.lg,
    overflow: "hidden",
    ...theme.SHADOWS.sm,
  },
  imageCard: {
    aspectRatio: 4 / 5,
    borderWidth: 0,
    backgroundColor: "#111114",
    justifyContent: "space-between",
  },
  headerOverlay: {
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  avatarOverlay: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
  },
  userNameOverlay: {
    color: theme.COLORS.white,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  userHandleOverlay: {
    color: "rgba(255,255,255,0.78)",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerActionOverlay: {
    backgroundColor: "rgba(0,0,0,0.26)",
  },
  imageTopScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  imageBottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
  },
  imageCounter: {
    position: "absolute",
    top: 62,
    right: 14,
    backgroundColor: "rgba(0,0,0,0.46)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  imageBottomContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: theme.SPACING.sm,
  },
  imageContent: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionsOverlay: {
    paddingHorizontal: 4,
    paddingVertical: theme.SPACING.xs,
  },
  actionBtnOverlay: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  actionCountOverlay: {
    color: theme.COLORS.white,
  },
  tagPillOverlay: {
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: theme.BORDER.width.xs,
    borderColor: "rgba(255,255,255,0.3)",
  },
  tagOverlay: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.white,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.md,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: FEED.imageFallback,
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
    color: FEED.text,
    lineHeight: 19,
  },
  userHandle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: FEED.muted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerAction: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.BORDER_RADIUS.full,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: theme.SPACING.md,
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
    marginHorizontal: 14,
    marginBottom: theme.SPACING.md,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: FEED.imageFallback,
  },
  postImage: {
    width: "100%",
    aspectRatio: 1,
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: theme.SPACING.sm,
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
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xl,
  },
  actionBtnLiked: {
    backgroundColor: theme.COLORS.likedActionBg,
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