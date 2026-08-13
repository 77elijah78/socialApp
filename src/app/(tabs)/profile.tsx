import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { router } from 'expo-router';
import { logout } from '@/store/slices/authSlice';
import { authService } from '@/services/AuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { PostResponse, SocialPost } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

type ProfileTab = 'views' | 'likes';

interface MenuItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
}

export default function ProfileScreen() {
  const user = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.token);
  const dispatch = useAppDispatch();

  const [activeTab, setActiveTab] = useState<ProfileTab>('views');
  const [profileData, setProfileData] = useState<any>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const displayName = user?.displayName || user?.username || 'User';
  const username = user?.username ? `@${user.username}` : '';
  const avatarUrl = user?.avatarUrl || null;
  const currentUsername = user?.username ?? '';

  const fetchProfile = useCallback(async () => {
    if (!token || !currentUsername) return;
    try {
      const resp = await api.get<{ success: boolean; data: any }>(
        `/users/${currentUsername}`,
        token,
      );
      setProfileData(resp.data);
    } catch (err) {
      console.warn('Failed to load profile stats:', err);
    }
  }, [token, currentUsername]);

  const fetchPosts = useCallback(async () => {
    if (!token || !currentUsername) return;
    try {
      const resp = await api.get<{
        success: boolean;
        data: { user: any; posts: PostResponse[]; total: number };
      }>(`/posts/user/${currentUsername}?page=1&limit=50`, token);
      const mapped = (resp.data.posts ?? []).map(mapPostResponse);
      setPosts(mapped);
    } catch (err) {
      console.warn('Failed to load posts:', err);
    }
  }, [token, currentUsername]);

  const fetchLikedPosts = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await api.get<{
        success: boolean;
        data: { posts: PostResponse[]; total: number };
      }>('/posts/liked?page=1&limit=50', token);
      const mapped = (resp.data.posts ?? []).map(mapPostResponse);
      setLikedPosts(mapped);
    } catch (err) {
      console.warn('Failed to load liked posts:', err);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      await Promise.all([fetchProfile(), fetchPosts(), fetchLikedPosts()]);
      if (!cancelled) setLoading(false);
    }
    loadAll();
    return () => { cancelled = true; };
  }, [fetchProfile, fetchPosts, fetchLikedPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProfile(), fetchPosts(), fetchLikedPosts()]);
    setRefreshing(false);
  }, [fetchProfile, fetchPosts, fetchLikedPosts]);

  const currentData = activeTab === 'views' ? posts : likedPosts;

  const menuItems = [
    {
      id: 'edit',
      label: 'Edit Profile',
      icon: 'create-outline' as const,
      onPress: () => router.push('/editProfile'),
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: 'bookmark-outline' as const,
      onPress: () => router.push('/bookmarks'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings-outline' as const,
      onPress: () => router.push('/settings'),
    },
    {
      id: 'logout',
      label: 'Log Out',
      icon: 'log-out-outline' as const,
      onPress: () =>
        Alert.alert('Log Out', 'Are you sure you want to log out?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: async () => {
              try {
                await authService.logout();
              } catch (err) {
                console.warn('Logout error:', err);
              } finally {
                dispatch(logout());
                await AsyncStorage.removeItem('refreshToken');
                router.replace('/(auth)/login');
              }
            },
          },
        ]),
      danger: true,
    },
  ];

  const renderHeader = useCallback(() => {
    const stats = profileData?._count ?? { posts: 0, followers: 0, following: 0 };
    return (
      <View>
        <View style={styles.coverContainer}>
          <View style={styles.coverPlaceholder}>
            <Ionicons name="images-outline" size={40} color={theme.COLORS.textMuted} />
          </View>
        </View>

        <View style={styles.avatarContainer}>
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{displayName}</Text>
          </View>
          {username ? <Text style={styles.username}>{username}</Text> : null}

          <View style={styles.statsRow}>
            <Pressable style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(stats.posts ?? 0)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(stats.followers ?? 0)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(stats.following ?? 0)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/editProfile')}>
              <Text style={styles.primaryButtonText}>Edit Profile</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton}>
              <Ionicons name="share-outline" size={20} color={theme.COLORS.textPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.tabBar}>
          {(['views', 'likes'] as ProfileTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'views' ? 'eye-outline' : 'heart-outline'}
                size={22}
                color={activeTab === tab ? theme.COLORS.primary : theme.COLORS.textMuted}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab && styles.tabLabelActive,
                ]}
              >
                {tab === 'views' ? 'Views' : 'Likes'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [displayName, username, avatarUrl, profileData, activeTab]);

  const renderGridItem = useCallback(({ item }: { item: SocialPost }) => {
    const imageUrl = item.imageUrl ?? item.imageUrls?.[0] ?? '';
    return (
      <Pressable
        style={styles.gridItem}
        onPress={() => router.push(`/posts/${item.id}/comments`)}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Ionicons name="image-outline" size={24} color={theme.COLORS.textMuted} />
          </View>
        )}
        <View style={styles.gridOverlay}>
          <View style={styles.gridStat}>
            <Ionicons
              name={activeTab === 'likes' ? 'heart' : 'eye'}
              size={12}
              color={theme.COLORS.white}
            />
            <Text style={styles.gridStatText}>
              {activeTab === 'likes' ? item.likeCount ?? 0 : item.commentCount ?? 0}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }, [activeTab]);

  const renderMenuList = useCallback(() => {
    return (
      <View style={styles.menuSection}>
        <Text style={styles.menuTitle}>Account</Text>
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.id}
              style={[
                styles.menuItem,
                index !== menuItems.length - 1 && styles.menuItemBorder,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <View
                  style={[
                    styles.menuIconContainer,
                    item.danger && styles.menuIconDanger,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={
                      item.danger
                        ? theme.COLORS.danger
                        : theme.COLORS.textSecondary
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.menuLabel,
                    item.danger && styles.menuLabelDanger,
                  ]}
                >
                  {item.label}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.COLORS.textMuted}
              />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [menuItems]);

  const renderEmptyState = useCallback(() => {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name={activeTab === 'likes' ? 'heart-outline' : 'eye-outline'}
          size={48}
          color={theme.COLORS.textMuted}
        />
        <Text style={styles.emptyTitle}>No {activeTab === 'likes' ? 'likes' : 'posts'} yet</Text>
        <Text style={styles.emptySubtitle}>
          {activeTab === 'likes'
            ? 'Posts you like will show up here'
            : 'Share your first post to see it here'}
        </Text>
      </View>
    );
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable style={styles.headerIconBtn} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color={theme.COLORS.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={currentData}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={
            <View style={styles.footer}>
              {renderMenuList()}
              <View style={{ height: theme.SPACING.xxxxl }} />
            </View>
          }
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
  list: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: theme.SPACING.xxxxxl,
  },
  coverContainer: {
    width: '100%',
    height: 120,
    backgroundColor: theme.COLORS.bgInput,
    position: 'relative',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgChat,
  },
  coverEditBtn: {
    position: 'absolute',
    bottom: theme.SPACING.sm,
    right: theme.SPACING.md,
    width: 32,
    height: 32,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.SHADOWS.sm,
  },
  avatarContainer: {
    marginTop: -theme.SIZING.avatarXl / 2,
    alignSelf: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: theme.SIZING.avatarXl,
    height: theme.SIZING.avatarXl,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.bgWhite,
  },
  avatarPlaceholder: {
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.primary,
  },
  avatarEditBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.COLORS.bgWhite,
  },
  infoSection: {
    alignItems: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.xs,
  },
  displayName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
  },
  verifiedBadge: {
    marginLeft: theme.SPACING.xs,
  },
  username: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
  },
  bio: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.sm,
    textAlign: 'center',
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
  },
  statLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
  },
  statDivider: {
    width: theme.BORDER.width.xs,
    height: 32,
    backgroundColor: theme.COLORS.borderDivider,
    marginHorizontal: theme.SPACING.lg,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.md,
    marginTop: theme.SPACING.md,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    height: theme.SIZING.buttonHeight,
    borderRadius: theme.BORDER_RADIUS.lg,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.SHADOWS.primary,
  },
  primaryButtonText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textOnPrimary,
  },
  secondaryButton: {
    width: theme.SIZING.buttonHeight,
    height: theme.SIZING.buttonHeight,
    borderRadius: theme.BORDER_RADIUS.lg,
    backgroundColor: theme.COLORS.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: theme.SPACING.lg,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.SPACING.xs,
    paddingVertical: theme.SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.COLORS.primary,
  },
  tabLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: theme.COLORS.textMuted,
    textTransform: 'capitalize',
  },
  tabLabelActive: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  gridRow: {
    gap: GRID_GAP,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    borderRadius: theme.BORDER_RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: theme.COLORS.bgInput,
  },
  gridPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgChat,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  gridStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  gridStatText: {
    color: theme.COLORS.white,
    fontSize: 10,
    fontWeight: '600',
  },
  footer: {
    marginTop: theme.SPACING.xxxxl,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },
  menuSection: {
    marginBottom: theme.SPACING.xxxxl,
  },
  menuTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.sm,
    marginBottom: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.xs,
  },
  menuCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    ...theme.SHADOWS.sm,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  menuItemBorder: {
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.md,
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconDanger: {
    backgroundColor: theme.COLORS.dangerLight,
  },
  menuLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textPrimary,
  },
  menuLabelDanger: {
    color: theme.COLORS.danger,
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

function mapPostResponse(post: PostResponse): SocialPost {
  const firstImageUrl = post.imageUrls?.[0] ?? '';
  const likeCount = post._count?.likes ?? 0;
  const commentCount = post._count?.comments ?? 0;
  return {
    ...post,
    timestamp: new Date(post.createdAt).toISOString(),
    imageUrl: firstImageUrl,
    tags: [],
    likeCount,
    commentCount,
    shareCount: 0,
    isLiked: post.isLiked ?? false,
    isBookmarked: post.isSaved ?? false,
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
