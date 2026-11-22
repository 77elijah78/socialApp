import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

  if (previewImage) {
    return (
      <TouchableOpacity
        style={[styles.container, styles.imageContainer]}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: previewImage }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0.55)", "transparent"]}
          style={styles.topScrim}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(0,0,0,0.84)"]}
          style={styles.bottomScrim}
        />

        <View style={styles.overlayHeader}>
          <View style={styles.overlayAvatar}>
            {authorAvatarUrl ? (
              <Image
                source={{ uri: authorAvatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.overlayAvatarText}>
                {authorName?.[0]?.toUpperCase() ?? "?"}
              </Text>
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.overlayAuthorName} numberOfLines={1}>
              {authorName}
            </Text>
            <Text style={styles.overlaySharedLabel}>shared a post</Text>
          </View>
          <Ionicons
            name="share-social-outline"
            size={18}
            color={theme.COLORS.white}
          />
        </View>

        <View style={styles.overlayBody}>
          <Text style={styles.overlayContent} numberOfLines={4}>
            {content}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

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
  imageContainer: {
    width: 280,
    height: 350,
    padding: 0,
    backgroundColor: "#111114",
    justifyContent: "space-between",
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  bottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
  },
  overlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    paddingTop: theme.SPACING.md,
  },
  overlayAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  overlayAvatarText: {
    color: theme.COLORS.white,
    fontSize: 12,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  overlayAuthorName: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  overlaySharedLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  overlayBody: {
    paddingHorizontal: theme.SPACING.md,
    paddingBottom: theme.SPACING.md,
  },
  overlayContent: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
