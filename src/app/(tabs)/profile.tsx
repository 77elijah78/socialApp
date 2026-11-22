import { usePosts } from "@/hooks/usePosts";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  filterProfilePosts,
  ProfileActionButton,
  ProfileGridItem,
  ProfileHeaderContent,
  profileGridItemSize,
  PROFILE_GRID_COLUMNS,
  PROFILE_GRID_GAP,
  PROFILE_GRID_PADDING,
  type ProfileFilter,
} from "@/components/profile/ProfileView";
import { FEED } from "@/constants/feedTheme";
import * as theme from "@/constants/theme";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { SocialPost } from "@/types";
import { subscribePostUpdates } from "@/utils/postUpdates";
import { normalizeMediaUrl } from "@/utils/mediaUrls";

interface ProfileData {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  _count?: { posts: number; followers: number; following: number };
}

export default function ProfileScreen() {
  const user = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.token);
  const unread = useAppSelector((state) =>
    state.notifications?.accountId === state.auth.user?.id
      ? (state.notifications?.unreadCount ?? 0)
      : 0,
  );
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

  const filteredPosts = useMemo(
    () => filterProfilePosts(posts, filter),
    [posts, filter],
  );

  const gridItemSize = profileGridItemSize(screenWidth);

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
      <ProfileHeaderContent
        avatarUrl={avatarUrl}
        initial={initial}
        displayName={displayName}
        username={username}
        bio={bio}
        isVerified={profileData?.isVerified}
        postCount={postCount}
        followers={counts.followers ?? 0}
        following={counts.following ?? 0}
        memories={memories}
        filter={filter}
        onFilterChange={setFilter}
        actions={
          <>
            <ProfileActionButton
              label="Edit profile"
              icon="create-outline"
              variant="secondary"
              onPress={() => router.push("/editProfile")}
            />
            <ProfileActionButton
              label="New post"
              icon="add"
              onPress={() => router.push("/posts/create")}
            />
          </>
        }
      />
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
    ({ item, index }: { item: SocialPost; index: number }) => (
      <ProfileGridItem
        post={item}
        index={index}
        size={gridItemSize}
        username={username}
      />
    ),
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
                  : filter === "text"
                    ? "text-outline"
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
              : filter === "text"
                ? "No text posts yet"
                : "Your first post starts here"}
        </Text>
        <Text style={styles.emptySubtitle}>
          {filter === "posts"
            ? "Share your first post and make this space yours."
            : filter === "text"
              ? "Share a thought and it will appear here."
              : `Share a ${filter === "videos" ? "video" : "photo"} to see it here.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/posts/create",
              params:
                filter === "posts" || filter === "text"
                  ? undefined
                  : { mode: filter },
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
        <View style={styles.topBarActions}>
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
            <Ionicons name="heart-outline" size={20} color={FEED.text} />
            {unread > 0 ? <View style={styles.activityDot} /> : null}
          </Pressable>
        </View>
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
        numColumns={PROFILE_GRID_COLUMNS}
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
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  activityDot: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.COLORS.secondary,
    borderWidth: 1.5,
    borderColor: FEED.surface,
  },
  topBarTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
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
    gap: PROFILE_GRID_GAP,
    marginBottom: PROFILE_GRID_GAP,
    paddingHorizontal: PROFILE_GRID_PADDING,
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
