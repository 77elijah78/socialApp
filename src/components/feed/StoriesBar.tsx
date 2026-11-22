import React, { useCallback, useEffect } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { StoriesBarSkeleton } from "@/components/ui/Skeleton";
import { FEED } from "@/constants/feedTheme";
import theme from "@/constants/theme";
import { useStories } from "@/hooks/useStories";
import { useAppSelector } from "@/store/hooks";
import { StoryItem } from "@/types";
import { subscribeStoryCreated } from "@/utils/storyUpdates";

const STORY_SIZE = 66;

function StoryRing({
  isViewed,
  isMe,
  size,
  avatarUrl,
  initial,
  hasStory,
  storyCount,
}: {
  isViewed: boolean;
  isMe: boolean;
  size: number;
  avatarUrl: string | null;
  initial: string;
  hasStory: boolean;
  storyCount: number;
}) {
  if (isMe && !hasStory) {
    return (
      <View
        style={[
          styles.addStoryCircle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Ionicons name="add" size={27} color={FEED.text} />
      </View>
    );
  }

  const innerSize = size - 8;
  const avatar = avatarUrl ? (
    <Image
      source={{ uri: avatarUrl }}
      style={[
        styles.avatarImage,
        { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
      ]}
    />
  ) : (
    <View
      style={[
        styles.avatarFallback,
        { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
      ]}
    >
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );

  const avatarContent = (
    <View
      style={[
        styles.avatarFrame,
        { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
      ]}
    >
      {avatar}
    </View>
  );

  const ringContent = (
    <View
      style={[
        styles.storyRingInner,
        { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 },
      ]}
    >
      {avatarContent}
    </View>
  );

  return (
    <View style={styles.ringWrap}>
      {isViewed && !isMe ? (
        <View
          style={[
            styles.viewedRing,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          {ringContent}
        </View>
      ) : (
        <LinearGradient
          colors={[FEED.accent, "#72B7FF"]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.unviewedRing,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          {ringContent}
        </LinearGradient>
      )}
      {storyCount > 1 ? (
        <View style={styles.storyCountBadge}>
          <Text style={styles.storyCountText}>
            {storyCount > 9 ? "9+" : storyCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function StoriesBar() {
  const { groupedStories, storyCounts, loading, refetch, stories } = useStories();
  const token = useAppSelector((state) => state.auth.token);
  const currentUserId = useAppSelector((state) => state.auth.user?.id);
  const currentAvatarUrl = useAppSelector(
    (state) => state.auth.user?.avatarUrl ?? null,
  );
  const handleCreateStory = useCallback(() => {
    if (!token) return;
    router.push("/stories/create");
  }, [token]);

  // A confirmed publish refreshes the real `/posts/stories` list once, without
  // polling or refetching every time Home regains focus.
  useEffect(() => subscribeStoryCreated(() => void refetch()), [refetch]);

  const handleStoryPress = useCallback(
    (story: StoryItem) => {
      if (story.id === "me" || story.userId === currentUserId) {
        const ownStoryIndex = stories.findIndex(
          (item) => item.userId === currentUserId,
        );
        if (ownStoryIndex >= 0) {
          router.push({
            pathname: "/stories/viewer",
            params: { index: String(ownStoryIndex) },
          });
        } else {
          handleCreateStory();
        }
        return;
      }

      const storyIndex = stories.findIndex((item) => item.id === story.id);
      router.push({
        pathname: "/stories/viewer",
        params: { index: String(storyIndex >= 0 ? storyIndex : 0) },
      });
    },
    [currentUserId, handleCreateStory, stories],
  );

  const ownStoryCount = storyCounts[currentUserId ?? ""] ?? 0;
  const latestOwnStory = stories.find(
    (story) => story.userId === currentUserId,
  );
  const ownItem: StoryItem = {
    id: "me",
    userId: currentUserId ?? "me",
    username: "you",
    displayName: "Your story",
    avatarUrl: currentAvatarUrl ?? null,
    mediaUrl: latestOwnStory?.mediaUrl ?? "",
    mediaType: "image",
    caption: null,
    createdAt: latestOwnStory?.createdAt ?? new Date(),
    expiresAt: latestOwnStory?.expiresAt ?? new Date(),
    isViewed: false,
  };
  const displayItems = [
    ownItem,
    ...groupedStories.filter((story) => story.userId !== currentUserId),
  ];

  return (
    <View style={styles.container}>
      {loading ? (
        <StoriesBarSkeleton count={4} />
      ) : (
        <FlatList
          data={displayItems}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isMe = item.id === "me" || item.userId === currentUserId;
            const count = isMe
              ? ownStoryCount
              : storyCounts[item.userId] ?? 0;
            const label = isMe
              ? ownStoryCount > 0
                ? "Your story"
                : "Add Story"
              : item.displayName ?? item.username;
            const initial = (item.displayName ?? item.username ?? "?")
              .charAt(0)
              .toUpperCase();

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isMe ? label : `View ${label}'s story`
                }
                style={({ pressed }) => [
                  styles.storyItem,
                  pressed && styles.storyPressed,
                ]}
                onPress={() => handleStoryPress(isMe ? ownItem : item)}
                onLongPress={isMe ? handleCreateStory : undefined}
                accessibilityHint={
                  isMe
                    ? "Tap to view your story. Long press to add another."
                    : undefined
                }
              >
                <View style={styles.storyAvatarWrap}>
                  <StoryRing
                    isViewed={isMe ? false : item.isViewed}
                    isMe={isMe}
                    size={STORY_SIZE}
                    avatarUrl={item.avatarUrl}
                    initial={initial}
                    hasStory={isMe ? ownStoryCount > 0 : true}
                    storyCount={count}
                  />
                </View>
                <Text
                  style={[styles.storyLabel, isMe && styles.ownStoryLabel]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.sm,
  },
  listContent: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    gap: theme.SPACING.md,
  },
  storyItem: {
    width: STORY_SIZE + 18,
    alignItems: "center",
    paddingVertical: theme.SPACING.xs,
  },
  storyPressed: {
    opacity: theme.OPACITY.pressed,
  },
  storyAvatarWrap: {
    position: "relative",
  },
  ringWrap: {
    position: "relative",
  },
  addStoryCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: FEED.border,
    backgroundColor: FEED.surface,
  },
  avatarFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: FEED.imageFallback,
  },
  avatarImage: {
    backgroundColor: FEED.imageFallback,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FEED.accentSoft,
  },
  avatarInitial: {
    color: FEED.accent,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  storyRingInner: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FEED.surface,
  },
  unviewedRing: {
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  viewedRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: FEED.border,
    backgroundColor: FEED.surface,
  },
  storyCountBadge: {
    position: "absolute",
    top: -1,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FEED.text,
    borderWidth: 2,
    borderColor: FEED.surface,
  },
  storyCountText: {
    color: theme.COLORS.white,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  storyLabel: {
    width: STORY_SIZE + 10,
    marginTop: theme.SPACING.sm,
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    textAlign: "center",
  },
  ownStoryLabel: {
    color: FEED.text,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
});
