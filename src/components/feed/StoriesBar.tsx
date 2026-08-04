import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";
import { StoryItem } from "@/types";
import { useStories } from "@/hooks/useStories";
import StoryViewer from "@/components/stories/StoryViewer";
import {
  showImageSourceActionSheet,
  pickFromLibrary,
  takePhoto,
  createUploadFormData,
  getAssetMimeType,
  PickedAsset,
} from "@/hooks/useImagePicker";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { Alert } from "react-native";

const STORY_SIZE = theme.SIZING.storyItem;

function StoryRing({
  isViewed,
  isMe,
  size,
  avatarUrl,
  hasStory,
  storyCount,
}: {
  isViewed: boolean;
  isMe: boolean;
  size: number;
  avatarUrl: string | null;
  hasStory: boolean;
  storyCount?: number;
}) {
  if (isMe) {
    return (
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
        {hasStory && avatarUrl ? (
          <>
            <Image
              source={{ uri: avatarUrl }}
              style={[styles.avatar, { width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }]}
            />
            <View style={[styles.storyCountBadge, { bottom: -2, right: -2 }]}>
              <Text style={styles.storyCountText}>{storyCount ?? 0}</Text>
            </View>
          </>
        ) : (
          <Ionicons name="add" size={32} color={theme.COLORS.primary} />
        )}
      </View>
    );
  }

  if (!hasStory) return null;

  if (isViewed) {
    return (
      <View style={[styles.ringViewed, { width: size, height: size, borderRadius: size / 2, padding: 2 }]}>
        <Image
          source={{ uri: avatarUrl ?? "" }}
          style={[styles.avatar, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }]}
        />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[theme.STORY.gradientStart, theme.STORY.gradientEnd]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={[styles.ringUnviewed, { width: size, height: size, borderRadius: size / 2, padding: 2 }]}
    >
      <Image
        source={{ uri: avatarUrl ?? "" }}
        style={[styles.avatar, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }]}
      />
    </LinearGradient>
  );
}

export default function StoriesBar() {
  const { groupedStories, storyCounts, loading, refetch, stories, updateStoryViewed } = useStories();
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const currentAvatarUrl = useAppSelector((s) => s.auth.user?.avatarUrl);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleCreateStory = useCallback(() => {
    if (!token || uploading) return;

    showImageSourceActionSheet(async (action) => {
      let asset: PickedAsset | null = null;
      if (action === "library") {
        asset = (await pickFromLibrary({ allowsEditing: true, aspect: [9, 16] })) as PickedAsset | null;
      } else {
        asset = await takePhoto();
      }

      if (!asset) return;

      setUploading(true);
      try {
        const mimeType = getAssetMimeType(asset);
        const form = createUploadFormData(asset.uri, mimeType);
        const resp = await api.upload("/media/upload", form, token);

        await api.post<{ success: boolean; data: unknown }>(
          "/posts/stories",
          {
            mediaUrl: resp.data.url,
            mediaType: "image",
            caption: undefined,
          },
          token,
        );

        refetch();
      } catch (err: any) {
        Alert.alert("Upload Failed", err.message || "Could not create story.");
      } finally {
        setUploading(false);
      }
    });
  }, [token, uploading, refetch]);

  const handleStoryPress = (story: StoryItem) => {
    if (story.userId === "me") {
      if (storyCounts["me"] > 0) {
        // Open viewer at the user's stories
        const meIndex = groupedStories.findIndex((s) => s.userId === "me" || s.userId === currentUserId);
        if (meIndex >= 0) {
          setViewerInitialIndex(meIndex);
          setViewerVisible(true);
        } else {
          handleCreateStory();
        }
      } else {
        handleCreateStory();
      }
    } else {
      const realIndex = groupedStories.findIndex((s) => s.id === story.id);
      setViewerInitialIndex(Math.max(realIndex, 0));
      setViewerVisible(true);
    }
  };

  // Build the display list: "me" item + grouped stories
  const meStoryCount = storyCounts[currentUserId ?? "me"] ?? 0;
  const meLatestStory = stories.find((s) => s.userId === currentUserId);

  const meItem: StoryItem = {
    id: "me",
    userId: currentUserId ?? "me",
    username: "you",
    displayName: "Your story",
    avatarUrl: currentAvatarUrl ?? meLatestStory?.avatarUrl ?? null,
    mediaUrl: meLatestStory?.mediaUrl ?? "",
    mediaType: "image",
    caption: null,
    createdAt: meLatestStory?.createdAt ?? new Date(),
    expiresAt: meLatestStory?.expiresAt ?? new Date(),
    isViewed: false,
  };

  const displayItems = [meItem, ...groupedStories.filter((s) => s.userId !== currentUserId)];

  if (loading) {
    return (
      <View style={[styles.container, { paddingVertical: theme.SPACING.lg, paddingHorizontal: theme.SPACING.lg }]}>
        <ActivityIndicator size="small" color={theme.COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <FlatList
          data={displayItems}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isMe = item.userId === currentUserId || item.id === "me";
            const storyCount = isMe ? meStoryCount : (storyCounts[item.userId] ?? 0);
            return (
              <TouchableOpacity
                style={styles.itemRow}
                activeOpacity={theme.OPACITY.semiTransparent}
                onPress={() => handleStoryPress(item)}
                disabled={isMe && uploading}
              >
                <StoryRing
                  isViewed={isMe ? false : item.isViewed}
                  isMe={isMe}
                  size={STORY_SIZE}
                  avatarUrl={item.avatarUrl}
                  hasStory={isMe ? meStoryCount > 0 : true}
                  storyCount={storyCount > 1 ? storyCount : undefined}
                />
                <Text style={styles.itemLabel} numberOfLines={1}>
                  {item.displayName}
                </Text>
                {isMe && uploading && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color={theme.COLORS.white} />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <StoryViewer
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        stories={stories}
        allStories={stories}
        initialIndex={viewerInitialIndex}
        onStoryViewed={updateStoryViewed}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.COLORS.bgWhite,
    paddingVertical: theme.SPACING.lg,
    paddingHorizontal: theme.SPACING.lg,
    marginBottom: theme.SPACING.sm,
  },
  itemRow: {
    alignItems: "center",
    width: STORY_SIZE + 20,
    position: "relative",
  },
  itemLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.sm,
    textAlign: "center",
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  ring: {
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.borderGray,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgInput,
  },
  ringViewed: {
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.borderGray,
    backgroundColor: theme.COLORS.white,
  },
  ringUnviewed: {
    padding: theme.BORDER.width.sm,
  },
  avatar: {
    backgroundColor: theme.COLORS.white,
  },
  storyCountBadge: {
    position: "absolute",
    backgroundColor: theme.COLORS.primary,
    borderRadius: theme.BORDER_RADIUS.full,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  storyCountText: {
    color: theme.COLORS.white,
    fontSize: 10,
    fontWeight: "700",
  },
  uploadingOverlay: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: theme.COLORS.primary,
    borderRadius: theme.BORDER_RADIUS.full,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
