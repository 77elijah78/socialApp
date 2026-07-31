import React, { useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PostCard from '@/components/feed/PostCard';
import StoriesBar from '@/components/feed/StoriesBar';
import { SocialPost } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';

const POSTS: SocialPost[] = [
  {
    id: "1",
    author: {
      id: "u1",
      username: "sarahchen",
      displayName: "Sarah Chen",
      avatarUrl: "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
      isVerified: true,
    },
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 60 * 1000),
    timestamp: "2m ago",
    content:
      "Just wrapped up an incredible weekend adventure in the mountains 🏔️ There's something magical about being completely disconnected from the world up there. Highly recommend everyone takes a trip like this at least once.",
    imageUrls: [
      "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    ],
    imageUrl: "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    likeCount: 1243,
    commentCount: 87,
    shareCount: 34,
    isLiked: true,
    isBookmarked: false,
    tags: ["travel", "mountains", "adventure"],
    _count: { likes: 1243, comments: 87 },
  },
  {
    id: "2",
    author: {
      id: "u2",
      username: "marcuswebb",
      displayName: "Marcus Webb",
      avatarUrl: "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    },
    createdAt: new Date(Date.now() - 18 * 60 * 1000),
    updatedAt: new Date(Date.now() - 18 * 60 * 1000),
    timestamp: "18m ago",
    content:
      "Hot take: the best coffee shops are the ones where nobody knows your name ☕ Found this hidden gem today and I'm never leaving.",
    imageUrls: [],
    likeCount: 562,
    commentCount: 43,
    shareCount: 12,
    isLiked: false,
    isBookmarked: true,
    tags: ["coffee", "vibes"],
    _count: { likes: 562, comments: 43 },
  },
  {
    id: "3",
    author: {
      id: "u3",
      username: "leilamoradi",
      displayName: "Leila Moradi",
      avatarUrl: "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
      isVerified: true,
    },
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    timestamp: "1h ago",
    content:
      "Winter selfies hit different when you're surrounded by your best people 🤍 Grateful for every single moment with this crew.",
    imageUrls: [
      "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    ],
    imageUrl: "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    likeCount: 3891,
    commentCount: 214,
    shareCount: 98,
    isLiked: false,
    isBookmarked: false,
    tags: ["friends", "winter", "grateful"],
    _count: { likes: 3891, comments: 214 },
  },
  {
    id: "4",
    author: {
      id: "u4",
      username: "jamesokafor",
      displayName: "James Okafor",
      avatarUrl: "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    },
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    timestamp: "3h ago",
    content:
      "Reminder that the ocean doesn't care about your deadlines 🌊 Take the trip. Watch the sunrise. Everything else can wait.",
    imageUrls: [
      "https://images.pexels.com/photos/19841535/pexels-photo-19841535.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    ],
    imageUrl: "https://images.pexels.com/photos/19841535/pexels-photo-19841535.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    likeCount: 2104,
    commentCount: 130,
    shareCount: 77,
    isLiked: true,
    isBookmarked: true,
    tags: ["ocean", "mindfulness", "travel"],
    _count: { likes: 2104, comments: 130 },
  },
  {
    id: "5",
    author: {
      id: "u5",
      username: "anyapetrov",
      displayName: "Anya Petrov",
      avatarUrl: "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
      isVerified: true,
    },
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    timestamp: "5h ago",
    content:
      "Forest trails with someone you love make every step worth it 🌲 We covered 12km today and I'd do it all over again.",
    imageUrls: [],
    likeCount: 889,
    commentCount: 61,
    shareCount: 22,
    isLiked: false,
    isBookmarked: false,
    tags: ["hiking", "nature", "love"],
    _count: { likes: 889, comments: 61 },
  },
];

export default function FeedScreen() {
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.COLORS.bgLight,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.LAYOUT.contentPadding,
          paddingTop: theme.SPACING.md,
          paddingBottom: theme.SPACING.sm,
          backgroundColor: theme.COLORS.bgLight,
          ...theme.SHADOWS.xl,
          zIndex: 10,
        }}
      >
        <Text style={styles.headerTitle}>Feed</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIconBtn}>
            <Ionicons name="search" size={22} color={theme.COLORS.textPrimary} />
          </Pressable>
          <Pressable style={styles.headerIconBtn}>
            <Ionicons name="notifications-outline" size={22} color={theme.COLORS.textPrimary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        style={{
          flex: 1,
          backgroundColor: theme.COLORS.bgLight,
        }}
        data={POSTS}
        showsVerticalScrollIndicator={false}
        numColumns={1}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<StoriesBar />}
        ListFooterComponent={<View style={{ height: theme.SPACING.xxxxl }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.COLORS.primary}
            colors={[theme.COLORS.primary]}
          />
        }
        renderItem={({ item }) => <PostCard post={item} />}
      />
    </SafeAreaView>
  );
}

const styles = {
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.xs,
  } as const,
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.SPACING.sm,
  } as const,
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  } as const,
};
