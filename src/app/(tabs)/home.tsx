import React, { useCallback, useRef } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
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

export default function FeedScreen() {
  const { posts, loading, refreshing, refresh, like, unlike, save, unsave, loadMore, hasMore } = usePosts({ limit: 20 });
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
        onBookmark={(postId, bookmarked) => {
          if (bookmarked) save(postId); else unsave(postId);
        }}
      />
    );
  }, [like, unlike, save, unsave, commentSheetRef]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.COLORS.bgLight,
      }}
    >
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
        data={posts}
        showsVerticalScrollIndicator={false}
        numColumns={1}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<StoriesBar />}
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: theme.SPACING.xxxxl, alignItems: "center" }}>
              <Text style={{ color: theme.COLORS.textMuted }}>Loading...</Text>
            </View>
          ) : (
            <View style={{ height: theme.SPACING.xxxxl }} />
          )
        }
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.COLORS.primary}
            colors={[theme.COLORS.primary]}
          />
        }
        renderItem={renderItem}
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
