import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import PostCard from "@/components/feed/PostCard";
import StoriesBar from "@/components/feed/StoriesBar";
import { FeedPostSkeleton, OfflineBanner } from "@/components/ui";
import { FEED } from "@/constants/feedTheme";
import * as theme from "@/constants/theme";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { usePosts } from "@/hooks/usePosts";
import { useOverlay } from "@/providers/OverlayProvider";
import { buildPostMenu } from "@/utils/postMenu";
import { shareService } from "@/services/ShareService";
import { useAppSelector } from "@/store/hooks";
import { SocialPost } from "@/types";

type SkeletonFeedItem = { id: string; isSkeleton: true };
type FeedListItem = SocialPost | SkeletonFeedItem;
type FeedMode = "recent" | "following" | "trending";

const HOME_GUTTER = theme.LAYOUT.contentPadding + 6;

const TABS: { key: FeedMode; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "following", label: "Following" },
  { key: "trending", label: "Trending" },
];

export default function FeedScreen() {
  const {
    posts,
    loading,
    refreshing,
    refresh,
    like,
    unlike,
    save,
    unsave,
    deletePost,
    loadMore,
    hasMore,
    error,
    paginating,
    paginationError,
  } = usePosts({ limit: 20 });

  const { isOffline } = useNetworkStatus();
  const { openActionMenu, openComments, openShare } = useOverlay();
  const currentUserId = useAppSelector((state) => state.auth.user?.id);
  const token = useAppSelector((state) => state.auth.token);
  const unread = useAppSelector((state) =>
    state.notifications.accountId === state.auth.user?.id
      ? state.notifications.unreadCount
      : 0,
  );
  const [mode, setMode] = useState<FeedMode>("following");
  const [followingIds, setFollowingIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    shareService
      .getMyFollowing(token)
      .then(({ users, total }) => {
        // The endpoint caps this response. An incomplete roster must not hide
        // posts from followings beyond the cap.
        if (!cancelled) {
          setFollowingIds(
            total > users.length
              ? null
              : new Set(users.map((user) => user.id)),
          );
        }
      })
      .catch(() => {
        // The feed endpoint still works when the follow-list endpoint is not
        // deployed; don't turn that capability gap into an empty Following tab.
        if (!cancelled) setFollowingIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openMenu = useCallback(() => {
    openActionMenu([
      {
        key: "create-post",
        icon: "create-outline",
        label: "Create a post",
        onPress: () => router.push("/posts/create"),
      },
      {
        key: "create-story",
        icon: "camera-outline",
        label: "Add to your story",
        onPress: () => router.push("/stories/create"),
      },
      {
        key: "bookmarks",
        icon: "bookmark-outline",
        label: "Saved posts",
        onPress: () => router.push("/bookmarks"),
      },
      {
        key: "settings",
        icon: "settings-outline",
        label: "Settings",
        onPress: () => router.push("/settings"),
      },
    ]);
  }, [openActionMenu]);

  const visiblePosts = useMemo(() => {
    if (mode === "trending") {
      return [...posts].sort(
        (a, b) =>
          b.likeCount +
          b.commentCount * 2 +
          (b.shareCount ?? 0) -
          (a.likeCount + a.commentCount * 2 + (a.shareCount ?? 0)),
      );
    }
    if (mode === "following" && followingIds) {
      return posts.filter(
        (post) =>
          post.author.id === currentUserId || followingIds.has(post.author.id),
      );
    }
    return [...posts].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
  }, [posts, mode, followingIds, currentUserId]);

  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleShare = useCallback(
    (postId: string) => openShare({ postId }),
    [openShare],
  );
  const openPost = useCallback((postId: string) => {
    router.push({ pathname: "/posts/[id]", params: { id: postId } });
  }, []);
  const hasFocusedFeedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (hasFocusedFeedRef.current) void refresh();
      hasFocusedFeedRef.current = true;
    }, [refresh]),
  );

  const renderItem = useCallback(
    ({ item }: { item: SocialPost }) => (
      <View style={styles.feedItem}>
        <PostCard
          post={item}
          onLike={(postId, liked) => (liked ? like(postId) : unlike(postId))}
          onComment={openComments}
          onShare={handleShare}
          onUserPress={(username) => router.push(`/user/${username}`)}
          onBookmark={(postId, bookmarked) =>
            bookmarked ? save(postId) : unsave(postId)
          }
          onOpen={openPost}
          onMenuPress={(postId, anchor) => {
            openActionMenu(
              buildPostMenu({
                post: item,
                currentUserId,
                onSave: () => save(postId),
                onUnsave: () => unsave(postId),
                onShare: () => handleShare(postId),
                onEdit: () =>
                  router.push({
                    pathname: "/posts/create",
                    params: { postId },
                  }),
                onDelete: () => deletePost(postId),
              }),
              anchor,
            );
          }}
        />
      </View>
    ),
    [
      like,
      unlike,
      save,
      unsave,
      deletePost,
      currentUserId,
      openActionMenu,
      openComments,
      openPost,
      handleShare,
    ],
  );

  const skeletonData = useMemo<SkeletonFeedItem[]>(
    () =>
      Array.from({ length: 3 }, (_, index) => ({
        id: `skeleton-${index}`,
        isSkeleton: true as const,
      })),
    [],
  );

  const renderFeedItem = useCallback(
    ({ item }: { item: FeedListItem }) => {
      if ("isSkeleton" in item) {
        return (
          <View style={styles.feedItem}>
            <FeedPostSkeleton testID={`feed-skeleton-${item.id}`} />
          </View>
        );
      }
      return renderItem({ item });
    },
    [renderItem],
  );

  const renderEmpty = useCallback(() => {
    if (loading) return null;

    if (error && posts.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="cloud-offline-outline"
              size={24}
              color={FEED.accent}
            />
          </View>
          <Text style={styles.emptyTitle}>Your feed couldn’t load</Text>
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity
            onPress={refresh}
            style={styles.retryButton}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (mode === "following" && posts.length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={24} color={FEED.accent} />
          </View>
          <Text style={styles.emptyTitle}>No posts from people you follow</Text>
          <Text style={styles.emptyText}>
            Find new people to follow and their moments will appear here.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/explore")}
            style={styles.retryButton}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Explore people</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="sparkles-outline" size={24} color={FEED.accent} />
        </View>
        <Text style={styles.emptyTitle}>Your feed is just getting started</Text>
        <Text style={styles.emptyText}>
          Follow people you love to see their moments here.
        </Text>
      </View>
    );
  }, [loading, error, posts.length, refresh, mode]);

  const showSkeletons = loading && posts.length === 0;
  const listData: FeedListItem[] = showSkeletons ? skeletonData : visiblePosts;

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner isOffline={isOffline} onRetry={refresh} />

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={openMenu}
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="menu-outline" size={21} color={FEED.text} />
        </Pressable>

        <Text style={styles.brand}>Circle</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            unread > 0 ? `Activity, ${unread} unread` : "Activity"
          }
          onPress={() => router.push("/notifications")}
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="notifications-outline" size={21} color={FEED.text} />
          {unread > 0 ? <View style={styles.notificationDot} /> : null}
        </Pressable>
      </View>

      <FlatList<FeedListItem>
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={listData}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <StoriesBar />
            <View style={styles.feedTabs}>
              {TABS.map((tab) => {
                const active = tab.key === mode;
                return (
                  <Pressable
                    key={tab.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setMode(tab.key)}
                    style={[
                      styles.feedTab,
                      active && styles.feedTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.feedTabText,
                        active && styles.feedTabTextActive,
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={showSkeletons ? null : renderEmpty}
        ListFooterComponent={
          paginating ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={FEED.accent} />
            </View>
          ) : paginationError ? (
            <View style={styles.paginationError}>
              <Text style={styles.paginationErrorText}>
                {paginationError.message}
              </Text>
              <TouchableOpacity
                onPress={loadMore}
                style={styles.paginationRetryButton}
              >
                <Text style={styles.paginationRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.footerSpace} />
          )
        }
        onEndReached={hasMore && !showSkeletons ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={FEED.accent}
            colors={[FEED.accent]}
          />
        }
        renderItem={renderFeedItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FEED.background,
  },
  topBar: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: HOME_GUTTER,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.md,
  },
  brand: {
    color: FEED.text,
    fontSize: 24,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -0.6,
  },
  circleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FEED.surface,
    borderWidth: 1,
    borderColor: FEED.border,
  },
  notificationDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.COLORS.secondary,
    borderWidth: 1.5,
    borderColor: FEED.surface,
  },
  list: {
    flex: 1,
    backgroundColor: FEED.background,
  },
  listContent: {
    paddingTop: theme.SPACING.xs,
    paddingBottom: 104,
  },
  feedTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.lg,
    paddingHorizontal: HOME_GUTTER,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.lg,
  },
  feedTab: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xl,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  feedTabActive: {
    backgroundColor: FEED.accent,
  },
  feedTabText: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  feedTabTextActive: {
    color: theme.COLORS.white,
  },
  feedItem: {
    width: "100%",
    paddingHorizontal: HOME_GUTTER,
    paddingTop: theme.SPACING.xl,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: theme.SPACING.xxxxxl,
    paddingHorizontal: HOME_GUTTER,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.md,
    backgroundColor: FEED.accentSoft,
  },
  emptyTitle: {
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    textAlign: "center",
  },
  emptyText: {
    marginTop: theme.SPACING.xs,
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    textAlign: "center",
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
  errorText: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: theme.SPACING.xs,
    textAlign: "center",
  },
  retryButton: {
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: FEED.accent,
  },
  retryText: {
    color: theme.COLORS.white,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  footerLoader: {
    paddingVertical: theme.SPACING.xxxxl,
    alignItems: "center",
  },
  paginationError: {
    paddingVertical: theme.SPACING.xxxxl,
    alignItems: "center",
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  paginationErrorText: {
    color: FEED.muted,
    marginBottom: theme.SPACING.sm,
    textAlign: "center",
  },
  paginationRetryButton: {
    padding: theme.SPACING.sm,
    backgroundColor: FEED.accentSoft,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  paginationRetryText: {
    color: FEED.accent,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  footerSpace: {
    height: 24,
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
});
