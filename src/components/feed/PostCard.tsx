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
  Pressable,
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

function relativePostTime(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const date = new Date(time);
  return `${date.toLocaleString("en", { month: "short" })} ${date.getDate()}`;
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

  const renderHeader = (overlay = false) => {
    const timeLabel = relativePostTime(post.timestamp);
    if (overlay) {
      return (
        <View style={styles.headerOverlay}>
          <TouchableOpacity
            style={styles.authorPill}
            activeOpacity={theme.OPACITY.semiTransparent}
            onPress={() => onUserPress?.(post.author.username)}
          >
            <Image
              source={{ uri: post.author.avatarUrl ?? undefined }}
              style={[styles.avatar, styles.avatarPill]}
            />
            <View style={styles.authorPillCopy}>
              <View style={styles.authorPillNameRow}>
                <Text style={styles.userNameOverlay} numberOfLines={1}>
                  {post.author.displayName}
                </Text>
                {post.author.isVerified ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color="#4C9AFF"
                  />
                ) : null}
              </View>
              <Text style={styles.userHandleOverlay} numberOfLines={1}>
                @{post.author.username}
                {timeLabel ? ` (${timeLabel})` : ""}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerOverlayActions}>
            <TouchableOpacity
              onPress={handleBookmark}
              accessibilityRole="button"
              accessibilityLabel={
                bookmarked ? "Remove bookmark" : "Bookmark post"
              }
              style={styles.headerCircleButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={bookmarked ? "bookmark" : "bookmark-outline"}
                size={19}
                color={theme.COLORS.white}
              />
            </TouchableOpacity>
            <TouchableOpacity
              ref={menuButtonRef}
              onPress={handleMenuPress}
              accessibilityRole="button"
              accessibilityLabel="Post options"
              style={styles.headerCircleButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={20}
                color={theme.COLORS.white}
              />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
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
          <Text style={styles.userName} numberOfLines={1}>
            {post.author.displayName}
          </Text>
          <Text style={styles.userHandle} numberOfLines={1}>
            @{post.author.username} · {post.timestamp}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleBookmark}
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? "Remove bookmark" : "Bookmark post"}
            style={styles.headerAction}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={bookmarked ? "bookmark" : "bookmark-outline"}
              size={20}
              color={bookmarked ? FEED.accent : FEED.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            ref={menuButtonRef}
            onPress={handleMenuPress}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={FEED.muted}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderActions = () => (
    <View style={styles.actions}>
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
          colors={["rgba(0,0,0,0.58)", "rgba(0,0,0,0.12)", "transparent"]}
          style={styles.imageTopScrim}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(0,0,0,0.28)", "rgba(0,0,0,0.86)"]}
          style={styles.imageBottomScrim}
        />

        {imageLoading ? (
          <View style={styles.imageLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={theme.COLORS.white} />
          </View>
        ) : null}

        {hasMultipleMedia ? (
          <View style={styles.mediaZones} pointerEvents="box-none">
            {mediaIndex > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
                onPress={goToPrevMedia}
                style={styles.mediaPrevZone}
              />
            ) : null}
            {mediaIndex < mediaUrls.length - 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next photo"
                onPress={goToNextMedia}
                style={styles.mediaNextZone}
              />
            ) : null}
          </View>
        ) : null}

        {renderHeader(true)}

        <View style={styles.imageActionRail}>
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
            style={styles.imageAction}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <View style={styles.imageActionButton}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={21}
                  color={liked ? "#FF5A76" : theme.COLORS.white}
                />
              </Animated.View>
            </View>
            <Text style={styles.imageActionCount}>
              {formatCount(likeCount).toLowerCase()}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onComment?.(post.id)}
            accessibilityRole="button"
            accessibilityLabel="Comment on post"
            style={styles.imageAction}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <View style={styles.imageActionButton}>
              <Ionicons
                name="chatbubble-outline"
                size={20}
                color={theme.COLORS.white}
              />
            </View>
            <Text style={styles.imageActionCount}>
              {formatCount(post.commentCount).toLowerCase()}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onShare?.(post.id)}
            accessibilityRole="button"
            accessibilityLabel="Share post"
            style={styles.imageAction}
            activeOpacity={theme.OPACITY.semiTransparent}
          >
            <View style={styles.imageActionButton}>
              <Ionicons
                name="paper-plane-outline"
                size={20}
                color={theme.COLORS.white}
              />
            </View>
            <Text style={styles.imageActionCount}>
              {formatCount(post.shareCount ?? 0).toLowerCase()}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.imageBottomContent}>
          {hasMultipleMedia ? (
            <View style={styles.carouselProgress}>
              {mediaUrls.map((url, index) => (
                <View
                  key={`${url}-${index}`}
                  style={[
                    styles.carouselDash,
                    index === mediaIndex && styles.carouselDashActive,
                  ]}
                />
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!onOpen}
            onPress={() => onOpen?.(post.id)}
          >
            <Text style={styles.imageContent} numberOfLines={3}>
              {post.content ? <Text>{post.content} </Text> : null}
              {post.tags?.map((tag) => (
                <Text
                  key={tag}
                  style={styles.imageHashtag}
                  onPress={() => onTagPress?.(tag)}
                >
                  #{tag}{" "}
                </Text>
              ))}
            </Text>
          </TouchableOpacity>
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
    aspectRatio: 0.95,
    borderWidth: 0,
    backgroundColor: "#111114",
    justifyContent: "space-between",
  },
  headerOverlay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 10,
  },
  authorPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 4,
    paddingRight: 14,
    borderRadius: 24,
    backgroundColor: "rgba(17,17,20,0.44)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  avatarPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.85)",
  },
  authorPillCopy: {
    flex: 1,
    minWidth: 0,
  },
  authorPillNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  userNameOverlay: {
    flexShrink: 1,
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    lineHeight: 18,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  userHandleOverlay: {
    marginTop: 1,
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerOverlayActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCircleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,20,0.44)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  imageTopScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 128,
  },
  imageBottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 230,
  },
  mediaZones: {
    position: "absolute",
    top: 84,
    left: 0,
    right: 0,
    bottom: 90,
  },
  mediaPrevZone: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "35%",
  },
  mediaNextZone: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "35%",
  },
  imageActionRail: {
    position: "absolute",
    right: 10,
    top: "27%",
    alignItems: "center",
    gap: 12,
  },
  imageAction: {
    alignItems: "center",
    gap: 4,
  },
  imageActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,20,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  imageActionCount: {
    color: theme.COLORS.white,
    fontSize: 11,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  imageBottomContent: {
    paddingHorizontal: 16,
    paddingRight: 62,
    paddingBottom: 14,
    gap: 8,
  },
  carouselProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  carouselDash: {
    width: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  carouselDashActive: {
    width: 18,
    backgroundColor: theme.COLORS.white,
  },
  imageContent: {
    color: theme.COLORS.white,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  imageHashtag: {
    color: theme.COLORS.white,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
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