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
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import theme from '@/constants/theme';
import { useAppSelector } from '@/store/hooks';
import { api } from '@/services/api';
import { PostResponse, SocialPost } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE =
  (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
  GRID_COLUMNS;

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

export default function BookmarksScreen() {
  const token = useAppSelector((s) => s.auth.token);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmarks = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await api.get<{
        success: boolean;
        data: { posts: PostResponse[]; total: number };
      }>('/posts/saved?page=1&limit=50', token);
      const mapped = (resp.data.posts ?? []).map(mapPostResponse);
      setPosts(mapped);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load bookmarks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBookmarks();
  }, [fetchBookmarks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookmarks();
  }, [fetchBookmarks]);

  const renderItem = ({ item }: { item: SocialPost }) => {
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
            <Ionicons name="chatbubble" size={12} color={theme.COLORS.white} />
            <Text style={styles.gridStatText}>{item.commentCount ?? 0}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (error && posts.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons
              name="arrow-back"
              size={24}
              color={theme.COLORS.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bookmarks</Text>
          <View style={{ width: 40 }} />
        </View>
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.COLORS.textPrimary}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Bookmarks</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={styles.gridRow}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="bookmark-outline"
                size={48}
                color={theme.COLORS.textMuted}
              />
              <Text style={styles.emptyTitle}>No bookmarks yet</Text>
              <Text style={styles.emptySubtitle}>
                Save posts you want to revisit later
              </Text>
            </View>
          }
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
    paddingVertical: theme.SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.xs,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: theme.SPACING.xxxxxl,
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
