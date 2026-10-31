import { usePosts } from '@/hooks/usePosts';
import { authorFeedParams } from '@/utils/postContracts';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { api } from '@/services/api';
import { mediaService } from '@/services/MediaService';
import { messageStore } from '@/db/MessageStore';
import { setRecentMessageCache } from '@/utils/recentMessageCache';
import { useAppSelector } from '@/store/hooks';
import * as theme from '@/constants/theme';
import { SocialPost, Conversation } from '@/types';
import {
  ProfileGridItemSkeleton,
  ProfileSkeleton,
  OfflineBanner,
} from '@/components/ui';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { setCached } from '@/utils/queryCache';

const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 3;
const GRID_SKELETON_DATA = Array.from(
  { length: 9 },
  (_, index) => `grid-skeleton-${index}`,
);

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
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const { isOffline } = useNetworkStatus();

  const [profile, setProfile] = useState<SearchedUserProfile | null>(null);
  const {
    posts,
    loading: loadingPosts,
    loadMore,
    hasMore,
    paginating,
    error: postsError,
    paginationError,
    refresh: refreshPosts,
  } = usePosts({ source: 'author', username });
  const { width: screenWidth } = useWindowDimensions();
  const gridItemSize =
    (screenWidth - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP * 2) / 3;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'posts'>('posts');
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
        setCached(`profile:${username}`, resp.data, 5 * 60_000);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
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
      if (currentUserId) {
        void mediaService.message
          .syncLatest(conv.id, currentUserId)
          .catch(() => {});
      }
      try {
        const latest = await messageStore.getRecent(conv.id, 30);
        setRecentMessageCache(conv.id, latest);
      } catch {
        // Continue opening; the room can load its local/server messages itself.
      }
      router.push({
        pathname: '/(chatRoom)/privateRoom',
        params: {
          conversationId: conv.id,
          roomId: conv.id,
          receiverName: profile.displayName ?? profile.username,
          receiverUsername: profile.username,
          receiverAvatar: profile.avatarUrl ?? '',
          receiverId: profile.id,
        },
      });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to start conversation');
    } finally {
      setMessaging(false);
    }
  }, [token, profile, messaging, currentUserId]);

  const renderGridItem = ({
    item,
    index,
  }: {
    item: SocialPost;
    index: number;
  }) => {
    const imageUrl = item.imageUrl ?? item.imageUrls?.[0] ?? '';
    return (
      <Pressable
        style={[styles.gridItem, { width: gridItemSize, height: gridItemSize }]}
        onPress={() => router.push(authorFeedParams(username, item.id, index))}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Ionicons
              name="image-outline"
              size={24}
              color={theme.COLORS.textMuted}
            />
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

  const showGridSkeletons = loadingPosts && posts.length === 0;
  const listData: SocialPost[] = showGridSkeletons
    ? (GRID_SKELETON_DATA as unknown as SocialPost[])
    : posts;

  const renderHeader = () => {
    if (loading) {
      return <ProfileSkeleton />;
    }

    if (!profile) return null;

    return (
      <View style={styles.profileHeaderCard}>
        <LinearGradient
          colors={[theme.COLORS.primary, theme.COLORS.accentPurple, '#8B74E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coverContainer}
        >
          <View style={styles.coverOrbLarge} />
          <View style={styles.coverOrbSmall} />
          <View style={styles.coverLabel}>
            <Ionicons name="sparkles" size={13} color={theme.COLORS.white} />
            <Text style={styles.coverLabelText}>COMMUNITY PROFILE</Text>
          </View>
          <Ionicons
            name="aperture-outline"
            size={25}
            color="rgba(255,255,255,0.8)"
          />
        </LinearGradient>

        <View style={styles.profileContent}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <View
              style={[
                styles.avatarWrapper,
                { borderColor: theme.COLORS.bgWhite },
              ]}
            >
              {profile.avatarUrl ? (
                <Image
                  source={{ uri: profile.avatarUrl }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>
                    {(
                      profile.displayName?.charAt(0) ??
                      profile.username.charAt(0)
                    ).toUpperCase()}
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
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={theme.COLORS.primary}
                />
              )}
            </View>
            <Text style={styles.username}>@{profile.username}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {formatCount(profile._count.posts)}
                </Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
              <View style={styles.statDivider} />
              <Pressable
                style={styles.statItem}
                onPress={() =>
                  router.push({
                    pathname: `/users/${profile.username}/followers` as never,
                  })
                }
              >
                <Text style={styles.statValue}>
                  {formatCount(profile._count.followers)}
                </Text>
                <Text style={styles.statLabel}>Followers</Text>
              </Pressable>
              <View style={styles.statDivider} />
              <Pressable
                style={styles.statItem}
                onPress={() =>
                  router.push({
                    pathname: `/users/${profile.username}/following` as never,
                  })
                }
              >
                <Text style={styles.statValue}>
                  {formatCount(profile._count.following)}
                </Text>
                <Text style={styles.statLabel}>Following</Text>
              </Pressable>
            </View>

            {isOwnProfile ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/editProfile')}
                style={styles.primaryButton}
              >
                <Ionicons
                  name="create-outline"
                  size={17}
                  color={theme.COLORS.textOnPrimary}
                />
                <Text style={styles.primaryButtonText}>Edit profile</Text>
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
                      <ActivityIndicator
                        size="small"
                        color={theme.COLORS.white}
                      />
                    ) : (
                      <Ionicons
                        name="mail-outline"
                        size={20}
                        color={theme.COLORS.textOnPrimary}
                      />
                    )}
                    <Text
                      style={[
                        styles.primaryButtonText,
                        styles.messageButtonText,
                      ]}
                    >
                      Message
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          {/* Tabs */}
          <View style={styles.tabBar}>
            <Pressable
              style={[styles.tab, activeTab === 'posts' && styles.tabActive]}
              onPress={() => setActiveTab('posts')}
            >
              <Ionicons
                name="grid-outline"
                size={22}
                color={
                  activeTab === 'posts'
                    ? theme.COLORS.primary
                    : theme.COLORS.textMuted
                }
              />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="images-outline"
        size={48}
        color={theme.COLORS.textMuted}
      />
      <Text style={styles.emptyTitle}>No posts yet</Text>
      <Text style={styles.emptySubtitle}>
        Share your first post to see it here
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
      <OfflineBanner isOffline={isOffline} />

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={theme.COLORS.textPrimary}
          />
        </Pressable>
        <View style={styles.topBarCopy}>
          <Text style={styles.topBarEyebrow}>COMMUNITY PROFILE</Text>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {username ? `@${username}` : 'Profile'}
          </Text>
        </View>
        <View style={styles.topBarMark}>
          <Ionicons name="sparkles" size={17} color={theme.COLORS.primary} />
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={listData}
        onEndReached={() => {
          if (hasMore) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          <View>
            {paginating ? (
              <ActivityIndicator color={theme.COLORS.primary} />
            ) : null}
            {postsError || paginationError ? (
              <Pressable
                onPress={() => void (postsError ? refreshPosts() : loadMore())}
              >
                <Text style={styles.errorText}>
                  {(postsError || paginationError)?.message} · Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        keyExtractor={(item, index) =>
          showGridSkeletons
            ? `grid-skeleton-${index}`
            : String((item as SocialPost).id)
        }
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loadingPosts ? renderEmpty : null}
        renderItem={
          showGridSkeletons ? () => <ProfileGridItemSkeleton /> : renderGridItem
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgMain,
  },
  topBar: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    gap: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgMain,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  topBarCopy: {
    flex: 1,
    minWidth: 0,
  },
  topBarEyebrow: {
    color: theme.COLORS.primary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1,
  },
  topBarTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    marginTop: 2,
  },
  topBarMark: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: theme.SPACING.xxxxxl,
  },
  profileHeaderCard: {
    marginHorizontal: theme.LAYOUT.contentPadding,
    marginTop: theme.SPACING.sm,
    marginBottom: theme.SPACING.lg,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
    overflow: 'hidden',
    ...theme.SHADOWS.sm,
  },
  profileContent: {
    paddingBottom: theme.SPACING.xs,
  },
  coverContainer: {
    width: '100%',
    height: 134,
    paddingHorizontal: theme.SPACING.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: theme.SPACING.lg,
    overflow: 'hidden',
  },
  coverOrbLarge: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.09)',
    right: -45,
    top: -82,
  },
  coverOrbSmall: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 51,
    backgroundColor: 'rgba(255,255,255,0.09)',
    right: 78,
    bottom: -60,
  },
  coverLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: theme.BORDER_RADIUS.full,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
  },
  coverLabelText: {
    color: theme.COLORS.white,
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  avatarContainer: {
    marginTop: -47,
    alignSelf: 'center',
    marginBottom: theme.SPACING.xs,
  },
  avatarWrapper: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 4,
    backgroundColor: theme.COLORS.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...theme.SHADOWS.md,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
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
    paddingTop: theme.SPACING.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.SPACING.xs,
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
