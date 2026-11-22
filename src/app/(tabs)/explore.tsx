import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import ExploreTile from "@/components/explore/ExploreTile";
import PeopleSearchResults from "@/components/explore/PeopleSearchResults";
import PostCard from "@/components/feed/PostCard";
import { ExploreGridSkeleton } from "@/components/ui";
import { FEED } from "@/constants/feedTheme";
import * as theme from "@/constants/theme";
import { useDebounce } from "@/hooks/useDebounce";
import { useExploreFeed } from "@/hooks/useExploreFeed";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import type { SocialPost } from "@/types";
import { publishPostUpdate } from "@/utils/postUpdates";

const GRID_GAP = 2;
const TAB_BAR_SPACE = 112;
const GRID_PADDING = theme.LAYOUT.contentPadding;

export default function ExploreScreen() {
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 4 : width >= 340 ? 3 : 2;
  // Align the grid with the header/search gutters instead of running tiles to
  // the physical screen edge. Three 2px gaps stay inside the content width.
  const gridWidth = Math.max(0, width - GRID_PADDING * 2);
  const tileSize = Math.max(
    0,
    (gridWidth - GRID_GAP * (columns - 1)) / columns,
  );
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "posts">("grid");
  const token = useAppSelector((state) => state.auth.token);
  const accountId = useAppSelector((state) => state.auth.user?.id);
  const debouncedQuery = useDebounce(query, 300);
  const normalizedQuery = debouncedQuery.trim();
  const isSearching = query.trim().length > 0;

  const {
    posts,
    loading,
    refreshing,
    paginating,
    error,
    paginationError,
    cursorExpired,
    hasMore,
    exhausted,
    refresh,
    loadMore,
    retryPagination,
  } = useExploreFeed({ limit: 24 });

  const openPost = useCallback((postId: string) => {
    router.push({ pathname: "/posts/[id]", params: { id: postId } });
  }, []);

  const toggleLike = useCallback(
    async (postId: string, liked: boolean) => {
      if (!token || !accountId) throw new Error("Sign in to update posts");
      const target = posts.find((post) => post.id === postId);
      let confirmed: any;
      if (liked) {
        confirmed = await api.post(
          `/posts/${encodeURIComponent(postId)}/like`,
          {},
          token,
        );
      } else {
        confirmed = await api.delete(
          `/posts/${encodeURIComponent(postId)}/like`,
          token,
        );
      }
      const canonical =
        confirmed?.data?.likesCount ?? confirmed?.data?._count?.likes;
      const likeCount =
        Number.isSafeInteger(canonical) && canonical >= 0
          ? canonical
          : Math.max(
              0,
              (target?.likeCount ?? 0) + (liked ? (target?.isLiked ? 0 : 1) : target?.isLiked ? -1 : 0),
            );
      publishPostUpdate({
        postId,
        accountId,
        patch: {
          isLiked: liked,
          likeCount,
          likesCount: likeCount,
          likeStateKnown: true,
        },
      });
    },
    [accountId, posts, token],
  );

  const toggleBookmark = useCallback(
    async (postId: string, bookmarked: boolean) => {
      if (!token || !accountId) throw new Error("Sign in to update posts");
      if (bookmarked) {
        await api.post(`/posts/${encodeURIComponent(postId)}/save`, {}, token);
      } else {
        await api.delete(`/posts/${encodeURIComponent(postId)}/save`, token);
      }
      publishPostUpdate({
        postId,
        accountId,
        patch: { isBookmarked: bookmarked, saveStateKnown: true },
      });
    },
    [accountId, token],
  );

  const sharePost = useCallback(
    async (postId: string) => {
      const target = posts.find((post) => post.id === postId);
      await Share.share({
        message: target?.content?.trim() || "Check out this post",
      });
    },
    [posts],
  );

  const openComments = useCallback((postId: string) => {
    router.push({
      pathname: "/posts/[id]/comments" as never,
      params: { id: postId } as never,
    });
  }, []);

  const renderPostItem = useCallback(
    ({ item }: { item: SocialPost }) => (
      <View style={styles.postCardWrap}>
        <PostCard
          post={item}
          onLike={toggleLike}
          onBookmark={toggleBookmark}
          onComment={openComments}
          onShare={sharePost}
          onOpen={openPost}
          onUserPress={(username) => router.push(`/user/${username}`)}
        />
      </View>
    ),
    [openComments, openPost, sharePost, toggleBookmark, toggleLike],
  );

  const renderItem = useCallback(
    ({ item }: { item: SocialPost }) => (
      <ExploreTile post={item} size={tileSize} onOpen={openPost} />
    ),
    [openPost, tileSize],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.gridIntro}>
        <View style={styles.gridHeadingRow}>
          <View style={styles.gridHeadingCopy}>
            <Text style={styles.eyebrow}>RECOMMENDED FOR YOU</Text>
            <Text style={styles.gridTitle}>Beyond your feed</Text>
            <Text style={styles.gridSubtitle}>
              Ranked posts from beyond your usual circle.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh recommendations"
            accessibilityState={{ busy: refreshing }}
            disabled={refreshing || loading}
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.pressed,
              (refreshing || loading) && styles.refreshDisabled,
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.COLORS.primary} />
            ) : (
              <Ionicons
                name="refresh"
                size={18}
                color={theme.COLORS.primary}
              />
            )}
          </Pressable>
        </View>
        {error && posts.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry recommendations"
            onPress={() => void refresh()}
            style={styles.inlineError}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={15}
              color={theme.COLORS.danger}
            />
            <Text numberOfLines={2} style={styles.inlineErrorText}>
              {error.message}
            </Text>
            <Text style={styles.inlineRetry}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    [error, loading, posts.length, refresh, refreshing],
  );

  const emptyState = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.skeletonWrap}>
          <ExploreGridSkeleton
            count={columns * 3}
            columns={columns}
            tileSize={tileSize}
            gap={GRID_GAP}
          />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.state} accessibilityRole="alert">
          <View style={styles.stateIcon}>
            <Ionicons
              name="cloud-offline-outline"
              size={26}
              color={theme.COLORS.primary}
            />
          </View>
          <Text style={styles.stateTitle}>Couldn’t load Explore</Text>
          <Text style={styles.stateText}>
            {error.message ||
              "Check your connection and try loading recommendations again."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void refresh()}
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.COLORS.white} />
            ) : (
              <Text style={styles.primaryActionText}>Try again</Text>
            )}
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.state}>
        <View style={styles.stateIcon}>
          <Ionicons
            name="compass-outline"
            size={26}
            color={theme.COLORS.primary}
          />
        </View>
        <Text style={styles.stateTitle}>Nothing new right now</Text>
        <Text style={styles.stateText}>
          You’ve seen everything in this batch. Refresh for a fresh set of
          recommendations.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh recommendations"
          onPress={() => void refresh()}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.COLORS.white} />
          ) : (
            <Text style={styles.primaryActionText}>Refresh recommendations</Text>
          )}
        </Pressable>
      </View>
    );
  }, [columns, error, loading, refresh, refreshing, tileSize]);

  const footer = useMemo(() => {
    if (!posts.length) return null;
    if (paginating) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator color={theme.COLORS.primary} />
          <Text style={styles.footerText}>Loading more</Text>
        </View>
      );
    }
    if (paginationError) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            cursorExpired
              ? "Refresh expired recommendations"
              : "Retry loading more recommendations"
          }
          onPress={() => void retryPagination()}
          style={styles.footer}
        >
          <Ionicons
            name="alert-circle-outline"
            size={16}
            color={theme.COLORS.textSecondary}
          />
          <Text style={styles.footerAction}>
            {cursorExpired
              ? "These recommendations expired · Refresh"
              : `${paginationError.message} · Retry`}
          </Text>
        </Pressable>
      );
    }
    if (exhausted || !hasMore) {
      return (
        <View style={styles.footer}>
          <Ionicons
            name="checkmark-circle-outline"
            size={16}
            color={theme.COLORS.textMuted}
          />
          <Text style={styles.footerText}>
            You’re caught up on recommendations
          </Text>
        </View>
      );
    }
    return <View style={styles.footerSpacer} />;
  }, [
    cursorExpired,
    exhausted,
    hasMore,
    paginating,
    paginationError,
    posts.length,
    retryPagination,
  ]);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>DISCOVER</Text>
          <Text style={styles.headerTitle}>Explore</Text>
        </View>
        <View style={styles.headerMark}>
          <Ionicons
            name="compass-outline"
            size={21}
            color={theme.COLORS.primary}
          />
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={18}
            color={theme.COLORS.textMuted}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people"
            placeholderTextColor={theme.COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search people"
            maxLength={50}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery("")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.COLORS.textMuted}
              />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.viewSwitch}>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Show grid"
            accessibilityState={{ selected: view === "grid" }}
            onPress={() => setView("grid")}
            style={[styles.viewSwitchBtn, view === "grid" && styles.viewSwitchActive]}
          >
            <Ionicons
              name="grid-outline"
              size={15}
              color={view === "grid" ? theme.COLORS.white : FEED.muted}
            />
            <Text
              style={[
                styles.viewSwitchText,
                view === "grid" && styles.viewSwitchTextActive,
              ]}
            >
              Grid
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Show posts"
            accessibilityState={{ selected: view === "posts" }}
            onPress={() => setView("posts")}
            style={[styles.viewSwitchBtn, view === "posts" && styles.viewSwitchActive]}
          >
            <Ionicons
              name="albums-outline"
              size={15}
              color={view === "posts" ? theme.COLORS.white : FEED.muted}
            />
            <Text
              style={[
                styles.viewSwitchText,
                view === "posts" && styles.viewSwitchTextActive,
              ]}
            >
              Posts
            </Text>
          </Pressable>
        </View>
      </View>

      {isSearching ? (
        normalizedQuery ? (
          <PeopleSearchResults query={normalizedQuery} />
        ) : (
          <View style={styles.state}>
            <ActivityIndicator color={theme.COLORS.primary} />
          </View>
        )
      ) : view === "grid" ? (
        <FlatList
          key={`explore-${columns}`}
          data={posts}
          renderItem={renderItem}
          keyExtractor={(post) => post.id}
          numColumns={columns}
          columnWrapperStyle={
            columns > 1 ? { gap: GRID_GAP } : undefined
          }
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyState}
          ListFooterComponent={footer}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          onEndReached={() => {
            if (hasMore && posts.length > 0) void loadMore();
          }}
          onEndReachedThreshold={0.5}
          initialNumToRender={columns * 3}
          maxToRenderPerBatch={columns * 3}
          updateCellsBatchingPeriod={50}
          windowSize={9}
          removeClippedSubviews={Platform.OS === "android"}
        />
      ) : (
        <FlatList
          key="explore-posts"
          data={posts}
          renderItem={renderPostItem}
          keyExtractor={(post) => post.id}
          style={styles.list}
          contentContainerStyle={styles.postListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyState}
          ListFooterComponent={footer}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          onEndReached={() => {
            if (hasMore && posts.length > 0) void loadMore();
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.sm,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    letterSpacing: 1,
  },
  headerTitle: {
    marginTop: 2,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl8,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -0.3,
  },
  headerMark: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  searchWrap: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.md,
  },
  searchBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: 16,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
    ...theme.SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
  viewSwitch: {
    flexDirection: "row",
    alignSelf: "flex-start",
    marginTop: theme.SPACING.md,
    padding: 3,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: FEED.surface,
    borderWidth: 1,
    borderColor: FEED.border,
    gap: 2,
  },
  viewSwitchBtn: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  viewSwitchActive: {
    backgroundColor: FEED.accent,
  },
  viewSwitchText: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  viewSwitchTextActive: {
    color: theme.COLORS.white,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: TAB_BAR_SPACE,
  },
  postListContent: {
    flexGrow: 1,
    paddingHorizontal: GRID_PADDING + 4,
    paddingBottom: TAB_BAR_SPACE,
  },
  postCardWrap: {
    paddingTop: theme.SPACING.lg,
  },
  gridIntro: {
    paddingBottom: theme.SPACING.md,
  },
  gridHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.SPACING.md,
    paddingTop: theme.SPACING.sm,
  },
  gridHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.COLORS.primary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1,
  },
  gridTitle: {
    marginTop: 2,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  gridSubtitle: {
    marginTop: 2,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: 16,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  refreshDisabled: {
    opacity: theme.OPACITY.disabled,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.dangerLight,
  },
  inlineErrorText: {
    flex: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  inlineRetry: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  skeletonWrap: {
    paddingTop: theme.SPACING.xs,
  },
  state: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.xxxxxl,
  },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
    marginBottom: theme.SPACING.xs,
  },
  stateTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  stateText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    lineHeight: 18,
    textAlign: "center",
  },
  primaryAction: {
    minHeight: 44,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  primaryActionText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
  footer: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.lg,
  },
  footerText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  footerAction: {
    flexShrink: 1,
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  footerSpacer: {
    height: theme.SPACING.xl,
  },
});
