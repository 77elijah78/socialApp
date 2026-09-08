import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import PostCard from "@/components/feed/PostCard";
import StoriesBar from "@/components/feed/StoriesBar";

import { SocialPost } from "@/types";
import theme from "@/constants/theme";

import { usePosts } from "@/hooks/usePosts";
import { useOverlay, type ActionMenuItem } from "@/providers/OverlayProvider";
import { FeedPostSkeleton, OfflineBanner } from "@/components/ui";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

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
    loadMore,
    hasMore,
    error,
    paginating,
    paginationError,
  } = usePosts({
    limit: 20,
  });

  const { isOffline } = useNetworkStatus();
  const { openActionMenu, openComments } = useOverlay();

  /*
   * Pull to refresh
   */
  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  /*
   * Handle sharing a post.
   */
  const handleShare = useCallback(
    (postId: string) => {
      router.push({
        pathname: "/share",
        params: {
          postId,
          title: "Share post",
          message: "Check out this post",
          url: `https://yourapp.com/post/${postId}`,
        },
      });
    },
    [],
  );

  /*
   * Render normal feed post
   */
  const renderItem = useCallback(
    ({ item }: { item: SocialPost }) => {
      return (
        <View style={styles.feedItem}>
          <PostCard
            post={item}
            /*
             * LIKE
             */
            onLike={(postId, liked) => {
              if (liked) {
                like(postId);
              } else {
                unlike(postId);
              }
            }}
            /*
             * COMMENTS
             */
            onComment={(postId) => {
              openComments(postId);
            }}
            /*
             * SHARE
             */
            onShare={(postId) => {
              handleShare(postId);
            }}
            /*
             * USER PROFILE
             */
            onUserPress={(username) => {
              router.push(`/user/${username}`);
            }}
            /*
             * BOOKMARK
             */
            onBookmark={(postId, bookmarked) => {
              if (bookmarked) {
                save(postId);
              } else {
                unsave(postId);
              }
            }}
            /*
             * POST MENU
             */
            onMenuPress={(postId, anchor) => {
              const post = posts.find((item) => item.id === postId);

              const actions: ActionMenuItem[] = [
                {
                  key: "save",
                  icon: "bookmark-outline",
                  label: "Save post",
                  onPress: () => {
                    save(postId);
                  },
                },

                {
                  key: "share",
                  icon: "share-outline",
                  label: "Share",
                  onPress: () => {
                    handleShare(postId);
                  },
                },

                {
                  key: "report",
                  icon: "flag-outline",
                  label: "Report",
                  onPress: () => {
                    // TODO:
                    // implement report
                  },
                },

                {
                  key: "hide",
                  icon: "eye-off-outline",
                  label: "Hide post",
                  onPress: () => {
                    // TODO:
                    // implement hide
                  },
                },

                {
                  key: "unfollow",
                  icon: "person-remove-outline",
                  label: "Unfollow",
                  onPress: () => {
                    // TODO:
                    // implement unfollow
                  },
                },

                {
                  key: "delete",
                  icon: "trash-outline",
                  label: "Delete",
                  destructive: true,
                  onPress: () => {
                    // TODO:
                    // implement delete
                  },
                },
              ];

               openActionMenu(actions, anchor);
            }}
          />
        </View>
      );
    },
    [posts, like, unlike, save, unsave, openActionMenu, openComments, handleShare],
  );

  /*
   * Loading skeletons
   */
  const skeletonData = useMemo(() => Array.from({ length: 3 }), []);

  const renderSkeleton = useCallback(
    ({ index }: { item: any; index: number }) => {
      return (
        <View style={styles.feedItem}>
          <FeedPostSkeleton key={`skeleton-${index}`} testID="feed-skeleton" />
        </View>
      );
    },
    [],
  );

  /*
   * Empty/error state
   */
  const renderEmpty = useCallback(() => {
    if (loading) {
      return null;
    }

    if (error && posts.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.errorText}>{error.message}</Text>

          <TouchableOpacity
            onPress={refresh}
            style={styles.retryButton}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No posts yet</Text>
      </View>
    );
  }, [loading, error, posts.length, refresh]);

  const showSkeletons = loading && posts.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Offline banner */}
      <OfflineBanner isOffline={isOffline} onRetry={refresh} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>

        <View style={styles.headerActions}>
          {/* Search */}
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => {
              // TODO:
              // router.push("/search");
            }}
          >
            <Ionicons
              name="search"
              size={22}
              color={theme.COLORS.textPrimary}
            />
          </Pressable>

          {/* Notifications */}
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => {
              // TODO:
              // router.push("/notifications");
            }}
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={theme.COLORS.textPrimary}
            />
          </Pressable>

          {/* Create post */}
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/posts/create")}
          >
            <Ionicons
              name="add-circle-outline"
              size={24}
              color={theme.COLORS.primary}
            />
          </Pressable>
        </View>
      </View>

      {/* Feed */}
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={showSkeletons ? (skeletonData as any) : posts}
        showsVerticalScrollIndicator={false}
        numColumns={1}
        keyExtractor={(item, index) => {
          if (showSkeletons) {
            return `skeleton-${index}`;
          }

          return String(item.id);
        }}
        /*
         * Stories appear above feed posts
         */
        ListHeaderComponent={showSkeletons ? null : <StoriesBar />}
        /*
         * Empty feed
         */
        ListEmptyComponent={showSkeletons ? null : renderEmpty}
        /*
         * Pagination
         */
        ListFooterComponent={
          paginating ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={theme.COLORS.primary} />
            </View>
          ) : paginationError ? (
            <View style={styles.paginationError}>
              <Text style={styles.paginationErrorText}>
                {paginationError.message}
              </Text>

              <TouchableOpacity
                onPress={loadMore}
                style={styles.paginationRetryButton}
                activeOpacity={0.8}
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
        /*
         * Pull to refresh
         */
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.COLORS.primary}
            colors={[theme.COLORS.primary]}
          />
        }
        /*
         * Render posts
         */
        renderItem={showSkeletons ? renderSkeleton : renderItem}
      />
    </SafeAreaView>
  );
}

const styles = {
  safeArea: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },

  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,

    paddingHorizontal: theme.LAYOUT.contentPadding,

    paddingTop: theme.SPACING.md,

    paddingBottom: theme.SPACING.sm,

    backgroundColor: theme.COLORS.bgLight,

    ...theme.SHADOWS.xl,

    zIndex: 10,
  },

  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,

    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,

    color: theme.COLORS.textPrimary,

    letterSpacing: theme.TYPOGRAPHY.letterSpacing.xs,
  } as const,

  headerActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.SPACING.sm,
  } as const,

  headerIconBtn: {
    width: 36,
    height: 36,

    borderRadius: theme.BORDER_RADIUS.full,

    alignItems: "center" as const,
    justifyContent: "center" as const,

    backgroundColor: theme.COLORS.bgWhite,

    borderWidth: theme.BORDER.width.xs,

    borderColor: theme.COLORS.borderDivider,
  } as const,

  list: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },

  listContent: {
    paddingBottom: theme.SPACING.xxxxl,
  },

  feedItem: {
    width: "100%" as const,

    paddingHorizontal: theme.LAYOUT.contentPadding,

    paddingTop: theme.SPACING.sm,
  },

  emptyContainer: {
    alignItems: "center" as const,

    marginTop: theme.SPACING.xxxxxl,

    paddingHorizontal: theme.LAYOUT.contentPadding,
  },

  emptyText: {
    color: theme.COLORS.textMuted,
  },

  errorText: {
    color: theme.COLORS.textMuted,

    marginBottom: theme.SPACING.md,

    textAlign: "center" as const,
  },

  retryButton: {
    padding: theme.SPACING.md,

    backgroundColor: theme.COLORS.primaryGhost,

    borderRadius: theme.BORDER_RADIUS.full,
  },

  retryText: {
    color: theme.COLORS.primary,

    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },

  footerLoader: {
    paddingVertical: theme.SPACING.xxxxl,

    alignItems: "center" as const,
  },

  paginationError: {
    paddingVertical: theme.SPACING.xxxxl,

    alignItems: "center" as const,

    paddingHorizontal: theme.LAYOUT.contentPadding,
  },

  paginationErrorText: {
    color: theme.COLORS.textMuted,

    marginBottom: theme.SPACING.sm,

    textAlign: "center" as const,
  },

  paginationRetryButton: {
    padding: theme.SPACING.sm,

    backgroundColor: theme.COLORS.primaryGhost,

    borderRadius: theme.BORDER_RADIUS.full,
  },

  paginationRetryText: {
    color: theme.COLORS.primary,

    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },

  footerSpace: {
    height: theme.SPACING.xxxxl,
  },
};
