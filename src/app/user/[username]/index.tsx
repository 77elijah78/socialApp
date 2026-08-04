import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { api } from '@/services/api';
import { useAppSelector } from '@/store/hooks';
import theme from '@/constants/theme';
import { PostResponse, SocialPost, Conversation } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE =
  (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
  GRID_COLUMNS;

interface SearchedUserProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  _count: { followers: number; following: number; posts: number };
  isFollowing: boolean;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

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

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);

  const [profile, setProfile] = useState<SearchedUserProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
   const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'likes'>('posts');
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    if (!username) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const resp = await api.get<{
          success: boolean;
          data: SearchedUserProfile;
        }>(`/users/${username}`, token ?? undefined);
        setProfile(resp.data);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username, token]);

  useEffect(() => {
    if (!username) return;

    const fetchPosts = async () => {
      setLoadingPosts(true);
      try {
        const resp = await api.get<{
          success: boolean;
          data: {
            user: SearchedUserProfile;
            posts: PostResponse[];
            total: number;
          };
        }>(`/posts/user/${username}?page=1&limit=50`, token ?? undefined);
        setProfile((prev) =>
          prev ? { ...prev, ...resp.data.user } : resp.data.user,
        );
        const mapped = (resp.data.posts ?? []).map(mapPostResponse);
        setPosts(mapped);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load posts');
      } finally {
        setLoadingPosts(false);
      }
    };

    fetchPosts();
  }, [username, token]);

  const handleFollow = async () => {
    if (!token || !profile) return;
    try {
      if (profile.isFollowing) {
        await api.delete(`/users/${profile.username}/follow`, token);
      } else {
        await api.post(`/users/${profile.username}/follow`, {}, token);
      }
      setProfile((prev) =>
        prev ? { ...prev, isFollowing: !prev.isFollowing } : prev,
      );
    } catch {
      /* ignore */
    }
  };

  const handleMessagePress = useCallback(async () => {
    if (!token || !profile || messaging) return;
    setMessaging(true);
    try {
      const resp = await api.post<{ success: boolean; data: Conversation }>(
        '/messages/conversations',
        { userId: profile.id },
        token,
      );
      const conv = resp.data;
      router.push({
        pathname: '/(chatRoom)/privateRoom',
        params: {
          conversationId: conv.id,
          roomId: conv.id,
          receiverName: profile.displayName ?? profile.username,
          receiverAvatar: profile.avatarUrl ?? '',
          receiverId: profile.id,
        },
      });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to start conversation');
    } finally {
      setMessaging(false);
    }
  }, [token, profile, messaging]);

  const renderGridItem = ({ item }: { item: SocialPost }) => {
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
            <Ionicons name="heart" size={12} color={theme.COLORS.white} />
            <Text style={styles.gridStatText}>{item.likeCount ?? 0}</Text>
          </View>
          <View style={styles.gridStat}>
            <Ionicons name="eye" size={12} color={theme.COLORS.white} />
            <Text style={styles.gridStatText}>{item.commentCount ?? 0}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const isOwnProfile = profile?.id === currentUserId;

  const renderHeader = () => {
    if (loading) {
      return (
        <View style={styles.profileLoading}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
        </View>
      );
    }

    if (!profile) return null;

    return (
      <View>
        {/* Cover Image */}
        <View style={styles.coverContainer}>
          <View style={styles.coverPlaceholder}>
            <Ionicons name="images-outline" size={40} color={theme.COLORS.textMuted} />
          </View>
        </View>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={[styles.avatarWrapper, { borderColor: theme.COLORS.borderGray }]}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(profile.displayName?.charAt(0) ?? profile.username.charAt(0)).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* User Info */}
        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>
              {profile.displayName ?? profile.username}
            </Text>
            {profile.isVerified && (
              <Ionicons name="checkmark-circle" size={18} color={theme.COLORS.primary} />
            )}
          </View>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(profile._count.posts)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <Pressable
              style={styles.statItem}
              onPress={() =>
                router.push({ pathname: `/users/${profile.username}/followers` as never })
              }
            >
              <Text style={styles.statValue}>{formatCount(profile._count.followers)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable
              style={styles.statItem}
              onPress={() =>
                router.push({ pathname: `/users/${profile.username}/following` as never })
              }
            >
              <Text style={styles.statValue}>{formatCount(profile._count.following)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </Pressable>
          </View>

          {isOwnProfile ? (
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Edit Profile</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    styles.followButton,
                    profile.isFollowing && styles.secondaryButton,
                  ]}
                  onPress={handleFollow}
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      styles.followButtonText,
                      profile.isFollowing && styles.secondaryButtonText,
                    ]}
                  >
                    {profile.isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, styles.messageButton]}
                  onPress={handleMessagePress}
                  disabled={messaging}
                >
                  {messaging ? (
                    <ActivityIndicator size="small" color={theme.COLORS.white} />
                  ) : (
                    <Ionicons name="mail-outline" size={20} color={theme.COLORS.textOnPrimary} />
                  )}
                  <Text style={[styles.primaryButtonText, styles.messageButtonText]}>
                    Message
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['posts', 'likes'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'posts' ? 'grid-outline' : 'heart-outline'}
                size={22}
                color={activeTab === tab ? theme.COLORS.primary : theme.COLORS.textMuted}
              />
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name={activeTab === 'likes' ? 'heart-outline' : 'images-outline'}
        size={48}
        color={theme.COLORS.textMuted}
      />
      <Text style={styles.emptyTitle}>No {activeTab} yet</Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'posts'
          ? 'Share your first post to see it here'
          : 'Posts you like will show up here'}
      </Text>
    </View>
  );

  if (error && !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: theme.COLORS.primary }}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        style={styles.list}
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loadingPosts ? renderEmpty : null}
        renderItem={renderGridItem}
        contentContainerStyle={styles.listContent}
      />

      {loadingPosts && (
        <View style={styles.postsLoading}>
          <ActivityIndicator size="small" color={theme.COLORS.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: theme.SPACING.xxxxxl,
  },
  profileLoading: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
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
  avatarContainer: {
    marginTop: -theme.SIZING.avatarXl / 2,
    alignSelf: 'center',
  },
  avatarWrapper: {
    width: theme.SIZING.avatarXl,
    height: theme.SIZING.avatarXl,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: 4,
    backgroundColor: theme.COLORS.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: theme.SIZING.avatarXl - 4,
    height: theme.SIZING.avatarXl - 4,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  avatarPlaceholder: {
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarInitial: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.primary,
  },
  infoSection: {
    alignItems: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.xs,
  },
  displayName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
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
  primaryButton: {
    flex: 1,
    height: theme.SIZING.buttonHeight,
    borderRadius: theme.BORDER_RADIUS.lg,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.SPACING.md,
    ...theme.SHADOWS.primary,
  },
  secondaryButton: {
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  primaryButtonText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textOnPrimary,
  },
  secondaryButtonText: {
    color: theme.COLORS.textPrimary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: theme.SPACING.md,
    width: '100%',
  },
  followButton: {
    flex: 1,
  },
  followButtonText: {
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.SPACING.xs,
  },
  messageButtonText: {
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.SPACING.md,
    gap: theme.SPACING.xl,
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  tab: {
    paddingVertical: theme.SPACING.md,
  },
  tabActive: {
    borderBottomColor: theme.COLORS.primary,
    borderBottomWidth: 2,
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
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgChat,
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
  postsLoading: {
    paddingVertical: theme.SPACING.md,
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  errorText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.danger,
    marginBottom: theme.SPACING.md,
  },
});
