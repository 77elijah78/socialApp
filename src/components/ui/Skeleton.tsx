import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
} from "react-native";
import theme from "@/constants/theme";

const SKELETON_BASE = theme.COLORS.borderDivider;
const SKELETON_HIGHLIGHT = theme.COLORS.bgWhite;

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
  testID?: string;
  accessibilityLabel?: string;
};

export function SkeletonBox({
  width = "100%",
  height = 16,
  borderRadius = theme.BORDER_RADIUS.md,
  style,
  testID,
  accessibilityLabel = "Loading content",
}: SkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  const startAnimation = useCallback(async () => {
    const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
    if (reduceMotion) return;
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ).start();
  }, [shimmerAnim]);

  useEffect(() => {
    startAnimation();
    return () => {
      shimmerAnim.stopAnimation();
      shimmerAnim.setValue(-1);
    };
  }, [shimmerAnim, startAnimation]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-200, 400],
  });

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[
        styles.base,
        { width, height, borderRadius },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX: shimmerTranslate }] },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

export function SkeletonText({
  width = "80%",
  height = 14,
  borderRadius = theme.BORDER_RADIUS.sm,
  style,
  testID,
}: Omit<SkeletonProps, "accessibilityLabel"> & { testID?: string }) {
  return (
    <SkeletonBox
      width={width}
      height={height}
      borderRadius={borderRadius}
      style={style}
      testID={testID}
      accessibilityLabel="Loading text"
    />
  );
}

export function FeedPostSkeleton({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={styles.postCard}>
      <View style={styles.postHeader}>
        <SkeletonBox width={theme.SIZING.avatarLg} height={theme.SIZING.avatarLg} borderRadius={theme.BORDER_RADIUS.full} />
        <View style={styles.postHeaderText}>
          <SkeletonText width="40%" height={14} />
          <SkeletonText width="25%" height={12} borderRadius={theme.BORDER_RADIUS.xs} />
        </View>
      </View>
      <View style={styles.postBody}>
        <SkeletonText width="100%" height={14} />
        <SkeletonText width="90%" height={14} />
        <SkeletonText width="60%" height={14} />
      </View>
      <SkeletonBox width="100%" height={theme.SIZING.postImage} borderRadius={theme.BORDER_RADIUS.xxxl} />
      <View style={styles.postActions}>
        <SkeletonBox width={60} height={20} borderRadius={theme.BORDER_RADIUS.full} />
        <SkeletonBox width={60} height={20} borderRadius={theme.BORDER_RADIUS.full} />
        <SkeletonBox width={60} height={20} borderRadius={theme.BORDER_RADIUS.full} />
      </View>
    </View>
  );
}

export function StorySkeleton({ size = 64 }: { size?: number }) {
  return (
    <View style={{ alignItems: "center", marginRight: theme.SPACING.md }}>
      <View
        style={[
          styles.storyRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            padding: 3,
          },
        ]}
      >
        <SkeletonBox width={size - 6} height={size - 6} borderRadius={(size - 6) / 2} />
      </View>
      <SkeletonText width={size} height={12} borderRadius={theme.BORDER_RADIUS.xs} style={{ marginTop: 6 }} />
    </View>
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
    right: 0,
    backgroundColor: SKELETON_HIGHLIGHT,
    opacity: 0.5,
  },
  postCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    padding: theme.SPACING.xl,
    marginBottom: theme.SPACING.lg,
    ...theme.SHADOWS.sm,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.md,
  },
  postHeaderText: {
    marginLeft: theme.SPACING.md,
    flex: 1,
    gap: theme.SPACING.xs,
  },
  postBody: {
    gap: theme.SPACING.sm,
    marginBottom: theme.SPACING.lg,
  },
  postActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.lg,
  },
  storyRing: {
    borderWidth: 2,
    borderColor: theme.COLORS.primary,
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
