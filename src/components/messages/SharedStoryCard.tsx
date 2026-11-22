import React, { useState } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as theme from "@/constants/theme";
import AuthenticatedImage from "@/components/common/AuthenticatedImage";

interface SharedStoryCardProps {
  mediaUrl: string;
  mediaType: string;
  caption: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  expiresAt?: string | Date;
  onPress?: () => void;
  onLongPress?: () => void;
}

export default function SharedStoryCard({
  mediaUrl,
  mediaType,
  caption,
  authorName,
  authorAvatarUrl,
  expiresAt,
  onPress,
  onLongPress,
}: SharedStoryCardProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const video = mediaType.toLowerCase() === "video";

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.9}
    >
      <View style={styles.mediaWrapper}>
        {!video && mediaUrl && failedUri !== mediaUrl ? (
          <AuthenticatedImage
            uri={mediaUrl}
            style={styles.media}
            contentFit="cover"
            onError={() => setFailedUri(mediaUrl)}
          />
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Ionicons
              name={video ? "videocam-outline" : "image-outline"}
              size={32}
              color={theme.COLORS.textMuted}
            />
            <Text style={styles.unavailableText}>{video ? "Video story · Tap to watch" : "Media unavailable"}</Text>
          </View>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0.6)", "transparent"]}
          style={styles.headerScrim}
        />

        <View style={styles.overlay}>
          <View style={styles.headerRow}>
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
            <Text style={styles.authorName} numberOfLines={1}>
              {authorName}
            </Text>
          </View>
          <View style={styles.storyBadge}>
            <Ionicons
              name="share-social-outline"
              size={14}
              color={theme.COLORS.textWhite}
            />
            <Text style={styles.storyBadgeText}>Story</Text>
          </View>
        </View>

        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={styles.captionScrim}
        />

        {caption ? (
          <View style={styles.captionContainer}>
            <Text style={styles.caption} numberOfLines={3}>
              {caption}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111114",
    borderRadius: theme.BORDER_RADIUS.lg,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
    overflow: "hidden",
    width: 240,
    maxWidth: 260,
  },
  mediaWrapper: {
    position: "relative",
    width: "100%",
    height: 300,
    justifyContent: "space-between",
  },
  media: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mediaPlaceholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgChat,
    gap: theme.SPACING.sm,
  },
  unavailableText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: theme.SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.3)",
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
    color: theme.COLORS.textWhite,
  },
  authorName: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textWhite,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  storyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: theme.SPACING.xs,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  storyBadgeText: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textWhite,
  },
  headerScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  captionScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  captionContainer: {
    paddingHorizontal: theme.SPACING.md,
    paddingBottom: theme.SPACING.md,
  },
  caption: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textWhite,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
