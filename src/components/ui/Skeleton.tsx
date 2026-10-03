import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
  Dimensions,
  type LayoutChangeEvent,
  type DimensionValue,
  type ViewStyle,
} from "react-native";
import theme from "@/constants/theme";

/*
 * Every skeleton in this file mirrors the exact layout of the real component
 * it stands in for, so the screen does not visibly reflow when data lands:
 *   FeedPostSkeleton          -> components/feed/PostCard
 *   StorySkeleton             -> components/feed/StoriesBar (StoryRing)
 *   ProfileSkeleton           -> app/user/[username] (profile header)
 *   ProfileGridSkeleton       -> app/user/[username] (post grid)
 *   ConversationRowSkeleton   -> components/messages/PrivateMessageCard
 *   ChatBubbleSkeleton        -> components/chat/MessageBubble
 *   CommentsSkeleton          -> app/posts/[id]/comments (CommentItem)
 */

const SKELETON_BASE = theme.COLORS.bgInput;
const SKELETON_HIGHLIGHT = theme.COLORS.bgWhite;
const SKELETON_ON_PRIMARY = "rgba(255,255,255,0.32)";
const SKELETON_ON_PRIMARY_HIGHLIGHT = "rgba(255,255,255,0.5)";
const SHIMMER_DURATION = 1300;
const SHIMMER_MIN_WIDTH = 24;
const SHIMMER_MAX_WIDTH = 110;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_COLUMNS = 3;
const GRID_GAP = theme.SPACING.sm;
const GRID_ITEM_SIZE =
  (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
  GRID_COLUMNS;

/* -------------------------------------------------------------------------- */
/* Shared shimmer driver                                                      */
/* One native-driven loop for every box on screen instead of one loop each.    */
/* -------------------------------------------------------------------------- */

const driver = new Animated.Value(0);
let driverLoop: Animated.CompositeAnimation | null = null;
let activeBoxes = 0;
let reduceMotionEnabled = false;
let motionSubscription: { remove: () => void } | null = null;
const reduceMotionListeners = new Set<() => void>();

function notifyReduceMotion() {
  reduceMotionListeners.forEach((listener) => listener());
}

function trackReduceMotion() {
  if (motionSubscription) return;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      reduceMotionEnabled = enabled;
      notifyReduceMotion();
    })
    .catch(() => undefined);
  motionSubscription = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    (enabled) => {
      reduceMotionEnabled = enabled;
      notifyReduceMotion();
    },
  );
}

function startDriver() {
  if (driverLoop) return;
  driver.setValue(0);
  driverLoop = Animated.loop(
    Animated.timing(driver, {
      toValue: 1,
      duration: SHIMMER_DURATION,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }),
  );
  driverLoop.start();
}

function stopDriver() {
  if (!driverLoop) return;
  driverLoop.stop();
  driverLoop = null;
}

function useShimmer(enabled: boolean) {
  const [reduced, setReduced] = useState(reduceMotionEnabled);

  useEffect(() => {
    trackReduceMotion();
    const listener = () => setReduced(reduceMotionEnabled);
    reduceMotionListeners.add(listener);
    return () => {
      reduceMotionListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!enabled || reduced) return;
    activeBoxes += 1;
    startDriver();
    return () => {
      activeBoxes -= 1;
      if (activeBoxes <= 0) {
        activeBoxes = 0;
        stopDriver();
      }
    };
  }, [enabled, reduced]);

  return { value: driver, reduced };
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  /** Overrides the placeholder fill, e.g. for lines drawn on a filled bubble. */
  color?: string;
  /** Set false for tiny glyph-sized placeholders where a sweep only adds noise. */
  shimmer?: boolean;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
  accessibilityLabel?: string;
};

export function SkeletonBox({
  width = "100%",
  height = 16,
  borderRadius = theme.BORDER_RADIUS.md,
  color = SKELETON_BASE,
  shimmer = true,
  style,
  testID,
  accessibilityLabel,
}: SkeletonProps) {
  const { value, reduced } = useShimmer(true);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setMeasuredWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  }, []);

  const shimmerWidth =
    measuredWidth > 0
      ? Math.min(Math.max(measuredWidth * 0.5, SHIMMER_MIN_WIDTH), SHIMMER_MAX_WIDTH)
      : 0;

  const translateX = value.interpolate({
    inputRange: [0, 1],
    outputRange: [-shimmerWidth - 12, measuredWidth + 12],
  });

  const isLabelled = accessibilityLabel != null;
  const isOnPrimary = color === SKELETON_ON_PRIMARY;

  return (
    <View
      testID={testID}
      onLayout={handleLayout}
      accessible={isLabelled}
      accessibilityRole={isLabelled ? "progressbar" : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, { width, height, borderRadius, backgroundColor: color }, style]}
    >
      {shimmer && shimmerWidth > 0 && !reduced ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shimmer,
            isOnPrimary && styles.shimmerOnPrimary,
            { width: shimmerWidth, transform: [{ translateX }] },
          ]}
        />
      ) : null}
    </View>
  );
}

export function SkeletonText({
  width = "80%",
  height = 14,
  borderRadius = theme.BORDER_RADIUS.xs,
  color,
  shimmer,
  style,
  testID,
  accessibilityLabel,
}: SkeletonProps) {
  return (
    <SkeletonBox
      width={width}
      height={height}
      borderRadius={borderRadius}
      color={color}
      shimmer={shimmer}
      style={style}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function SkeletonRoot({
  label,
  testID,
  style,
  children,
}: {
  label: string;
  testID?: string;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={style}
    >
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Feed post -> PostCard                                                      */
/* -------------------------------------------------------------------------- */

function PostActionSkeleton({
  iconSize,
  countWidth,
}: {
  iconSize: number;
  countWidth: number;
}) {
  return (
    <View style={styles.postActionBtn}>
      <SkeletonBox
        width={iconSize}
        height={iconSize}
        borderRadius={theme.BORDER_RADIUS.sm}
        shimmer={false}
      />
      <SkeletonBox width={countWidth} height={14} borderRadius={theme.BORDER_RADIUS.xs} />
    </View>
  );
}

export function FeedPostSkeleton({ testID }: { testID?: string }) {
  return (
    <SkeletonRoot label="Loading post" testID={testID} style={styles.postCard}>
      {/* Header */}
      <View style={styles.postHeader}>
        <View style={styles.postAvatarWrapper}>
          <SkeletonBox
            width={theme.SIZING.avatarLg}
            height={theme.SIZING.avatarLg}
            borderRadius={theme.SIZING.avatarLg / 2}
          />
          <View style={styles.postVerifiedBadge}>
            <SkeletonBox
              width={10}
              height={10}
              borderRadius={theme.BORDER_RADIUS.full}
              shimmer={false}
            />
          </View>
        </View>

        <View style={styles.postUserMeta}>
          <SkeletonText width={120} height={14} />
          <SkeletonText width={92} height={11} style={{ marginTop: theme.SPACING.xs }} />
        </View>

        <SkeletonBox
          width={20}
          height={20}
          borderRadius={theme.BORDER_RADIUS.full}
          shimmer={false}
        />
      </View>

      {/* Body */}
      <View style={styles.postBody}>
        <SkeletonText width="100%" height={14} />
        <SkeletonText width="92%" height={14} />
        <SkeletonText width="54%" height={14} />
        <View style={styles.postTags}>
          <SkeletonBox width={62} height={16} borderRadius={theme.BORDER_RADIUS.full} />
          <SkeletonBox width={48} height={16} borderRadius={theme.BORDER_RADIUS.full} />
        </View>
      </View>

      {/* Image */}
      <View style={styles.postImageWrapper}>
        <SkeletonBox width="100%" height={theme.SIZING.postImage} borderRadius={0} />
      </View>

      {/* Divider */}
      <View style={styles.postDivider} />

      {/* Actions */}
      <View style={styles.postActions}>
        <View style={styles.postActionsLeft}>
          <PostActionSkeleton iconSize={22} countWidth={26} />
          <PostActionSkeleton iconSize={20} countWidth={20} />
          <PostActionSkeleton iconSize={20} countWidth={20} />
        </View>
        <SkeletonBox
          width={20}
          height={20}
          borderRadius={theme.BORDER_RADIUS.xs}
          shimmer={false}
        />
      </View>
    </SkeletonRoot>
  );
}

/* -------------------------------------------------------------------------- */
/* Stories -> StoriesBar                                                      */
/* -------------------------------------------------------------------------- */

export function StorySkeleton({
  size = theme.SIZING.storyItem,
  variant = "unviewed",
  labelWidth = 56,
}: {
  size?: number;
  variant?: "unviewed" | "viewed" | "me";
  labelWidth?: number;
}) {
  const ringInset = variant === "me" ? theme.BORDER.width.sm * 2 : theme.BORDER.width.sm * 2 + 4;
  const ringColor =
    variant === "unviewed" ? theme.STORY.gradientStart : theme.COLORS.borderGray;

  return (
    <View style={styles.storyItem}>
      <View
        style={[
          styles.storyRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: ringColor,
            borderStyle: variant === "me" ? "dashed" : "solid",
          },
        ]}
      >
        <SkeletonBox
          width={size - ringInset}
          height={size - ringInset}
          borderRadius={(size - ringInset) / 2}
        />
        {variant === "me" ? (
          <View style={styles.storyPlusBadge}>
            <SkeletonBox
              width={10}
              height={10}
              borderRadius={theme.BORDER_RADIUS.full}
              color={SKELETON_ON_PRIMARY_HIGHLIGHT}
              shimmer={false}
            />
          </View>
        ) : null}
      </View>
      <SkeletonText
        width={labelWidth}
        height={12}
        style={{ marginTop: theme.SPACING.sm }}
      />
    </View>
  );
}

export function StoriesBarSkeleton({ count = 4 }: { count?: number }) {
  return (
    <SkeletonRoot
      label="Loading stories"
      style={styles.storiesBar}
    >
      {Array.from({ length: count }).map((_, index) => (
        <StorySkeleton
          key={index}
          variant={index === 0 ? "me" : "unviewed"}
          labelWidth={index === 0 ? 62 : 54}
        />
      ))}
    </SkeletonRoot>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile -> app/user/[username]                                             */
/* -------------------------------------------------------------------------- */

export function ProfileSkeleton() {
  return (
    <SkeletonRoot label="Loading profile" testID="profile-skeleton">
      {/* Cover */}
      <SkeletonBox width="100%" height={120} borderRadius={0} />

      {/* Avatar */}
      <View style={styles.profileAvatarContainer}>
        <View style={styles.profileAvatarWrapper}>
          <SkeletonBox
            width={theme.SIZING.avatarXl - 4}
            height={theme.SIZING.avatarXl - 4}
            borderRadius={theme.BORDER_RADIUS.full}
          />
        </View>
      </View>

      {/* Info */}
      <View style={styles.profileInfoSection}>
        <SkeletonText width={148} height={20} borderRadius={theme.BORDER_RADIUS.sm} />
        <SkeletonText
          width={92}
          height={12}
          style={{ marginTop: theme.SPACING.xs }}
        />
        <View style={styles.profileBio}>
          <SkeletonText width="78%" height={12} />
          <SkeletonText width="54%" height={12} style={{ marginTop: theme.SPACING.xs }} />
        </View>

        {/* Stats */}
        <View style={styles.profileStatsRow}>
          <View style={styles.profileStatItem}>
            <SkeletonText width={44} height={20} borderRadius={theme.BORDER_RADIUS.sm} />
            <SkeletonText width={46} height={11} style={{ marginTop: theme.SPACING.xs }} />
          </View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStatItem}>
            <SkeletonText width={54} height={20} borderRadius={theme.BORDER_RADIUS.sm} />
            <SkeletonText width={54} height={11} style={{ marginTop: theme.SPACING.xs }} />
          </View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStatItem}>
            <SkeletonText width={48} height={20} borderRadius={theme.BORDER_RADIUS.sm} />
            <SkeletonText width={56} height={11} style={{ marginTop: theme.SPACING.xs }} />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.profileButtonRow}>
          <SkeletonBox
            width="100%"
            height={theme.SIZING.buttonHeight}
            borderRadius={theme.BORDER_RADIUS.lg}
            style={styles.profileButton}
          />
          <SkeletonBox
            width="100%"
            height={theme.SIZING.buttonHeight}
            borderRadius={theme.BORDER_RADIUS.lg}
            style={styles.profileButton}
          />
        </View>

        {/* Tabs */}
        <View style={styles.profileTabBar}>
          <SkeletonBox
            width={22}
            height={22}
            borderRadius={theme.BORDER_RADIUS.sm}
            shimmer={false}
          />
        </View>
      </View>
    </SkeletonRoot>
  );
}

export function ProfileGridItemSkeleton() {
  return (
    <SkeletonBox
      width={GRID_ITEM_SIZE}
      height={GRID_ITEM_SIZE}
      borderRadius={theme.BORDER_RADIUS.sm}
    />
  );
}

export function ProfileGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <SkeletonRoot label="Loading posts" style={styles.profileGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <ProfileGridItemSkeleton key={index} />
      ))}
    </SkeletonRoot>
  );
}

/* -------------------------------------------------------------------------- */
/* Conversations -> PrivateMessageCard                                        */
/* -------------------------------------------------------------------------- */

export function ConversationRowSkeleton({ testID }: { testID?: string }) {
  return (
    <SkeletonRoot
      label="Loading conversation"
      testID={testID}
      style={styles.conversationRow}
    >
      <SkeletonBox
        width={theme.SIZING.avatarXl}
        height={theme.SIZING.avatarXl}
        borderRadius={theme.BORDER_RADIUS.xxxxxxxxxxl}
      />

      <View style={styles.conversationContent}>
        <View style={styles.conversationSenderRow}>
          <SkeletonText width={112} height={16} />
          <SkeletonText width={34} height={11} />
        </View>
        <SkeletonText width="70%" height={14} />
      </View>
    </SkeletonRoot>
  );
}

/* -------------------------------------------------------------------------- */
/* Chat -> MessageBubble                                                      */
/* -------------------------------------------------------------------------- */

export function ChatBubbleSkeleton({ isOwn = false }: { isOwn?: boolean }) {
  const lineColor = isOwn ? SKELETON_ON_PRIMARY : undefined;

  return (
    <View
      style={isOwn ? styles.chatWrapperSent : styles.chatWrapperReceived}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.chatBubble,
          { width: isOwn ? "44%" : "64%" },
          isOwn ? styles.chatBubbleSent : styles.chatBubbleReceived,
        ]}
      >
        <SkeletonText width="100%" height={15} color={lineColor} />
        <View style={styles.chatMetaRow}>
          <SkeletonText width={36} height={11} color={lineColor} />
          {isOwn ? (
            <SkeletonBox
              width={12}
              height={11}
              borderRadius={theme.BORDER_RADIUS.xs}
              color={lineColor}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Comments -> app/posts/[id]/comments (CommentItem)                          */
/* -------------------------------------------------------------------------- */

export function CommentsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <SkeletonRoot label="Loading comments" testID="comments-skeleton">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.commentRow}>
          <SkeletonBox width={32} height={32} borderRadius={16} />
          <View style={styles.commentContent}>
            <SkeletonText width={74} height={11} />
            <SkeletonText
              width="92%"
              height={13}
              style={{ marginTop: theme.SPACING.xs }}
            />
            <SkeletonText
              width={36}
              height={10}
              style={{ marginTop: theme.SPACING.xs }}
            />
          </View>
        </View>
      ))}
    </SkeletonRoot>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles — copied from the real components so geometry matches exactly        */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  base: {
    backgroundColor: SKELETON_BASE,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SKELETON_HIGHLIGHT,
    opacity: 0.65,
  },
  shimmerOnPrimary: {
    backgroundColor: SKELETON_ON_PRIMARY_HIGHLIGHT,
    opacity: 1,
  },

  /* PostCard */
  postCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.cardBorder,
    marginBottom: theme.SPACING.lg,
    overflow: "hidden",
    ...theme.SHADOWS.sm,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xl,
    paddingTop: theme.SPACING.xl,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.lg,
  },
  postAvatarWrapper: {
    position: "relative",
  },
  postVerifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.full,
    padding: 2,
  },
  postUserMeta: {
    flex: 1,
  },
  postBody: {
    paddingHorizontal: theme.SPACING.xl,
    paddingBottom: theme.SPACING.lg,
    gap: theme.SPACING.md,
  },
  postTags: {
    flexDirection: "row",
    gap: theme.SPACING.sm,
  },
  postImageWrapper: {
    marginHorizontal: theme.SPACING.xl,
    marginBottom: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.xxxl,
    overflow: "hidden",
  },
  postDivider: {
    height: theme.BORDER.width.xs,
    marginHorizontal: theme.SPACING.xl,
    backgroundColor: theme.COLORS.borderDivider,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.md,
  },
  postActionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
  },
  postActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xl,
  },

  /* StoriesBar */
  storiesBar: {
    flexDirection: "row",
    backgroundColor: theme.COLORS.bgWhite,
    paddingVertical: theme.SPACING.lg,
    paddingHorizontal: theme.SPACING.lg,
    marginBottom: theme.SPACING.sm,
  },
  storyItem: {
    alignItems: "center",
    width: theme.SIZING.storyItem + 20,
  },
  storyRing: {
    borderWidth: theme.BORDER.width.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgWhite,
  },
  storyPlusBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: theme.COLORS.primary,
    borderRadius: theme.BORDER_RADIUS.full,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  /* User profile header */
  profileAvatarContainer: {
    marginTop: -theme.SIZING.avatarXl / 2,
    alignSelf: "center",
  },
  profileAvatarWrapper: {
    width: theme.SIZING.avatarXl,
    height: theme.SIZING.avatarXl,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: 4,
    backgroundColor: theme.COLORS.bgWhite,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileInfoSection: {
    alignItems: "center",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.lg,
  },
  profileBio: {
    alignItems: "center",
    marginTop: theme.SPACING.sm,
  },
  profileStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.SPACING.lg,
    width: "100%",
  },
  profileStatItem: {
    flex: 1,
    alignItems: "center",
  },
  profileStatDivider: {
    width: theme.BORDER.width.xs,
    height: 32,
    backgroundColor: theme.COLORS.borderDivider,
    marginHorizontal: theme.SPACING.lg,
  },
  profileButtonRow: {
    flexDirection: "row",
    gap: theme.SPACING.md,
    width: "100%",
    marginTop: theme.SPACING.md,
  },
  profileButton: {
    flex: 1,
  },
  profileTabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.SPACING.md,
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },

  /* PrivateMessageCard */
  conversationRow: {
    flexDirection: "row",
    backgroundColor: theme.COLORS.white,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    height: theme.SIZING.privateMessageCard,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
  },
  conversationContent: {
    flex: 1,
    justifyContent: "center",
    marginLeft: 10,
  },
  conversationSenderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },

  /* MessageBubble */
  chatWrapperSent: {
    marginVertical: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
    alignItems: "flex-end",
  },
  chatWrapperReceived: {
    marginVertical: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
    alignItems: "flex-start",
  },
  chatBubble: {
    maxWidth: "78%",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xl,
  },
  chatBubbleSent: {
    backgroundColor: theme.COLORS.primary,
    borderBottomRightRadius: theme.SPACING.xs,
    ...theme.SHADOWS.primary,
  },
  chatBubbleReceived: {
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomLeftRadius: theme.SPACING.xs,
    ...theme.SHADOWS.sm,
  },
  chatMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: theme.SPACING.xs,
    gap: theme.SPACING.xs,
  },

  /* CommentItem */
  commentRow: {
    flexDirection: "row",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    alignItems: "flex-start",
  },
  commentContent: {
    flex: 1,
    marginLeft: theme.SPACING.sm,
  },
});
