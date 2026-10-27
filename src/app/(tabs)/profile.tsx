import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import theme from "@/constants/theme";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { PostResponse, SocialPost } from "@/types";

const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 3;

type ProfileTab = "posts" | "likes";

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
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

function mapPostResponse(post: PostResponse): SocialPost {
  return {
    ...post,
    timestamp: new Date(post.createdAt).toISOString(),
    imageUrl: post.imageUrls?.[0] ?? "",
    tags: [],
    likeCount: post._count?.likes ?? 0,
    commentCount: post._count?.comments ?? 0,
    shareCount: post.shareCount ?? 0,
    isLiked: post.isLiked ?? false,
    isBookmarked: post.isSaved ?? false,
  };
}

export default function ProfileScreen() {
  const user = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.token);
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentUsername = user?.username ?? "";
  const displayName =
    profileData?.displayName || user?.displayName || user?.username || "Your profile";
  const username = profileData?.username || user?.username || "";
  const avatarUrl = profileData?.avatarUrl ?? user?.avatarUrl ?? null;
  const bio = profileData?.bio ?? user?.bio ?? null;
  const initial = displayName.charAt(0).toUpperCase() || "Y";
  const counts = profileData?._count ?? { posts: posts.length, followers: 0, following: 0 };
  const currentPosts = activeTab === "posts" ? posts : likedPosts;
  const gridItemSize =
    (screenWidth - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
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

  const fetchPosts = useCallback(async () => {
    if (!token || !currentUsername) return;
    try {
      const response = await api.get<{
        success: boolean;
        data: { user: ProfileData; posts: PostResponse[]; total: number };
      }>(`/posts/user/${currentUsername}?page=1&limit=50`, token);
      setProfileData((previous) => ({
        ...(previous ?? response.data.user),
        ...response.data.user,
      }));
      setPosts((response.data.posts ?? []).map(mapPostResponse));
    } catch (error) {
      console.warn("Failed to load profile posts:", error);
    }
  }, [token, currentUsername]);

  const fetchLikedPosts = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.get<{
        success: boolean;
        data: { posts: PostResponse[]; total: number };
      }>("/posts/liked?page=1&limit=50", token);
      setLikedPosts((response.data.posts ?? []).map(mapPostResponse));
    } catch (error) {
      console.warn("Failed to load liked posts:", error);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (!token || !currentUsername) {
        setLoading(false);
        return;
      }

      setLoading(true);
      await Promise.all([fetchProfile(), fetchPosts(), fetchLikedPosts()]);
      if (!cancelled) setLoading(false);
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [token, currentUsername, fetchProfile, fetchPosts, fetchLikedPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchProfile(), fetchPosts(), fetchLikedPosts()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchProfile, fetchPosts, fetchLikedPosts]);

  const renderProfileHeader = useCallback(() => (
    <View>
      <View style={styles.profileCard}>
        <LinearGradient
          colors={[theme.COLORS.primary, theme.COLORS.accentPurple, "#8B74E8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cover}
        >
          <View style={styles.coverOrbLarge} />
          <View style={styles.coverOrbSmall} />
          <View style={styles.coverLabel}>
            <Ionicons name="sparkles" size={13} color={theme.COLORS.white} />
            <Text style={styles.coverLabelText}>YOUR CREATOR SPACE</Text>
          </View>
          <Ionicons name="aperture-outline" size={24} color="rgba(255,255,255,0.8)" />
        </LinearGradient>

        <View style={styles.profileContent}>
          <View style={styles.avatarOverlapRow}>
            <View style={styles.avatarShell}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
            {profileData?.isVerified ? (
              <Ionicons name="checkmark-circle" size={18} color={theme.COLORS.primary} />
            ) : null}
          </View>
          {username ? <Text style={styles.username}>@{username}</Text> : null}
          {bio ? <Text style={styles.bio}>{bio}</Text> : null}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(counts.posts ?? posts.length)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(counts.followers ?? 0)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(counts.following ?? 0)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/editProfile")}
              style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={17} color={theme.COLORS.white} />
              <Text style={styles.primaryActionText}>Edit profile</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/posts/create")}
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={19} color={theme.COLORS.primary} />
              <Text style={styles.secondaryActionText}>New post</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.tabsSection}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "posts" }}
          style={[styles.profileTab, activeTab === "posts" && styles.profileTabActive]}
          onPress={() => setActiveTab("posts")}
        >
          <Ionicons
            name="grid-outline"
            size={17}
            color={activeTab === "posts" ? theme.COLORS.primary : theme.COLORS.textMuted}
          />
          <Text style={[styles.profileTabText, activeTab === "posts" && styles.profileTabTextActive]}>Posts</Text>
          <Text style={[styles.profileTabCount, activeTab === "posts" && styles.profileTabTextActive]}>
            {formatCount(posts.length)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "likes" }}
          style={[styles.profileTab, activeTab === "likes" && styles.profileTabActive]}
          onPress={() => setActiveTab("likes")}
        >
          <Ionicons
            name="heart-outline"
            size={17}
            color={activeTab === "likes" ? theme.COLORS.primary : theme.COLORS.textMuted}
          />
          <Text style={[styles.profileTabText, activeTab === "likes" && styles.profileTabTextActive]}>Liked</Text>
          <Text style={[styles.profileTabCount, activeTab === "likes" && styles.profileTabTextActive]}>
            {formatCount(likedPosts.length)}
          </Text>
        </Pressable>
      </View>
    </View>
  ), [
    avatarUrl,
    initial,
    displayName,
    profileData?.isVerified,
    username,
    bio,
    counts.posts,
    counts.followers,
    counts.following,
    posts.length,
    likedPosts.length,
    activeTab,
  ]);

  const renderGridItem = useCallback(
    ({ item }: { item: SocialPost }) => {
      const imageUrl = item.imageUrl ?? item.imageUrls?.[0] ?? "";
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open post by ${item.author.displayName ?? item.author.username}`}
          style={[styles.gridItem, { width: gridItemSize, height: gridItemSize }]}
          onPress={() => router.push(`/posts/${item.id}/comments`)}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.gridImage} />
          ) : (
            <LinearGradient
              colors={[theme.COLORS.primary, theme.COLORS.accentPurple]}
              style={styles.textPostTile}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={19} color="rgba(255,255,255,0.85)" />
              <Text style={styles.textPostContent} numberOfLines={5}>{item.content}</Text>
            </LinearGradient>
          )}
          {imageUrl ? <View style={styles.gridScrim} /> : null}
          <View style={styles.gridStats}>
            <View style={styles.gridStat}>
              <Ionicons
                name={activeTab === "likes" ? "heart" : "chatbubble"}
                size={12}
                color={theme.COLORS.white}
              />
              <Text style={styles.gridStatText}>
                {formatCount(activeTab === "likes" ? item.likeCount ?? 0 : item.commentCount ?? 0)}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [activeTab, gridItemSize],
  );

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name={activeTab === "likes" ? "heart-outline" : "images-outline"}
          size={25}
          color={theme.COLORS.primary}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {activeTab === "likes" ? "No likes yet" : "Your first post starts here"}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === "likes"
          ? "Posts you like will be collected here."
          : "Share your first post and make this space yours."}
      </Text>
      {activeTab === "posts" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/posts/create")}
          style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={17} color={theme.COLORS.white} />
          <Text style={styles.emptyButtonText}>Create a post</Text>
        </Pressable>
      ) : null}
    </View>
  ), [activeTab]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>YOUR SPACE</Text>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
          <Text style={styles.loadingText}>Getting your profile ready…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>YOUR SPACE</Text>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bookmarks"
            onPress={() => router.push("/bookmarks")}
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
          >
            <Ionicons name="bookmark-outline" size={20} color={theme.COLORS.textPrimary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
          >
            <Ionicons name="settings-outline" size={20} color={theme.COLORS.textPrimary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={currentPosts}
        ListHeaderComponent={renderProfileHeader}
        ListFooterComponent={<View style={styles.footerSpace} />}
        contentContainerStyle={styles.listContent}
        renderItem={renderGridItem}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.COLORS.primary}
            colors={[theme.COLORS.primary]}
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
  headerEyebrow: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    letterSpacing: 1,
  },
  headerTitle: {
    marginTop: 2,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.xxxxl,
  },
  profileCard: {
    marginHorizontal: theme.LAYOUT.contentPadding,
    marginBottom: theme.SPACING.md,
    borderRadius: 23,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
    overflow: "visible",
    ...theme.SHADOWS.sm,
  },
  cover: {
    height: 112,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.lg,
    paddingTop: theme.SPACING.lg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  coverOrbLarge: {
    position: "absolute",
    right: 26,
    top: -72,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  coverOrbSmall: {
    position: "absolute",
    right: -32,
    bottom: -54,
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  coverLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: 5,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  coverLabelText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 0.8,
  },
  profileContent: {
    paddingHorizontal: theme.SPACING.lg,
    paddingBottom: theme.SPACING.lg,
  },
  avatarOverlapRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    marginTop: -38,
    marginBottom: theme.SPACING.sm,
  },
  avatarShell: {
    width: 84,
    height: 84,
    padding: 4,
    borderRadius: 42,
    backgroundColor: theme.COLORS.bgWhite,
    ...theme.SHADOWS.md,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgInput,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
  },
  displayName: {
    flexShrink: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  username: {
    marginTop: 3,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  bio: {
    marginTop: theme.SPACING.sm,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    borderRadius: 16,
    backgroundColor: theme.COLORS.bgLight,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  statLabel: {
    marginTop: 2,
    color: theme.COLORS.textSecondary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.COLORS.borderDivider,
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.md,
  },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    borderRadius: 14,
    backgroundColor: theme.COLORS.primary,
  },
  primaryActionText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    borderRadius: 14,
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  secondaryActionText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  tabsSection: {
    flexDirection: "row",
    marginHorizontal: theme.LAYOUT.contentPadding,
    marginBottom: theme.SPACING.sm,
    padding: 4,
    borderRadius: 17,
    backgroundColor: "#EAE8F2",
  },
  profileTab: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    borderRadius: 13,
  },
  profileTabActive: {
    backgroundColor: theme.COLORS.bgWhite,
    ...theme.SHADOWS.sm,
  },
  profileTabText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  profileTabTextActive: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  profileTabCount: {
    color: theme.COLORS.textMuted,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },
  gridItem: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: theme.COLORS.bgInput,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(26,26,46,0.12)",
  },
  textPostTile: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    padding: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  textPostContent: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  gridStats: {
    position: "absolute",
    right: 6,
    bottom: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "rgba(26,26,46,0.55)",
  },
  gridStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  gridStatText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.xxxxxl,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  emptyTitle: {
    marginTop: theme.SPACING.md,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    textAlign: "center",
  },
  emptySubtitle: {
    maxWidth: 280,
    marginTop: theme.SPACING.xs,
    color: theme.COLORS.textSecondary,
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
    backgroundColor: theme.COLORS.primary,
  },
  emptyButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  footerSpace: {
    height: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.md,
  },
  loadingText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
});
