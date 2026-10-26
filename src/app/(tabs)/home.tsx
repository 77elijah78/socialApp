import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import PostCard from "@/components/feed/PostCard";
import StoriesBar from "@/components/feed/StoriesBar";
import { FeedPostSkeleton, OfflineBanner } from "@/components/ui";
import theme from "@/constants/theme";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { usePosts } from "@/hooks/usePosts";
import { useOverlay, type ActionMenuItem } from "@/providers/OverlayProvider";
import { useAppSelector } from "@/store/hooks";
import { SocialPost } from "@/types";

type SkeletonFeedItem = { id: string; isSkeleton: true };
type FeedListItem = SocialPost | SkeletonFeedItem;

function CreatePostEntry() {
  const user = useAppSelector((state) => state.auth.user);
  const displayName = user?.displayName || user?.username || "there";
  const firstName = displayName.split(" ")[0];
  const initial = displayName.charAt(0).toUpperCase() || "Y";
  const goToCreatePost = () => router.push("/posts/create");

  return (
    <View style={styles.createEntryCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a post"
        onPress={goToCreatePost}
        style={({ pressed }) => [styles.createEntryTop, pressed && styles.pressed]}
      >
        <View style={styles.createAvatarRing}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.createAvatar} />
          ) : (
            <View style={[styles.createAvatar, styles.createAvatarFallback]}>
              <Text style={styles.createAvatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={styles.createEntryCopy}>
          <Text style={styles.createEntryEyebrow}>YOUR SPACE</Text>
          <Text style={styles.createEntryPrompt} numberOfLines={1}>
            Share a moment, {firstName}
          </Text>
        </View>
        <View style={styles.createEntryArrow}>
          <Ionicons name="arrow-forward" size={18} color={theme.COLORS.primary} />
        </View>
      </Pressable>

      <View style={styles.createEntryDivider} />

      <View style={styles.createEntryActions}>
        <Pressable
          accessibilityRole="button"
          onPress={goToCreatePost}
          style={({ pressed }) => [styles.createAction, pressed && styles.pressed]}
        >
          <View style={[styles.createActionIcon, styles.photoActionIcon]}>
            <Ionicons name="image-outline" size={17} color={theme.COLORS.primary} />
          </View>
          <Text style={styles.createActionLabel}>Photo</Text>
        </Pressable>
        <View style={styles.createActionDivider} />
        <Pressable
          accessibilityRole="button"
          onPress={goToCreatePost}
          style={({ pressed }) => [styles.createAction, pressed && styles.pressed]}
        >
          <View style={[styles.createActionIcon, styles.textActionIcon]}>
            <Ionicons name="create-outline" size={17} color={theme.COLORS.accentBlue} />
          </View>
          <Text style={styles.createActionLabel}>Write</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
  } = usePosts({ limit: 20 });

  const { isOffline } = useNetworkStatus();
  const { openActionMenu, openComments, openShare } = useOverlay();

  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleShare = useCallback(
    (postId: string) => openShare({ postId }),
    [openShare],
  );

  const renderItem = useCallback(
    ({ item }: { item: SocialPost }) => (
      <View style={styles.feedItem}>
        <PostCard
          post={item}
          onLike={(postId, liked) => {
            if (liked) like(postId);
            else unlike(postId);
          }}
          onComment={openComments}
          onShare={handleShare}
          onUserPress={(username) => router.push(`/user/${username}`)}
          onBookmark={(postId, bookmarked) => {
            if (bookmarked) save(postId);
            else unsave(postId);
          }}
          onMenuPress={(postId, anchor) => {
            const actions: ActionMenuItem[] = [
              {
                key: "save",
                icon: "bookmark-outline",
                label: "Save post",
                onPress: () => save(postId),
              },
              {
                key: "share",
                icon: "share-outline",
                label: "Share",
                onPress: () => handleShare(postId),
              },
              {
                key: "report",
                icon: "flag-outline",
                label: "Report",
                onPress: () => {
                  // TODO: implement report.
                },
              },
              {
                key: "hide",
                icon: "eye-off-outline",
                label: "Hide post",
                onPress: () => {
                  // TODO: implement hide.
                },
              },
              {
                key: "unfollow",
                icon: "person-remove-outline",
                label: "Unfollow",
                onPress: () => {
                  // TODO: implement unfollow.
                },
              },
              {
                key: "delete",
                icon: "trash-outline",
                label: "Delete",
                destructive: true,
                onPress: () => {
                  // TODO: implement delete.
                },
              },
            ];
            openActionMenu(actions, anchor);
          }}
        />
      </View>
    ),
    [
      like,
      unlike,
      save,
      unsave,
      openActionMenu,
      openComments,
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
            <Ionicons name="cloud-offline-outline" size={24} color={theme.COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your feed couldn’t load</Text>
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity onPress={refresh} style={styles.retryButton} activeOpacity={0.8}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="sparkles-outline" size={24} color={theme.COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>Your feed is just getting started</Text>
        <Text style={styles.emptyText}>Follow people you love to see their moments here.</Text>
      </View>
    );
  }, [loading, error, posts.length, refresh]);

  const showSkeletons = loading && posts.length === 0;
  const listData: FeedListItem[] = showSkeletons ? skeletonData : posts;

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner isOffline={isOffline} onRetry={refresh} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>YOUR COMMUNITY</Text>
          <Text style={styles.headerTitle}>Feed</Text>
        </View>
        <View style={styles.headerMark}>
          <Ionicons name="sparkles" size={17} color={theme.COLORS.primary} />
        </View>
      </View>

      <FlatList<FeedListItem>
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={listData}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <CreatePostEntry />
            <StoriesBar />
          </View>
        }
        ListEmptyComponent={showSkeletons ? null : renderEmpty}
        ListFooterComponent={
          paginating ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={theme.COLORS.primary} />
            </View>
          ) : paginationError ? (
            <View style={styles.paginationError}>
              <Text style={styles.paginationErrorText}>{paginationError.message}</Text>
              <TouchableOpacity onPress={loadMore} style={styles.paginationRetryButton}>
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
            tintColor={theme.COLORS.primary}
            colors={[theme.COLORS.primary]}
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
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgLight,
  },
  headerEyebrow: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    letterSpacing: 1.1,
  },
  headerTitle: {
    marginTop: 2,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -0.3,
  },
  headerMark: {
    width: 38,
    height: 38,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  list: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  listContent: {
    paddingBottom: 92,
  },
  createEntryCard: {
    marginHorizontal: theme.LAYOUT.contentPadding,
    marginTop: theme.SPACING.sm,
    marginBottom: theme.SPACING.lg,
    paddingHorizontal: theme.SPACING.lg,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.md,
    borderRadius: 22,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
    ...theme.SHADOWS.sm,
  },
  createEntryTop: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
  },
  createAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  createAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgInput,
  },
  createAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  createAvatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  createEntryCopy: {
    flex: 1,
    minWidth: 0,
  },
  createEntryEyebrow: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 0.9,
  },
  createEntryPrompt: {
    marginTop: 3,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  createEntryArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  createEntryDivider: {
    height: 1,
    marginTop: theme.SPACING.md,
    marginBottom: theme.SPACING.sm,
    backgroundColor: theme.COLORS.borderDivider,
  },
  createEntryActions: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
  },
  createAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingVertical: theme.SPACING.xs,
    paddingRight: theme.SPACING.xl,
  },
  createActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  photoActionIcon: {
    backgroundColor: theme.COLORS.primaryGhost,
  },
  textActionIcon: {
    backgroundColor: "rgba(59, 130, 246, 0.10)",
  },
  createActionLabel: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  createActionDivider: {
    width: 1,
    height: 18,
    marginRight: theme.SPACING.xl,
    backgroundColor: theme.COLORS.borderDivider,
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
  feedItem: {
    width: "100%",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.sm,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: theme.SPACING.xxxxxl,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.md,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  emptyTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    textAlign: "center",
  },
  emptyText: {
    marginTop: theme.SPACING.xs,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    textAlign: "center",
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
  errorText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: theme.SPACING.xs,
    textAlign: "center",
  },
  retryButton: {
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
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
    color: theme.COLORS.textMuted,
    marginBottom: theme.SPACING.sm,
    textAlign: "center",
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
    height: 24,
  },
});
