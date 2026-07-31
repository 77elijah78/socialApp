import React from "react";
import { FlatList, View, Text, Image, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";

export interface StoryItem {
  id: string;
  name: string;
  avatarUrl: string;
  isViewed: boolean;
  isMe: boolean;
}

const STORIES: StoryItem[] = [
  {
    id: "me",
    name: "Your story",
    avatarUrl:
      "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    isViewed: false,
    isMe: true,
  },
  {
    id: "1",
    name: "Sarah",
    avatarUrl:
      "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    isViewed: false,
    isMe: false,
  },
  {
    id: "2",
    name: "Marcus",
    avatarUrl:
      "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    isViewed: true,
    isMe: false,
  },
  {
    id: "3",
    name: "Leila",
    avatarUrl:
      "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=200&w=200",
    isViewed: false,
    isMe: false,
  },
  {
    id: "4",
    name: "James",
    avatarUrl:
      "https://images.pexels.com/photos/19841535/pexels-photo-19841535.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=200&w=200",
    isViewed: true,
    isMe: false,
  },
  {
    id: "5",
    name: "Anya",
    avatarUrl:
      "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    isViewed: false,
    isMe: false,
  },
];

function StoryRing({ isViewed, isMe, size }: { isViewed: boolean; isMe: boolean; size: number }) {
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
          source={{ uri: STORIES[0].avatarUrl }}
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
        source={{ uri: STORIES[0].avatarUrl }}
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
  const renderItem = ({ item }: { item: StoryItem }) => {
    const storySize = theme.SIZING.storyItem;
    return (
      <TouchableOpacity
        style={{
          alignItems: "center",
          width: theme.SIZING.storyItem + 40,
        }}
        activeOpacity={theme.OPACITY.semiTransparent}
      >
        <StoryRing isViewed={item.isViewed} isMe={item.isMe} size={storySize} />
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
          {item.name}
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
          gap: theme.SPACING.sm,
          alignItems: "center",
        }}
      />
    </View>
  );
}
