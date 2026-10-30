import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";
import { router } from "expo-router";

interface SharedPostCardProps {
  content: string;
  authorName: string;
  authorAvatarUrl: string | null;
  imageUrl?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
}

export default function SharedPostCard({
  content,
  authorName,
  authorAvatarUrl,
  imageUrl,
  onPress,
  onLongPress,
}: SharedPostCardProps) {
  const [imageError, setImageError] = useState(false);

  const previewImage = useMemo(() => {
    if (!imageUrl || imageError) return null;
    return imageUrl;
  }, [imageUrl, imageError]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.9}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          {authorAvatarUrl ? (
            <Image
              source={{ uri: authorAvatarUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarText}>
              {authorName?.[0]?.toUpperCase() ?? "?"}
            </Text>
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {authorName}
          </Text>
          <Text style={styles.sharedLabel}>shared a post</Text>
        </View>
        <Ionicons
          name="share-social-outline"
          size={18}
          color={theme.COLORS.textMuted}
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.content} numberOfLines={3}>
          {content}
        </Text>
        {previewImage ? (
          <Image
            source={{ uri: previewImage }}
            style={styles.previewImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
    overflow: "hidden",
    maxWidth: 280,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.COLORS.primary,
  },
  headerText: {
    flex: 1,
  },
  authorName: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  sharedLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    color: theme.COLORS.textMuted,
  },
  body: {
    paddingHorizontal: theme.SPACING.md,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  content: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textSecondary,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
  },
  previewImage: {
    width: "100%",
    height: 120,
    borderRadius: theme.BORDER_RADIUS.md,
  },
});
