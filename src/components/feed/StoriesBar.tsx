import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import theme from "@/constants/theme";
import {
  createUploadFormData,
  getAssetMimeType,
  PickedAsset,
  pickFromLibrary,
  showImageSourceActionSheet,
  takePhoto,
} from "@/hooks/useImagePicker";
import { useStories } from "@/hooks/useStories";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { StoryItem } from "@/types";
import { showAppDialog } from "@/services/AppDialogService";

const STORY_SIZE = theme.SIZING.storyItem;

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
  const innerSize = size - 8;
  const avatar = avatarUrl ? (
    <Image
      source={{ uri: avatarUrl }}
      style={[styles.avatarImage, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}
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

  if (isMe && !hasStory) {
    return (
      <View style={[styles.addStoryRing, { width: size, height: size, borderRadius: size / 2 }]}>
        {avatarContent}
        <View style={styles.plusBadge}>
          <Ionicons name="add" size={15} color={theme.COLORS.white} />
        </View>
      </View>
    );
  }

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
        <View style={[styles.viewedRing, { width: size, height: size, borderRadius: size / 2 }]}>
          {ringContent}
        </View>
      ) : (
        <LinearGradient
          colors={[theme.STORY.gradientStart, theme.STORY.gradientEnd]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={[styles.unviewedRing, { width: size, height: size, borderRadius: size / 2 }]}
        >
          {ringContent}
        </LinearGradient>
      )}
      {storyCount > 1 ? (
        <View style={styles.storyCountBadge}>
          <Text style={styles.storyCountText}>{storyCount > 9 ? "9+" : storyCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function StoriesBar() {
  const { groupedStories, storyCounts, loading, refetch, stories } = useStories();
  const token = useAppSelector((state) => state.auth.token);
  const currentUserId = useAppSelector((state) => state.auth.user?.id);
  const currentAvatarUrl = useAppSelector((state) => state.auth.user?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);

  const handleCreateStory = useCallback(() => {
    if (!token || uploading) return;

    showImageSourceActionSheet(async (action) => {
      let asset: PickedAsset | null = null;
      if (action === "library") {
        const result = await pickFromLibrary({ allowsEditing: true, aspect: [9, 16] });
        asset = Array.isArray(result) ? result[0] ?? null : result;
      } else {
        asset = await takePhoto();
      }

      if (!asset) return;

      setUploading(true);
      try {
        const mimeType = getAssetMimeType(asset);
        const form = createUploadFormData(asset.uri, mimeType);
        const uploaded = await api.upload("/media/upload", form, token);

        await api.post(
          "/posts/stories",
          {
            mediaUrl: uploaded.data.url,
            mediaType: "image",
            caption: undefined,
          },
          token,
        );

        await refetch();
      } catch (err) {
        showAppDialog({
          title: "Couldn’t create story",
          message: err instanceof Error ? err.message : "Please try again.",
          tone: "error",
        });
      } finally {
        setUploading(false);
      }
    }, {
      title: "Create a story",
      message: "Choose a photo from your library or capture a new one.",
    });
  }, [token, uploading, refetch]);

  const handleStoryPress = useCallback(
    (story: StoryItem) => {
      if (story.id === "me" || story.userId === currentUserId) {
        const ownStoryIndex = stories.findIndex((item) => item.userId === currentUserId);
        if (ownStoryIndex >= 0) {
          router.push({ pathname: "/stories/viewer", params: { index: String(ownStoryIndex) } });
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
  const latestOwnStory = stories.find((story) => story.userId === currentUserId);
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
  const newStoryCount = groupedStories.filter(
    (story) => story.userId !== currentUserId && !story.isViewed,
  ).length;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Stories</Text>
          <Text style={styles.sectionSubtitle}>Little moments from your circle</Text>
        </View>
        <View style={styles.updatesBadge}>
          <View style={[styles.updatesDot, newStoryCount === 0 && styles.updatesDotQuiet]} />
          <Text style={styles.updatesText}>
            {newStoryCount > 0 ? `${newStoryCount} new` : "Your circle"}
          </Text>
        </View>
      </View>

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
            const count = isMe ? ownStoryCount : storyCounts[item.userId] ?? 0;
            const label = isMe
              ? ownStoryCount > 0
                ? "Your story"
                : "Add story"
              : item.displayName ?? item.username;
            const initial = (item.displayName ?? item.username ?? "?").charAt(0).toUpperCase();

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isMe ? label : `View ${label}'s story`}
                style={({ pressed }) => [styles.storyItem, pressed && styles.storyPressed]}
                onPress={() => handleStoryPress(isMe ? ownItem : item)}
                disabled={isMe && uploading}
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
                  {isMe && uploading ? (
                    <View style={styles.uploadingOverlay}>
                      <ActivityIndicator size="small" color={theme.COLORS.white} />
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.storyLabel, isMe && styles.ownStoryLabel]} numberOfLines={1}>
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
    marginHorizontal: theme.LAYOUT.contentPadding,
    marginBottom: theme.SPACING.md,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.md,
    borderRadius: 22,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
    ...theme.SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.lg,
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
  updatesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: theme.SPACING.xs,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  updatesDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.COLORS.primary,
  },
  updatesDotQuiet: {
    backgroundColor: theme.COLORS.textMuted,
  },
  updatesText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  listContent: {
    paddingHorizontal: theme.SPACING.md,
  },
  storyItem: {
    width: STORY_SIZE + 20,
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
  addStoryRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgInput,
  },
  avatarFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: theme.COLORS.bgInput,
  },
  avatarImage: {
    backgroundColor: theme.COLORS.bgInput,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  storyRingInner: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgWhite,
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
    borderColor: theme.COLORS.borderGray,
    backgroundColor: theme.COLORS.bgWhite,
  },
  plusBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primary,
    borderWidth: 2,
    borderColor: theme.COLORS.bgWhite,
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
    backgroundColor: theme.COLORS.textPrimary,
    borderWidth: 2,
    borderColor: theme.COLORS.bgWhite,
  },
  storyCountText: {
    color: theme.COLORS.white,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  storyLabel: {
    width: STORY_SIZE + 12,
    marginTop: theme.SPACING.sm,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    textAlign: "center",
  },
  ownStoryLabel: {
    color: theme.COLORS.textPrimary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: STORY_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26, 26, 46, 0.42)",
  },
});
