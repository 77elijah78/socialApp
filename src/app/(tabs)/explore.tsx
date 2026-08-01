import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, StyleSheet, Dimensions, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import PostCard from '@/components/feed/PostCard';
import { SocialPost } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP) / GRID_COLUMNS;

type ExploreTab = 'trending' | 'users' | 'posts';

interface TrendingTopic {
  id: string;
  tag: string;
  posts: number;
}

interface SuggestedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
}

const MOCK_TRENDING: TrendingTopic[] = [
  { id: '1', tag: '#Photography', posts: 12450 },
  { id: '2', tag: '#Tech', posts: 8900 },
  { id: '3', tag: '#Travel', posts: 7600 },
  { id: '4', tag: '#Food', posts: 5400 },
  { id: '5', tag: '#Art', posts: 3200 },
  { id: '6', tag: '#Music', posts: 2100 },
];

const MOCK_USERS: SuggestedUser[] = [
  { id: 'u1', username: 'sarah_designs', displayName: 'Sarah Chen', isVerified: true },
  { id: 'u2', username: 'tech_guru', displayName: 'Alex Rivera', isVerified: false },
  { id: 'u3', username: 'travel_bug', displayName: 'Emma Wilson', isVerified: true },
  { id: 'u4', username: 'foodie_life', displayName: 'James Miller', isVerified: false },
  { id: 'u5', username: 'art_daily', displayName: 'Olivia Brown', isVerified: true },
];

const MOCK_POSTS: SocialPost[] = [
  {
    id: 'p1',
    content: 'Beautiful sunset from my hike today!',
    imageUrls: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600'],
    videoUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
    updatedAt: new Date(Date.now() - 1000 * 60 * 30),
    author: {
      id: 'u1',
      username: 'sarah_designs',
      displayName: 'Sarah Chen',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
      isVerified: true,
    },
    _count: { likes: 245, comments: 18 },
    isLiked: false,
    isSaved: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600',
    tags: ['#Photography', '#Nature'],
    likeCount: 245,
    commentCount: 18,
    shareCount: 5,
    isBookmarked: false,
  },
  {
    id: 'p2',
    content: 'New workspace setup! Ready to build.',
    imageUrls: ['https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600'],
    videoUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    author: {
      id: 'u2',
      username: 'tech_guru',
      displayName: 'Alex Rivera',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
      isVerified: false,
    },
    _count: { likes: 128, comments: 32 },
    isLiked: true,
    isSaved: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600',
    tags: ['#Tech', '#Workspace'],
    likeCount: 128,
    commentCount: 32,
    shareCount: 8,
    isBookmarked: false,
  },
  {
    id: 'p3',
    content: 'Exploring the hidden gems of Tokyo',
    imageUrls: ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600'],
    videoUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    author: {
      id: 'u3',
      username: 'travel_bug',
      displayName: 'Emma Wilson',
      avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
      isVerified: true,
    },
    _count: { likes: 892, comments: 56 },
    isLiked: false,
    isSaved: true,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600',
    tags: ['#Travel', '#Tokyo'],
    likeCount: 892,
    commentCount: 56,
    shareCount: 23,
    isBookmarked: true,
  },
  {
    id: 'p4',
    content: 'Homemade pasta recipe that will blow your mind',
    imageUrls: ['https://images.unsplash.com/photo-1473093295043-ef0f3d38de7e?w=600'],
    videoUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 8),
    author: {
      id: 'u4',
      username: 'foodie_life',
      displayName: 'James Miller',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
      isVerified: false,
    },
    _count: { likes: 456, comments: 67 },
    isLiked: false,
    isSaved: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1473093295043-ef0f3d38de7e?w=600',
    tags: ['#Food', '#Recipe'],
    likeCount: 456,
    commentCount: 67,
    shareCount: 12,
    isBookmarked: false,
  },
];

const CATEGORIES = [
  { id: '1', label: 'Photography', icon: 'camera-outline', color: theme.COLORS.primary },
  { id: '2', label: 'Technology', icon: 'laptop-outline', color: theme.COLORS.accentBlue },
  { id: '3', label: 'Travel', icon: 'airplane-outline', color: theme.COLORS.secondary },
  { id: '4', label: 'Food', icon: 'restaurant-outline', color: theme.COLORS.accentPurple },
  { id: '5', label: 'Art', icon: 'brush-outline', color: theme.COLORS.indigo },
  { id: '6', label: 'Music', icon: 'musical-notes-outline', color: theme.COLORS.accentLightPurple },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export default function ExploreScreen() {
  const [activeTab, setActiveTab] = useState<ExploreTab>('trending');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return MOCK_POSTS;
    const q = searchQuery.toLowerCase();
    return MOCK_POSTS.filter(
      (post) =>
        post.content.toLowerCase().includes(q) ||
        post.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
        post.author.displayName?.toLowerCase().includes(q) ||
        post.author.username.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const renderSearchHeader = useCallback(() => {
    return (
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search posts, people, tags..."
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
  }, [searchQuery]);

  const renderTrending = useCallback(() => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trending Topics</Text>
        <View style={styles.trendingGrid}>
          {MOCK_TRENDING.map((topic, index) => (
            <Pressable key={topic.id} style={styles.trendingItem}>
              <View style={styles.trendingRank}>
                <Text style={styles.trendingRankText}>#{index + 1}</Text>
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
  }, []);

  const renderSuggestedUsers = useCallback(() => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suggested for You</Text>
        <View style={styles.usersList}>
          {MOCK_USERS.map((user) => (
            <Pressable key={user.id} style={styles.userCard}>
              <View style={styles.userInfo}>
                <View style={styles.userAvatar}>
                  {user.avatarUrl ? (
                    <Image source={{ uri: user.avatarUrl }} style={styles.userAvatarImage} />
                  ) : (
                    <View style={[styles.userAvatarPlaceholder, { backgroundColor: theme.COLORS.primaryGhost }]}>
                      <Text style={styles.userAvatarInitial}>
                        {user.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {user.isVerified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={theme.COLORS.primary} />
                    </View>
                  )}
                </View>
                <View style={styles.userDetails}>
                  <Text style={styles.userName}>{user.displayName}</Text>
                  <Text style={styles.userUsername}>@{user.username}</Text>
                </View>
              </View>
              <Pressable style={styles.followButton}>
                <Text style={styles.followButtonText}>Follow</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, []);

  const renderCategories = useCallback(() => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Browse Categories</Text>
        <View style={styles.categoriesGrid}>
          {CATEGORIES.map((cat) => (
            <Pressable key={cat.id} style={styles.categoryCard}>
              <View style={[styles.categoryIcon, { backgroundColor: cat.color + '15' }]}>
                <Ionicons name={cat.icon as any} size={24} color={cat.color} />
              </View>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, []);

  const renderPostsGrid = useCallback(() => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular Posts</Text>
        <View style={styles.postsGrid}>
          {filteredPosts.map((post) => (
            <View key={post.id} style={styles.postCardWrapper}>
              <PostCard
                post={post}
                onLike={(postId, liked) => {}}
                onBookmark={(postId, bookmarked) => {}}
              />
            </View>
          ))}
        </View>
        {filteredPosts.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={theme.COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>Try a different search term</Text>
          </View>
        )}
      </View>
    );
  }, [filteredPosts]);

  const renderContent = useCallback(() => {
    switch (activeTab) {
      case 'trending':
        return (
          <View>
            {renderTrending()}
            {renderSuggestedUsers()}
            {renderCategories()}
          </View>
        );
      case 'users':
        return <View>{renderSuggestedUsers()}</View>;
      case 'posts':
        return <View>{renderPostsGrid()}</View>;
      default:
        return null;
    }
  }, [activeTab, renderTrending, renderSuggestedUsers, renderCategories, renderPostsGrid]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
        <Pressable style={styles.headerIconBtn}>
          <Ionicons name="settings-outline" size={22} color={theme.COLORS.textPrimary} />
        </Pressable>
      </View>

      {/* Search Bar */}
      {renderSearchHeader()}

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        {(['trending', 'users', 'posts'] as ExploreTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {activeTab === tab && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <FlatList
        style={styles.list}
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={renderContent}
        contentContainerStyle={styles.listContent}
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
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgLight,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.xs,
    paddingVertical: theme.SPACING.md,
    marginRight: theme.SPACING.xxl,
    position: 'relative',
  },
  tabActive: {
    // active state container
  },
  tabText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: theme.COLORS.textMuted,
  },
  tabTextActive: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.COLORS.primary,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
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
    ...theme.SHADOWS.sm,
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
  followButton: {
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  followButtonText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textWhite,
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
  postsGrid: {
    gap: GRID_GAP,
  },
  postCardWrapper: {
    width: GRID_ITEM_SIZE,
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
