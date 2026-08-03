import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  View,
  Text,
  Image,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";
import { StoryItem } from "@/types";
import { useStories } from "@/hooks/useStories";
import CreateStoryModal from "@/components/stories/CreateStoryModal";
import StoryViewer from "@/components/stories/StoryViewer";

function StoryRing({
  isViewed,
  isMe,
  size,
  avatarUrl,
}: {
  isViewed: boolean;
   isMe: boolean;
   size: number;
   avatarUrl: string | null;
}) {
  if (isMe) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: theme.BORDER.width.sm,
          borderColor: theme.COLORS.borderGray,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="add" size={28} color={theme.COLORS.primary} />
      </View>
    );
  }

  if (isViewed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: theme.BORDER.width.sm,
          borderColor: theme.COLORS.borderGray,
          padding: theme.BORDER.width.sm,
        }}
      >
         <Image
           source={{ uri: avatarUrl ?? "" }}
           style={{
            width: size - 8,
            height: size - 8,
            borderRadius: (size - 8) / 2,
            backgroundColor: theme.COLORS.white,
          }}
       />
       </View>
    );
  }

  return (
    <LinearGradient
      colors={[theme.STORY.gradientStart, theme.STORY.gradientEnd]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: theme.BORDER.width.sm,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={{ uri: avatarUrl ?? "" }}
        style={{
          width: size - 8,
          height: size - 8,
          borderRadius: (size - 8) / 2,
          backgroundColor: theme.COLORS.white,
        }}
      />
    </LinearGradient>
  );
}

function StoryItemRow({
  item,
  onStoryPress,
}: {
  item: StoryItem;
  onStoryPress?: (item: StoryItem) => void;
}) {
  const storySize = theme.SIZING.storyItem;
  const isMe = item.userId === "me";

  return (
    <TouchableOpacity
      style={{
        alignItems: "center",
        width: theme.SIZING.storyItem + 20,
      }}
      activeOpacity={theme.OPACITY.semiTransparent}
      onPress={() => onStoryPress?.(item)}
    >
      <StoryRing
        isViewed={item.isViewed}
        isMe={isMe}
        size={storySize}
        avatarUrl={item.avatarUrl ?? ""}
      />
      <Text
        style={{
          fontSize: theme.TYPOGRAPHY.fontSize.xs,
          color: theme.COLORS.textSecondary,
          marginTop: theme.SPACING.sm,
          textAlign: "center",
          fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
        }}
        numberOfLines={1}
      >
        {item.displayName}
      </Text>
    </TouchableOpacity>
  );
}

export default function StoriesBar() {
  const { stories, loading, refetch } = useStories();
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  if (loading) {
    return (
      <View
        style={{
          backgroundColor: theme.COLORS.bgWhite,
          paddingVertical: theme.SPACING.lg,
          paddingHorizontal: theme.SPACING.lg,
          marginBottom: theme.SPACING.sm,
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="small" color={theme.COLORS.primary} />
      </View>
    );
  }

  if (stories.length === 0) {
    return null;
  }

  const me = {
    id: "me",
    userId: "me",
    username: "you",
    displayName: "Your story",
    avatarUrl: null,
    mediaUrl: "",
    mediaType: "image" as const,
    caption: null,
    createdAt: new Date(),
    expiresAt: new Date(),
    isViewed: false,
  };

  const allStories = [me, ...stories.filter((s) => s.userId !== me.userId)];

  return (
    <>
      <View
        style={{
          backgroundColor: theme.COLORS.bgWhite,
          paddingVertical: theme.SPACING.lg,
          paddingHorizontal: theme.SPACING.lg,
          marginBottom: theme.SPACING.sm,
        }}
      >
        <FlatList
        data={allStories}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <StoryItemRow
            item={item}
            onStoryPress={(story) => {
              if (story.userId === "me") {
                setShowCreateStory(true);
              } else {
                const realIndex = allStories.findIndex((s) => s.id === story.id);
                setViewerInitialIndex(Math.max(realIndex, 0));
                setViewerVisible(true);
              }
            }}
          />
        )}
        />
      </View>
      <CreateStoryModal
        visible={showCreateStory}
        onClose={() => setShowCreateStory(false)}
        onStoryCreated={refetch}
      />
      <StoryViewer
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        stories={allStories}
        initialIndex={viewerInitialIndex}
      />
    </>
  );
}
