import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
  type LayoutChangeEvent,
  type DimensionValue,
  type ViewStyle,
} from "react-native";
import theme from "@/constants/theme";

const SKELETON_BASE = theme.COLORS.bgInput;
const SKELETON_HIGHLIGHT = theme.COLORS.bgWhite;
const SKELETON_ON_PRIMARY = "rgba(255,255,255,0.32)";
const SKELETON_ON_PRIMARY_HIGHLIGHT = "rgba(255,255,255,0.5)";
const SHIMMER_DURATION = 1300;
const SHIMMER_MIN_WIDTH = 24;
const SHIMMER_MAX_WIDTH = 110;

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
    <SkeletonRoot label="Loading stories" style={styles.storiesBar}>
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

export function ProfileSkeleton() {
  return (
    <View style={styles.profileContainer}>
      <View style={styles.profileHeader}>
        <SkeletonBox width={theme.SIZING.avatarXl} height={theme.SIZING.avatarXl} borderRadius={theme.BORDER_RADIUS.full} />
        <View style={styles.profileStats}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ alignItems: "center", marginHorizontal: theme.SPACING.md }}>
              <SkeletonText width={40} height={20} />
              <SkeletonText width={30} height={12} borderRadius={theme.BORDER_RADIUS.xs} />
            </View>
          ))}
        </View>
      </View>
      <SkeletonText width="60%" height={18} style={{ marginTop: theme.SPACING.md }} />
      <SkeletonText width="40%" height={14} borderRadius={theme.BORDER_RADIUS.xs} />
      <View style={{ flexDirection: "row", marginTop: theme.SPACING.lg, gap: theme.SPACING.md }}>
        <SkeletonBox width={120} height={44} borderRadius={theme.BORDER_RADIUS.xl} />
        <SkeletonBox width={120} height={44} borderRadius={theme.BORDER_RADIUS.xl} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: theme.SPACING.xl, gap: theme.SPACING.sm }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBox key={i} width="30%" height={120} borderRadius={theme.BORDER_RADIUS.lg} />
        ))}
      </View>
    </View>
  );
}

export function ConversationRowSkeleton({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={styles.conversationRow}>
      <SkeletonBox width={theme.SIZING.avatarXl} height={theme.SIZING.avatarXl} borderRadius={theme.BORDER_RADIUS.full} />
      <View style={{ flex: 1, marginLeft: theme.SPACING.md }}>
        <SkeletonText width="50%" height={16} />
        <SkeletonText width="70%" height={14} borderRadius={theme.BORDER_RADIUS.xs} style={{ marginTop: 6 }} />
      </View>
      <SkeletonText width={50} height={12} borderRadius={theme.BORDER_RADIUS.xs} />
    </View>
  );
}

export function ChatBubbleSkeleton({ isOwn = false }: { isOwn?: boolean }) {
  return (
    <View
      style={[
        styles.chatBubble,
        isOwn ? styles.chatBubbleOwn : styles.chatBubbleOther,
      ]}
    >
      <SkeletonText width={isOwn ? "70%" : "85%"} height={14} />
      <SkeletonText width={isOwn ? "30%" : "40%"} height={10} borderRadius={theme.BORDER_RADIUS.xs} style={{ marginTop: 6 }} />
    </View>
  );
}

export function CommentsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.commentsContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.commentRow}>
          <SkeletonBox width={32} height={32} borderRadius={theme.BORDER_RADIUS.full} />
          <View style={{ flex: 1, marginLeft: theme.SPACING.md }}>
            <SkeletonText width="35%" height={13} />
            <SkeletonText width="90%" height={13} borderRadius={theme.BORDER_RADIUS.xs} style={{ marginTop: 4 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

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
  profileContainer: {
    flex: 1,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.lg,
  },
  profileStats: {
    flexDirection: "row",
    flex: 1,
    justifyContent: "space-around",
  },
  conversationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
    marginBottom: theme.SPACING.sm,
  },
  chatBubble: {
    maxWidth: "75%",
    padding: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    marginBottom: theme.SPACING.md,
  },
  chatBubbleOwn: {
    alignSelf: "flex-end",
    backgroundColor: theme.COLORS.primary,
    borderBottomRightRadius: theme.BORDER_RADIUS.sm,
  },
  chatBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomLeftRadius: theme.BORDER_RADIUS.sm,
  },
  commentsContainer: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    gap: theme.SPACING.md,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
});
