import React from "react";
import { FlatList, View, Text, Image, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";
import { Story } from "@/types";

const STORIES: Story[] = [
  {
    id: "me",
    userId: "me",
    username: "johndoe",
    displayName: "Your story",
    avatarUrl:
      "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaUrl: "",
    mediaType: "image",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isViewed: false,
  },
  {
    id: "1",
    userId: "u1",
    username: "sarahchen",
    displayName: "Sarah",
    avatarUrl:
      "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaUrl:
      "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    mediaType: "image",
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isViewed: false,
  },
  {
    id: "2",
    userId: "u2",
    username: "marcuswebb",
    displayName: "Marcus",
    avatarUrl:
      "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaUrl:
      "https://images.pexels.com/photos/19841535/pexels-photo-19841535.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    mediaType: "image",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isViewed: true,
  },
  {
    id: "3",
    userId: "u3",
    username: "leilamoradi",
    displayName: "Leila",
    avatarUrl:
      "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaUrl:
      "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaType: "image",
    createdAt: new Date(Date.now() - 45 * 60 * 1000),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isViewed: false,
  },
  {
    id: "4",
    userId: "u4",
    username: "jamesokafor",
    displayName: "James",
    avatarUrl:
      "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaUrl:
      "https://images.pexels.com/photos/19841535/pexels-photo-19841535.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    mediaType: "image",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isViewed: true,
  },
  {
    id: "5",
    userId: "u5",
    username: "anyapetrov",
    displayName: "Anya",
    avatarUrl:
      "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaUrl:
      "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    mediaType: "image",
    createdAt: new Date(Date.now() - 90 * 60 * 1000),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isViewed: false,
  },
];

function StoryRing({
  isViewed,
  isMe,
  size,
  avatarUrl,
}: {
  isViewed: boolean;
  isMe: boolean;
  size: number;
  avatarUrl: string;
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
          source={{ uri: avatarUrl }}
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
        source={{ uri: avatarUrl }}
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

export default function StoriesBar() {
  const renderItem = ({ item }: { item: Story }) => {
    const storySize = theme.SIZING.storyItem;
    return (
      <TouchableOpacity
        style={{
          alignItems: "center",
          width: theme.SIZING.storyItem + 20,
        }}
        activeOpacity={theme.OPACITY.semiTransparent}
      >
        <StoryRing
          isViewed={item.isViewed}
          isMe={item.userId === "me"}
          size={storySize}
          avatarUrl={item.avatarUrl}
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
  };

  return (
    <View
      style={{
        backgroundColor: theme.COLORS.bgWhite,
        paddingVertical: theme.SPACING.lg,
        paddingHorizontal: theme.SPACING.lg,
        marginBottom: theme.SPACING.sm,
      }}
    >
      <FlatList
        data={STORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          gap: 0,
          alignItems: "center",
        }}
      />
    </View>
  );
}
