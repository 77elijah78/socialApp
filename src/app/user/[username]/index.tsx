import { usePosts } from '@/hooks/usePosts';
import { authorFeedParams } from '@/utils/postContracts';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { api } from '@/services/api';
import { mediaService } from '@/services/MediaService';
import { messageStore } from '@/db/MessageStore';
import { setRecentMessageCache } from '@/utils/recentMessageCache';
import { useAppSelector } from '@/store/hooks';
import { FEED } from '@/constants/feedTheme';
import * as theme from '@/constants/theme';
import { SocialPost, Conversation } from '@/types';
import {
  ProfileGridItemSkeleton,
  ProfileSkeleton,
  OfflineBanner,
} from '@/components/ui';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { setCached } from '@/utils/queryCache';
import { normalizeMediaUrl } from '@/utils/mediaUrls';
import {
  filterProfilePosts,
  ProfileActionButton,
  ProfileGridItem,
  ProfileHeaderContent,
  profileGridItemSize,
  PROFILE_GRID_GAP,
  PROFILE_GRID_PADDING,
  type ProfileFilter,
} from '@/components/profile/ProfileView';

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
    total: postsTotal,
    refresh: refreshPosts,
  } = usePosts({ source: 'author', username });
  const { width: screenWidth } = useWindowDimensions();
  const gridItemSize = profileGridItemSize(screenWidth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProfileFilter>('posts');
  const [messaging, setMessaging] = useState(false);
  // The author feed filters soft-deleted posts, while `_count.posts` on older
  // servers does not. Prefer the healthy feed total when the two disagree.
  const postCount = profile
    ? loadingPosts || postsError
      ? profile._count.posts
      : Math.min(profile._count.posts, postsTotal)
    : 0;

  const filteredPosts = useMemo(
    () => filterProfilePosts(posts, filter),
    [posts, filter],
  );
  const memories = useMemo(
    () => posts.filter((post) => post.imageUrls.length > 0).slice(0, 10),
    [posts],
  );

  useEffect(() => {
    if (!username) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const resp = await api.get<{
          success: boolean;
          data: SearchedUserProfile;
        }>(`/users/${username}`, token ?? undefined);
        const nextProfile = {
          ...resp.data,
          avatarUrl: normalizeMediaUrl(resp.data.avatarUrl),
        };
        setProfile(nextProfile);
        setCached(`profile:${username}`, nextProfile, 5 * 60_000);
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
  }) => (
    <ProfileGridItem
      post={item}
      index={index}
      size={gridItemSize}
      username={username}
    />
  );

  const isOwnProfile = profile?.id === currentUserId;

  const showGridSkeletons = loadingPosts && posts.length === 0;
  const listData: SocialPost[] = showGridSkeletons
    ? (GRID_SKELETON_DATA as unknown as SocialPost[])
    : filteredPosts;

  const renderHeader = () => {
    if (loading) {
      return <ProfileSkeleton />;
    }

    if (!profile) return null;

    const initial = (
      profile.displayName?.charAt(0) ?? profile.username.charAt(0)
    ).toUpperCase();

    return (
      <ProfileHeaderContent
        avatarUrl={profile.avatarUrl}
        initial={initial}
        displayName={profile.displayName ?? profile.username}
        username={profile.username}
        bio={profile.bio}
        isVerified={profile.isVerified}
        postCount={postCount}
        followers={profile._count.followers}
        following={profile._count.following}
        memories={memories}
        filter={filter}
        onFilterChange={setFilter}
        onFollowersPress={() =>
          router.push({
            pathname: `/users/${profile.username}/followers` as never,
          })
        }
        onFollowingPress={() =>
          router.push({
            pathname: `/users/${profile.username}/following` as never,
          })
        }
        actions={
          isOwnProfile ? (
            <>
              <ProfileActionButton
                label="Edit profile"
                icon="create-outline"
                variant="secondary"
                onPress={() => router.push('/editProfile')}
              />
              <ProfileActionButton
                label="New post"
                icon="add"
                onPress={() => router.push('/posts/create')}
              />
            </>
          ) : (
            <>
              <ProfileActionButton
                label={profile.isFollowing ? 'Following' : 'Follow'}
                icon={profile.isFollowing ? 'checkmark' : 'person-add-outline'}
                variant={profile.isFollowing ? 'secondary' : 'primary'}
                onPress={handleFollow}
              />
              <ProfileActionButton
                label="Message"
                icon="mail-outline"
                variant="secondary"
                loading={messaging}
                onPress={handleMessagePress}
              />
            </>
          )
        }
      />
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name={
          filter === 'videos'
            ? 'videocam-outline'
            : filter === 'photos'
              ? 'images-outline'
              : filter === 'text'
                ? 'text-outline'
                : 'grid-outline'
        }
        size={48}
        color={theme.COLORS.textMuted}
      />
      <Text style={styles.emptyTitle}>
        {filter === 'videos'
          ? 'No videos yet'
          : filter === 'photos'
            ? 'No photos yet'
            : filter === 'text'
              ? 'No text posts yet'
              : 'No posts yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {filter === 'posts'
          ? 'Share your first post to see it here'
          : `No ${filter} posts to show yet`}
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
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={21} color={FEED.text} />
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Profile
        </Text>
        <View style={styles.topBarSpacer} />
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
    backgroundColor: FEED.background,
  },
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.sm,
  },
  circleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FEED.surface,
    borderWidth: 1,
    borderColor: FEED.border,
  },
  topBarTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    letterSpacing: -0.2,
  },
  topBarSpacer: {
    width: 42,
    height: 42,
  },
  list: {
    flex: 1,
    backgroundColor: FEED.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
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
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
  gridRow: {
    gap: PROFILE_GRID_GAP,
    marginTop: theme.SPACING.md,
    paddingHorizontal: PROFILE_GRID_PADDING,
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
