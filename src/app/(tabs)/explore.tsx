import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import theme from "@/constants/theme";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";

interface SearchedUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  _count: { followers: number; following: number; posts: number };
  isFollowing: boolean;
}

const CATEGORIES = [
  { id: "photo", label: "Photography", icon: "camera-outline" as const, color: theme.COLORS.primary },
  { id: "tech", label: "Technology", icon: "laptop-outline" as const, color: theme.COLORS.accentBlue },
  { id: "travel", label: "Travel", icon: "airplane-outline" as const, color: theme.COLORS.secondary },
  { id: "food", label: "Food", icon: "restaurant-outline" as const, color: theme.COLORS.accentPurple },
  { id: "art", label: "Art & design", icon: "color-palette-outline" as const, color: theme.COLORS.accentLightPurple },
  { id: "music", label: "Music", icon: "musical-notes-outline" as const, color: theme.COLORS.indigo },
];

const TRENDING_TOPICS = [
  { id: "01", title: "Everyday frames", subtitle: "Photography · Creative" },
  { id: "02", title: "Small weekend escapes", subtitle: "Travel · Community pick" },
  { id: "03", title: "What we’re making", subtitle: "Art & design · Growing" },
];

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

export default function ExploreScreen() {
  const token = useAppSelector((state) => state.auth.token);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [busyFollowIds, setBusyFollowIds] = useState<string[]>([]);
  const latestQueryRef = useRef("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const normalizedQuery = debouncedQuery.trim();
  const isSearching = searchQuery.trim().length > 0;

  const handleSearchChange = useCallback((value: string) => {
    latestQueryRef.current = value;
    setSearchQuery(value);
    setSearchResults([]);
    setSearchLoading(value.trim().length > 0);
  }, []);

  useEffect(() => {
    if (!normalizedQuery || latestQueryRef.current.trim() !== normalizedQuery) return;

    const controller = new AbortController();
    setSearchLoading(true);

    api
      .get<{ success: boolean; data: SearchedUser[] }>(
        `/users/search?q=${encodeURIComponent(normalizedQuery)}`,
        token ?? undefined,
        { signal: controller.signal },
      )
      .then((response) => {
        if (
          !controller.signal.aborted &&
          latestQueryRef.current.trim() === normalizedQuery
        ) {
          setSearchResults(response.data ?? []);
        }
      })
      .catch(() => {
        if (
          !controller.signal.aborted &&
          latestQueryRef.current.trim() === normalizedQuery
        ) {
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          latestQueryRef.current.trim() === normalizedQuery
        ) {
          setSearchLoading(false);
        }
      });

    return () => controller.abort();
  }, [normalizedQuery, token]);

  const handleFollow = useCallback(
    async (user: SearchedUser) => {
      if (busyFollowIds.includes(user.id)) return;
      setBusyFollowIds((previous) => [...previous, user.id]);

      try {
        if (user.isFollowing) {
          await api.delete(`/users/${user.username}/follow`, token ?? undefined);
        } else {
          await api.post(`/users/${user.username}/follow`, {}, token ?? undefined);
        }

        const isFollowing = !user.isFollowing;
        setSearchResults((previous) =>
          previous.map((result) =>
            result.id === user.id
              ? {
                  ...result,
                  isFollowing,
                  _count: {
                    ...result._count,
                    followers: Math.max(
                      0,
                      result._count.followers + (isFollowing ? 1 : -1),
                    ),
                  },
                }
              : result,
          ),
        );
      } catch {
        // Keep the search results unchanged if the follow request fails.
      } finally {
        setBusyFollowIds((previous) => previous.filter((id) => id !== user.id));
      }
    },
    [busyFollowIds, token],
  );

  const renderUserCard = useCallback(
    ({ item }: { item: SearchedUser }) => {
      const displayName = item.displayName || item.username;
      const isBusy = busyFollowIds.includes(item.id);

      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/user/${item.username}`)}
          style={({ pressed }) => [styles.userCard, pressed && styles.userCardPressed]}
        >
          <View style={styles.userInfo}>
            <View style={styles.userAvatarWrap}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.userAvatar} />
              ) : (
                <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                  <Text style={styles.userAvatarInitial}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.userDetails}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                {item.isVerified ? (
                  <Ionicons name="checkmark-circle" size={15} color={theme.COLORS.primary} />
                ) : null}
              </View>
              <Text style={styles.userUsername} numberOfLines={1}>@{item.username}</Text>
              <Text style={styles.userStats} numberOfLines={1}>
                {formatCount(item._count.posts)} posts · {formatCount(item._count.followers)} followers
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.isFollowing ? `Unfollow ${displayName}` : `Follow ${displayName}`}
            style={({ pressed }) => [
              styles.followButton,
              item.isFollowing && styles.followButtonFollowing,
              pressed && styles.followButtonPressed,
            ]}
            onPress={(event) => {
              event.stopPropagation();
              void handleFollow(item);
            }}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={item.isFollowing ? theme.COLORS.primary : theme.COLORS.white} />
            ) : (
              <Text style={[styles.followButtonText, item.isFollowing && styles.followButtonTextFollowing]}>
                {item.isFollowing ? "Following" : "Follow"}
              </Text>
            )}
          </Pressable>
        </Pressable>
      );
    },
    [busyFollowIds, handleFollow],
  );

  const renderSearchResults = () => {
    if (searchLoading) {
      return (
        <View style={styles.searchLoading}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
          <Text style={styles.searchLoadingText}>Finding your people…</Text>
        </View>
      );
    }

    if (searchResults.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={25} color={theme.COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>No creators found</Text>
          <Text style={styles.emptySubtitle}>Try a different name or username.</Text>
        </View>
      );
    }

    return (
      <FlatList
        style={styles.searchResultsList}
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderUserCard}
        contentContainerStyle={styles.searchResultsContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.resultsHeading}>
            <Text style={styles.sectionTitle}>People</Text>
            <Text style={styles.resultsCount}>{searchResults.length} found</Text>
          </View>
        }
      />
    );
  };

  const renderDiscovery = () => (
    <ScrollView
      style={styles.discoveryScroll}
      contentContainerStyle={styles.discoveryContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <LinearGradient
        colors={[theme.COLORS.primary, theme.COLORS.accentPurple, "#8B74E8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroOrbLarge} />
        <View style={styles.heroOrbSmall} />
        <View style={styles.heroTopRow}>
          <View style={styles.heroTag}>
            <Ionicons name="sparkles" size={13} color={theme.COLORS.white} />
            <Text style={styles.heroTagText}>A WORLD OF IDEAS</Text>
          </View>
          <Ionicons name="compass-outline" size={24} color="rgba(255,255,255,0.85)" />
        </View>
        <Text style={styles.heroTitle}>Find your next{`\n`}favorite thing.</Text>
        <Text style={styles.heroSubtitle}>
          Fresh voices, creative corners, and moments worth discovering.
        </Text>
        <View style={styles.heroFooter}>
          <View style={styles.heroFooterLine} />
          <Text style={styles.heroFooterText}>Made for curious minds</Text>
        </View>
      </LinearGradient>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Explore by interest</Text>
            <Text style={styles.sectionSubtitle}>A few places to start</Text>
          </View>
          <View style={styles.sectionAccent}>
            <Ionicons name="apps-outline" size={16} color={theme.COLORS.primary} />
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {CATEGORIES.map((category) => (
            <View key={category.id} style={styles.categoryCard}>
              <View style={[styles.categoryIcon, { backgroundColor: `${category.color}15` }]}>
                <Ionicons name={category.icon} size={20} color={category.color} />
              </View>
              <Text style={styles.categoryLabel} numberOfLines={1}>{category.label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.section, styles.trendingSection]}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Popular conversations</Text>
            <Text style={styles.sectionSubtitle}>Community picks this week</Text>
          </View>
          <View style={styles.trendingIcon}>
            <Ionicons name="trending-up" size={17} color={theme.COLORS.primary} />
          </View>
        </View>
        <View style={styles.topicList}>
          {TRENDING_TOPICS.map((topic) => (
            <View key={topic.id} style={styles.topicCard}>
              <View style={styles.topicRank}>
                <Text style={styles.topicRankText}>{topic.id}</Text>
              </View>
              <View style={styles.topicCopy}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Text style={styles.topicSubtitle}>{topic.subtitle}</Text>
              </View>
              <View style={styles.topicArrow}>
                <Ionicons name="sparkles-outline" size={16} color={theme.COLORS.primary} />
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>FIND YOUR PEOPLE</Text>
          <Text style={styles.headerTitle}>Explore</Text>
        </View>
        <View style={styles.headerMark}>
          <Ionicons name="compass" size={19} color={theme.COLORS.primary} />
        </View>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={19} color={theme.COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people"
            placeholderTextColor={theme.COLORS.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search people"
          />
          {searchQuery.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => handleSearchChange("")}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={19} color={theme.COLORS.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isSearching ? renderSearchResults() : renderDiscovery()}
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
  searchSection: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.lg,
  },
  searchBar: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: 17,
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
  discoveryScroll: {
    flex: 1,
  },
  discoveryContent: {
    paddingTop: theme.SPACING.xs,
  },
  heroCard: {
    minHeight: 226,
    marginHorizontal: theme.LAYOUT.contentPadding,
    padding: theme.SPACING.xl,
    borderRadius: 24,
    overflow: "hidden",
    ...theme.SHADOWS.primary,
  },
  heroOrbLarge: {
    position: "absolute",
    top: -44,
    right: -22,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroOrbSmall: {
    position: "absolute",
    right: 72,
    bottom: -44,
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: 5,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroTagText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 0.8,
  },
  heroTitle: {
    marginTop: theme.SPACING.lg,
    color: theme.COLORS.white,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    maxWidth: 280,
    marginTop: theme.SPACING.sm,
    color: "rgba(255,255,255,0.82)",
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: 18,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.lg,
  },
  heroFooterLine: {
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  heroFooterText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  section: {
    marginTop: theme.SPACING.xl,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    marginBottom: theme.SPACING.md,
  },
  sectionTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sectionSubtitle: {
    marginTop: 3,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  sectionAccent: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  categoryList: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    gap: theme.SPACING.sm,
  },
  categoryCard: {
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: 18,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    maxWidth: 94,
    marginTop: theme.SPACING.sm,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  trendingSection: {
    marginTop: theme.SPACING.xxl,
  },
  trendingIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  topicList: {
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  topicCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderRadius: 18,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  topicRank: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  topicRankText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  topicCopy: {
    flex: 1,
    minWidth: 0,
  },
  topicTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  topicSubtitle: {
    marginTop: 3,
    color: theme.COLORS.textMutedGray,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  topicArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgLight,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultsContent: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingBottom: 96,
  },
  resultsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.SPACING.sm,
    marginBottom: theme.SPACING.xs,
  },
  resultsCount: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  userCard: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACING.md,
    marginBottom: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderRadius: 18,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  userCardPressed: {
    opacity: theme.OPACITY.pressed,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
  },
  userAvatarWrap: {
    width: 50,
    height: 50,
    padding: 2,
    borderRadius: 25,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  userAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgInput,
  },
  userAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  userDetails: {
    flex: 1,
    minWidth: 0,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
  },
  userName: {
    flexShrink: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  userUsername: {
    marginTop: 2,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  userStats: {
    marginTop: 3,
    color: theme.COLORS.textMuted,
    fontSize: 9,
  },
  followButton: {
    minWidth: 84,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
  },
  followButtonFollowing: {
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  followButtonPressed: {
    opacity: theme.OPACITY.pressed,
  },
  followButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  followButtonTextFollowing: {
    color: theme.COLORS.primary,
  },
  searchLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.md,
  },
  searchLoadingText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.LAYOUT.contentPadding,
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
  },
  emptySubtitle: {
    marginTop: theme.SPACING.xs,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    textAlign: "center",
  },
  bottomSpace: {
    height: 32,
  },
});
