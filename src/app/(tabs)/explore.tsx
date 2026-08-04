import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, StyleSheet, Dimensions, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import PostCard from '@/components/feed/PostCard';
import { SocialPost } from '@/types';
import { api } from '@/services/api';
import { useAppSelector } from '@/store/hooks';
import { router } from 'expo-router';
import { useDebounce } from '@/hooks/useDebounce';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP) / GRID_COLUMNS;

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
  { id: '1', label: 'Photography', icon: 'camera-outline' as keyof typeof Ionicons.glyphMap, color: theme.COLORS.primary },
  { id: '2', label: 'Technology', icon: 'laptop-outline' as keyof typeof Ionicons.glyphMap, color: theme.COLORS.accentBlue },
  { id: '3', label: 'Travel', icon: 'airplane-outline' as keyof typeof Ionicons.glyphMap, color: theme.COLORS.secondary },
  { id: '4', label: 'Food', icon: 'restaurant-outline' as keyof typeof Ionicons.glyphMap, color: theme.COLORS.accentPurple },
  { id: '5', label: 'Art', icon: 'brush-outline' as keyof typeof Ionicons.glyphMap, color: theme.COLORS.indigo },
  { id: '6', label: 'Music', icon: 'musical-notes-outline' as keyof typeof Ionicons.glyphMap, color: theme.COLORS.accentLightPurple },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export default function ExploreScreen() {
  const token = useAppSelector((s) => s.auth.token);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  const isSearching = debouncedQuery.length > 0;

  useEffect(() => {
    if (!isSearching) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);

    api
      .get<{ success: boolean; data: SearchedUser[] }>(`/users/search?q=${encodeURIComponent(debouncedQuery)}`, token ?? undefined)
      .then((resp) => {
        if (!controller.signal.aborted) {
          setSearchResults(resp.data ?? []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSearchResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, token]);

  const renderUserCard = ({ item }: { item: SearchedUser }) => (
    <Pressable
      style={styles.userCard}
      onPress={() => router.push(`/user/${item.username}`)}
    >
      <View style={styles.userInfo}>
        <View style={styles.userAvatar}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.userAvatarImage} />
          ) : (
            <View style={[styles.userAvatarPlaceholder, { backgroundColor: theme.COLORS.primaryGhost }]}>
              <Text style={styles.userAvatarInitial}>
                {(item.displayName?.charAt(0) ?? item.username.charAt(0)).toUpperCase()}
              </Text>
            </View>
          )}
          {item.isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={theme.COLORS.primary} />
            </View>
          )}
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.displayName ?? item.username}</Text>
          <Text style={styles.userUsername}>@{item.username}</Text>
          <Text style={styles.userStats}>
            {formatCount(item._count.posts)} posts · {formatCount(item._count.followers)} followers
          </Text>
        </View>
      </View>
      <Pressable
        style={[
          styles.followButton,
          item.isFollowing && styles.followButtonUnfollow,
        ]}
        onPress={async (e) => {
          e.stopPropagation();
          try {
            if (item.isFollowing) {
              await api.delete(`/users/${item.username}/follow`, token ?? undefined);
            } else {
              await api.post(`/users/${item.username}/follow`, {}, token ?? undefined);
            }
            setSearchResults((prev) =>
              prev.map((u) =>
                u.id === item.id ? { ...u, isFollowing: !u.isFollowing } : u,
              ),
            );
          } catch {
            /* ignore follow errors in search */
          }
        }}
      >
        <Text style={[
          styles.followButtonText,
          item.isFollowing && styles.followButtonTextUnfollow,
        ]}>
          {item.isFollowing ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
    </Pressable>
  );

  const renderSearchHeader = () => (
    <View style={styles.searchSection}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={theme.COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor={theme.COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={theme.COLORS.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderTrending = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Trending Topics</Text>
      <View style={styles.trendingGrid}>
        {[
          { id: '1', tag: '#Photography', posts: 12450 },
          { id: '2', tag: '#Tech', posts: 8900 },
          { id: '3', tag: '#Travel', posts: 7600 },
          { id: '4', tag: '#Food', posts: 5400 },
          { id: '5', tag: '#Art', posts: 3200 },
          { id: '6', tag: '#Music', posts: 2100 },
        ].map((topic) => (
          <Pressable key={topic.id} style={styles.trendingItem}>
            <View style={styles.trendingRank}>
              <Text style={styles.trendingRankText}>#{topic.id}</Text>
            </View>
            <View style={styles.trendingContent}>
              <Text style={styles.trendingTag}>{topic.tag}</Text>
              <Text style={styles.trendingPosts}>{formatCount(topic.posts)} posts</Text>
            </View>
            <Ionicons name="trending-up" size={18} color={theme.COLORS.primary} />
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderCategories = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Browse Categories</Text>
      <View style={styles.categoriesGrid}>
        {CATEGORIES.map((cat) => (
          <Pressable key={cat.id} style={styles.categoryCard}>
            <View style={[styles.categoryIcon, { backgroundColor: cat.color + '15' }]}>
              <Ionicons name={cat.icon} size={24} color={cat.color} />
            </View>
            <Text style={styles.categoryLabel}>{cat.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
        <Pressable style={styles.headerIconBtn}>
          <Ionicons name="settings-outline" size={22} color={theme.COLORS.textPrimary} />
        </Pressable>
      </View>

      {renderSearchHeader()}

      {isSearching ? (
        searchLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.COLORS.primary} />
          </View>
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderUserCard}
            contentContainerStyle={{ paddingHorizontal: theme.LAYOUT.contentPadding }}
          />
        ) : (
          <View style={[styles.emptyState, { marginTop: theme.SPACING.xxl }]}>
            <Ionicons name="search-outline" size={48} color={theme.COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptySubtitle}>Try a different search term</Text>
          </View>
        )
      ) : (
        <FlatList
          style={styles.list}
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <View>
              {renderTrending()}
              {renderCategories()}
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  searchSection: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgLight,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textPrimary,
    padding: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: theme.SPACING.xxxxxl,
  },
  section: {
    marginTop: theme.SPACING.lg,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  sectionTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
    marginBottom: theme.SPACING.md,
  },
  trendingGrid: {
    gap: theme.SPACING.sm,
  },
  trendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.md,
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
    ...theme.SHADOWS.sm,
  },
  trendingRank: {
    width: 32,
    height: 32,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingRankText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.primary,
  },
  trendingContent: {
    flex: 1,
  },
  trendingTag: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  trendingPosts: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
  },
  usersList: {
    gap: theme.SPACING.sm,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.md,
    flex: 1,
  },
  userAvatar: {
    position: 'relative',
  },
  userAvatarImage: {
    width: theme.SIZING.avatarMd,
    height: theme.SIZING.avatarMd,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  userAvatarPlaceholder: {
    width: theme.SIZING.avatarMd,
    height: theme.SIZING.avatarMd,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.primary,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  userUsername: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
  },
  userStats: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    color: theme.COLORS.textMuted,
    marginTop: theme.SPACING.xs,
  },
  followButton: {
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  followButtonUnfollow: {
    backgroundColor: theme.COLORS.bgLight,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  followButtonText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textWhite,
  },
  followButtonTextUnfollow: {
    color: theme.COLORS.textPrimary,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.SPACING.sm,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP) / 3 - theme.SPACING.sm,
    aspectRatio: 1,
    borderRadius: theme.BORDER_RADIUS.lg,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.SPACING.sm,
    ...theme.SHADOWS.sm,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: theme.COLORS.textPrimary,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.SPACING.xxxxxl * 2,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  emptyTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
    marginTop: theme.SPACING.md,
  },
  emptySubtitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
    textAlign: 'center',
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
});
