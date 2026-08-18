import React, { useCallback, useMemo, useRef } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import PostCard from "@/components/feed/PostCard";
import StoriesBar from '@/components/feed/StoriesBar';
import { CommentBottomSheet } from '@/components/posts/CommentBottomSheet';
import type { CommentBottomSheetRef } from '@/components/posts/CommentBottomSheet';
import { SocialPost } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import { usePosts } from '@/hooks/usePosts';
import { presentActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { FeedPostSkeleton, OfflineBanner } from "@/components/ui";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export default function FeedScreen() {
  const { posts, loading, refreshing, refresh, like, unlike, save, unsave, loadMore, hasMore, error } = usePosts({ limit: 20 });
  const { isOffline } = useNetworkStatus();
  const commentSheetRef = useRef<CommentBottomSheetRef>(null);

  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const renderItem = useCallback(({ item }: { item: SocialPost }) => {
    return (
      <PostCard
        post={item}
        onLike={(postId, liked) => {
          if (liked) like(postId); else unlike(postId);
        }}
        onComment={(postId) => {
          commentSheetRef.current?.open(postId);
        }}
        onUserPress={(username) => {
          router.push(`/user/${username}`);
        }}
        onBookmark={(postId, bookmarked) => {
          if (bookmarked) save(postId); else unsave(postId);
        }}
        onMenuPress={(postId) => {
          const actions: ActionMenuItem[] = [
            { key: 'save', icon: 'bookmark-outline', label: 'Save post', onPress: () => save(postId) },
            { key: 'share', icon: 'share-outline', label: 'Share', onPress: () => {} },
            { key: 'report', icon: 'flag-outline', label: 'Report', onPress: () => {} },
            { key: 'hide', icon: 'eye-off-outline', label: 'Hide post', onPress: () => {} },
            { key: 'unfollow', icon: 'person-remove-outline', label: 'Unfollow', onPress: () => {} },
            { key: 'delete', icon: 'trash-outline', label: 'Delete', destructive: true, onPress: () => {} },
          ];
          presentActionMenu(actions);
        }}
      />
    );
  }, [like, unlike, save, unsave, commentSheetRef]);

  const skeletonData = useMemo(() => Array.from({ length: 3 }), []);

  const renderSkeleton = useCallback((info: { item: any; index: number }) => (
    <FeedPostSkeleton key={`skeleton-${info.index}`} testID="feed-skeleton" />
  ), []);

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    if (error && posts.length === 0) {
      return (
        <View style={{ alignItems: "center", marginTop: theme.SPACING.xxxxxl, paddingHorizontal: theme.LAYOUT.contentPadding }}>
          <Text style={{ color: theme.COLORS.textMuted, marginBottom: theme.SPACING.md }}>{error.message}</Text>
          <TouchableOpacity onPress={refresh} style={{ padding: theme.SPACING.md, backgroundColor: theme.COLORS.primaryGhost, borderRadius: theme.BORDER_RADIUS.full }}>
            <Text style={{ color: theme.COLORS.primary, fontWeight: theme.TYPOGRAPHY.fontWeight.semibold }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ alignItems: "center", marginTop: theme.SPACING.xxxxxl }}>
        <Text style={{ color: theme.COLORS.textMuted }}>No posts yet</Text>
      </View>
    );
  }, [loading, error, posts.length, refresh]);

  const showSkeletons = loading && posts.length === 0;

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.COLORS.bgLight,
      }}
    >
      <OfflineBanner isOffline={isOffline} onRetry={refresh} />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.LAYOUT.contentPadding,
          paddingTop: theme.SPACING.md,
          paddingBottom: theme.SPACING.sm,
          backgroundColor: theme.COLORS.bgLight,
          ...theme.SHADOWS.xl,
          zIndex: 10,
        }}
      >
        <Text style={styles.headerTitle}>Feed</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIconBtn}>
            <Ionicons name="search" size={22} color={theme.COLORS.textPrimary} />
          </Pressable>
          <Pressable style={styles.headerIconBtn}>
            <Ionicons name="notifications-outline" size={22} color={theme.COLORS.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/posts/create")}
          >
            <Ionicons name="add-circle-outline" size={24} color={theme.COLORS.primary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        style={{
          flex: 1,
          backgroundColor: theme.COLORS.bgLight,
        }}
        data={showSkeletons ? skeletonData as any : posts}
        showsVerticalScrollIndicator={false}
        numColumns={1}
        keyExtractor={(item, index) => showSkeletons ? `skeleton-${index}` : item.id}
        ListHeaderComponent={showSkeletons ? null : <StoriesBar />}
        ListEmptyComponent={showSkeletons ? null : renderEmpty}
        ListFooterComponent={
          loading && !showSkeletons ? (
            <View style={{ paddingVertical: theme.SPACING.xxxxl, alignItems: "center" }}>
              <Text style={{ color: theme.COLORS.textMuted }}>Loading...</Text>
            </View>
          ) : (
            <View style={{ height: theme.SPACING.xxxxl }} />
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
        renderItem={showSkeletons ? renderSkeleton : renderItem}
      />
      <CommentBottomSheet ref={commentSheetRef} />
    </SafeAreaView>
  );
}

const styles = {
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.xs,
  } as const,
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.SPACING.sm,
  } as const,
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  } as const,
};
