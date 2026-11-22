import { usePosts } from "@/hooks/usePosts";
import { authorFeedParams } from "@/utils/postContracts";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { FEED } from "@/constants/feedTheme";
import * as theme from "@/constants/theme";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { SocialPost } from "@/types";
import { subscribePostUpdates } from "@/utils/postUpdates";
import { normalizeMediaUrl } from "@/utils/mediaUrls";

const GRID_GAP = 3;
const GRID_PADDING = 8;
const GRID_COLUMNS = 3;

type ProfileFilter = "posts" | "photos" | "videos";

const FILTERS: { key: ProfileFilter; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Videos" },
];

interface ProfileData {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  _count?: { posts: number; followers: number; following: number };
}

function formatCount(count: number): string {
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

function memoryLabel(timestamp: string): string {
  const age = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(age) || age < 0) return "New";
  const days = Math.floor(age / 86_400_000);
  if (days <= 0) return "Today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export default function ProfileScreen() {
  const user = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.token);
  const { width: screenWidth } = useWindowDimensions();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const {
    posts,
    refreshing,
    refresh: refreshPosts,
    loadMore,
    hasMore,
    paginating,
    error: postsError,
    paginationError,
    total: postsTotal,
    loading: postsLoading,
  } = usePosts({ source: "author", username: user?.username });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProfileFilter>("posts");
  const focusedOnce = useRef(false);

  const currentUsername = user?.username ?? "";
  const displayName =
    profileData?.displayName ||
    user?.displayName ||
    user?.username ||
    "Your profile";
  const username = profileData?.username || user?.username || "";
  const avatarUrl =
    normalizeMediaUrl(user?.avatarUrl) ??
    normalizeMediaUrl(profileData?.avatarUrl);
  const bio = profileData?.bio ?? user?.bio ?? null;
  const initial = displayName.charAt(0).toUpperCase() || "Y";
  const counts = profileData?._count ?? {
    posts: posts.length,
    followers: 0,
    following: 0,
  };
  // The author feed owns the live total; profile stats are the fallback while
  // that page is still loading or failed.
  const postCount =
    postsLoading || postsError
      ? counts.posts
      : Math.min(counts.posts, postsTotal);

  const memories = useMemo(
    () => posts.filter((post) => post.imageUrls.length > 0).slice(0, 10),
    [posts],
  );

  const filteredPosts = useMemo(() => {
    if (filter === "photos")
      return posts.filter((post) => post.imageUrls.length > 0);
    if (filter === "videos") return posts.filter((post) => Boolean(post.videoUrl));
    return posts;
  }, [posts, filter]);

  const gridItemSize =
    (screenWidth - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
    GRID_COLUMNS;

  const fetchProfile = useCallback(async () => {
    if (!token || !currentUsername) return;
    try {
      const response = await api.get<{ success: boolean; data: ProfileData }>(
        `/users/${currentUsername}`,
        token,
      );
      setProfileData(response.data);
    } catch (error) {
      console.warn("Failed to load profile stats:", error);
    }
  }, [token, currentUsername]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (!token || !currentUsername) {
        setLoading(false);
        return;
      }

      setLoading(true);
      await fetchProfile();
      if (!cancelled) setLoading(false);
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [token, currentUsername, fetchProfile]);

  const onRefresh = useCallback(async () => {
    await Promise.all([fetchProfile(), refreshPosts()]);
  }, [fetchProfile, refreshPosts]);

  // A deletion can happen from the home feed or a selected-post screen. Reflect
  // the confirmed event immediately, then reconcile server stats on return.
  useEffect(() => {
    if (!user?.id) return;
    return subscribePostUpdates((event) => {
      if (event.accountId !== user.id || !event.deleted) return;
      setProfileData((current) =>
        current
          ? {
              ...current,
              _count: {
                posts: Math.max(0, (current._count?.posts ?? postsTotal) - 1),
                followers: current._count?.followers ?? 0,
                following: current._count?.following ?? 0,
              },
            }
          : current,
      );
    });
  }, [postsTotal, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void Promise.all([fetchProfile(), refreshPosts()]);
    }, [fetchProfile, refreshPosts]),
  );

  const renderProfileHeader = useCallback(
    () => (
      <View style={styles.profileHeader}>
        <View style={styles.avatarRing}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
          {profileData?.isVerified ? (
            <Ionicons
              name="checkmark-circle"
              size={17}
              color={FEED.accent}
            />
          ) : null}
        </View>
        {username ? <Text style={styles.username}>@{username}</Text> : null}
        {bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {bio}
          </Text>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatCount(postCount)}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatCount(counts.followers ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatCount(counts.following ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/editProfile")}
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="create-outline" size={16} color={FEED.text} />
            <Text style={styles.secondaryActionText}>Edit profile</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/posts/create")}
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={18} color={theme.COLORS.white} />
            <Text style={styles.primaryActionText}>New post</Text>
          </Pressable>
        </View>

        {memories.length > 0 ? (
          <View style={styles.memoriesSection}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Memories</Text>
              <Text style={styles.sectionMeta}>
                {formatCount(memories.length)}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.memoriesList}
            >
              {memories.map((post, index) => (
                <Pressable
                  key={post.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open memory from ${memoryLabel(post.timestamp)}`}
                  onPress={() =>
                    router.push(authorFeedParams(username, post.id, index))
                  }
                  style={({ pressed }) => [
                    styles.memoryItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={{ uri: post.imageUrls[0] }}
                    style={styles.memoryImage}
                  />
                  <Text style={styles.memoryLabel} numberOfLines={1}>
                    {memoryLabel(post.timestamp)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.filters}>
          {FILTERS.map((item) => {
            const active = item.key === filter;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(item.key)}
                style={[styles.filter, active && styles.filterActive]}
              >
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ),
    [
      avatarUrl,
      initial,
      displayName,
      profileData?.isVerified,
      username,
      bio,
      postCount,
      counts.followers,
      counts.following,
      memories,
      filter,
    ],
  );

  const renderGridItem = useCallback(
    ({ item, index }: { item: SocialPost; index: number }) => {
      const imageUrl = item.imageUrl ?? item.imageUrls?.[0] ?? "";
      const hasVideo = Boolean(item.videoUrl);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open post by ${item.author.displayName ?? item.author.username}`}
          style={[
            styles.gridItem,
            { width: gridItemSize, height: gridItemSize },
          ]}
          onPress={() =>
            router.push(authorFeedParams(username, item.id, index))
          }
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.gridImage} />
          ) : hasVideo ? (
            <View style={[styles.gridImage, styles.videoTile]}>
              <Ionicons name="play" size={24} color={FEED.text} />
              <Text style={styles.gridTileLabel}>Video</Text>
            </View>
          ) : (
            <View style={[styles.gridImage, styles.textTile]}>
              <Ionicons
                name="text-outline"
                size={19}
                color={FEED.muted}
              />
              <Text style={styles.textPostContent} numberOfLines={4}>
                {item.content}
              </Text>
            </View>
          )}
          {hasVideo && imageUrl ? (
            <View style={styles.videoBadge}>
              <Ionicons name="play" size={10} color={theme.COLORS.white} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [gridItemSize, username],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={
              filter === "videos"
                ? "videocam-outline"
                : filter === "photos"
                  ? "images-outline"
                  : "camera-outline"
            }
            size={25}
            color={FEED.accent}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {filter === "videos"
            ? "No videos yet"
            : filter === "photos"
              ? "No photos yet"
              : "Your first post starts here"}
        </Text>
        <Text style={styles.emptySubtitle}>
          {filter === "posts"
            ? "Share your first post and make this space yours."
            : `Share a ${filter === "videos" ? "video" : "photo"} to see it here.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/posts/create",
              params: filter === "posts" ? undefined : { mode: filter },
            })
          }
          style={({ pressed }) => [
            styles.emptyButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add" size={17} color={theme.COLORS.white} />
          <Text style={styles.emptyButtonText}>Create a post</Text>
        </Pressable>
      </View>
    ),
    [filter],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <Text style={styles.topBarTitle}>Profile</Text>
          <View style={styles.topBarSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={FEED.accent} />
          <Text style={styles.loadingText}>Getting your profile ready…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bookmarks"
          onPress={() => router.push("/bookmarks")}
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="bookmark-outline" size={20} color={FEED.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Profile</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={FEED.text} />
        </Pressable>
      </View>

      <FlatList
        style={styles.list}
        data={filteredPosts}
        ListHeaderComponent={renderProfileHeader}
        onEndReached={() => {
          if (hasMore) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          <View style={styles.footerSpace}>
            {paginating ? (
              <ActivityIndicator color={FEED.accent} />
            ) : null}
            {postsError || paginationError ? (
              <Pressable
                onPress={() => void (postsError ? refreshPosts() : loadMore())}
              >
                <Text style={styles.emptySubtitle}>
                  {(postsError || paginationError)?.message} · Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={renderGridItem}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListEmptyComponent={
          postsLoading && posts.length === 0 ? null : renderEmptyState
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={FEED.accent}
            colors={[FEED.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FEED.background,
  },
  topBar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.sm,
  },
  topBarTitle: {
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    letterSpacing: -0.2,
  },
  topBarSpacer: {
    width: 42,
    height: 42,
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
  list: {
    flex: 1,
    backgroundColor: FEED.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
  },
  listContent: {
    paddingBottom: theme.SPACING.xxxxl,
  },
  profileHeader: {
    paddingTop: theme.SPACING.xxl,
    paddingBottom: theme.SPACING.sm,
    backgroundColor: FEED.surface,
  },
  avatarRing: {
    alignSelf: "center",
    width: 94,
    height: 94,
    padding: 3,
    borderRadius: 47,
    borderWidth: 2,
    borderColor: FEED.accent,
    backgroundColor: FEED.surface,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 44,
    backgroundColor: FEED.imageFallback,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FEED.accentSoft,
  },
  avatarInitial: {
    color: FEED.accent,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.xxl,
  },
  displayName: {
    flexShrink: 1,
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -0.3,
  },
  username: {
    marginTop: 2,
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    textAlign: "center",
  },
  bio: {
    marginTop: theme.SPACING.sm,
    marginHorizontal: theme.SPACING.xxxxxl,
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xxxxxl,
    marginTop: theme.SPACING.lg,
  },
  statItem: {
    alignItems: "center",
    minWidth: 58,
  },
  statValue: {
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  statLabel: {
    marginTop: 1,
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.SPACING.md,
    marginTop: theme.SPACING.lg,
    marginHorizontal: theme.SPACING.xxl,
  },
  primaryAction: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    borderRadius: 12,
    backgroundColor: FEED.accent,
  },
  primaryActionText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    borderRadius: 12,
    backgroundColor: FEED.surface,
    borderWidth: 1,
    borderColor: FEED.border,
  },
  secondaryActionText: {
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  memoriesSection: {
    marginTop: theme.SPACING.xxl,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.xxl,
    marginBottom: theme.SPACING.md,
  },
  sectionTitle: {
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sectionMeta: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  memoriesList: {
    paddingHorizontal: theme.SPACING.xxl,
    gap: theme.SPACING.lg,
  },
  memoryItem: {
    width: 66,
    alignItems: "center",
  },
  memoryImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: FEED.imageFallback,
  },
  memoryLabel: {
    width: 66,
    marginTop: theme.SPACING.xs,
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    textAlign: "center",
  },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  filter: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xl,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  filterActive: {
    backgroundColor: FEED.accent,
  },
  filterText: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  filterTextActive: {
    color: theme.COLORS.white,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
  },
  gridItem: {
    position: "relative",
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: FEED.imageFallback,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  videoTile: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    backgroundColor: "#E8EAF0",
  },
  gridTileLabel: {
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  textTile: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: theme.SPACING.md,
    backgroundColor: "#F0F1F4",
  },
  textPostContent: {
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
  },
  videoBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,20,0.55)",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.xxxxxl,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FEED.accentSoft,
  },
  emptyTitle: {
    marginTop: theme.SPACING.md,
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    textAlign: "center",
  },
  emptySubtitle: {
    maxWidth: 280,
    marginTop: theme.SPACING.xs,
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
    textAlign: "center",
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
    marginTop: theme.SPACING.lg,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: FEED.accent,
  },
  emptyButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  footerSpace: {
    height: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.md,
    backgroundColor: FEED.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  loadingText: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
});
