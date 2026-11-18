import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import * as theme from "@/constants/theme";
import type { SocialPost } from "@/types";
import { formatCount } from "@/utils/format";

type Props = {
  post: SocialPost;
  size: number;
  onOpen: (postId: string) => void;
};

/** A single Explore grid cell. It never mounts a video player: the grid only
 * shows the real thumbnail (when the post has one) plus format indicators, so
 * mid-range devices are not decoding several videos while scrolling. */
function ExploreTile({ post, size, onOpen }: Props) {
  const media = useMemo(
    () =>
      post.imageUrls?.length
        ? post.imageUrls
        : post.imageUrl
          ? [post.imageUrl]
          : [],
    [post.imageUrls, post.imageUrl],
  );
  const isVideo = Boolean(post.videoUrl);
  const photoCount = media.length;
  const text = (post.content ?? "").trim();
  const name = post.author.displayName || post.author.username;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open post by ${name}: ${formatCount(post.likeCount)} likes, ${formatCount(post.commentCount)} comments${isVideo ? ", video" : ""}${photoCount > 1 ? `, ${photoCount} photos` : ""}`}
      onPress={() => onOpen(post.id)}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      {media[0] ? (
        <AuthenticatedImage
          uri={media[0]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={140}
          recyclingKey={post.id}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <LinearGradient
          colors={
            isVideo
              ? ["#3A3654", "#1D1B29"]
              : [theme.COLORS.primaryGhost, theme.COLORS.bgInput]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        >
          <View style={styles.fallback}>
            <View
              style={[
                styles.fallbackIcon,
                isVideo ? styles.fallbackIconDark : styles.fallbackIconLight,
              ]}
            >
              <Ionicons
                name={isVideo ? "play" : "text"}
                size={18}
                color={
                  isVideo ? theme.COLORS.white : theme.COLORS.primary
                }
              />
            </View>
            {!isVideo && text ? (
              <Text numberOfLines={5} style={styles.fallbackText}>
                {text}
              </Text>
            ) : null}
          </View>
        </LinearGradient>
      )}

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.58)"]}
        locations={[0.5, 1]}
        style={styles.scrim}
      />

      <View pointerEvents="none" style={styles.topBadges}>
        {isVideo ? (
          <View style={styles.formatBadge}>
            <Ionicons name="play" size={10} color={theme.COLORS.white} />
          </View>
        ) : null}
        {photoCount > 1 ? (
          <View style={styles.formatBadge}>
            <Ionicons name="copy-outline" size={10} color={theme.COLORS.white} />
            <Text style={styles.formatText}>{photoCount}</Text>
          </View>
        ) : null}
      </View>

      <View pointerEvents="none" style={styles.metrics}>
        <Ionicons
          name={post.isLiked ? "heart" : "heart-outline"}
          size={11}
          color={theme.COLORS.white}
        />
        <Text style={styles.metricText}>{formatCount(post.likeCount)}</Text>
        <Ionicons
          name="chatbubble-outline"
          size={10}
          color="rgba(255,255,255,0.85)"
        />
        <Text style={styles.metricText}>
          {formatCount(post.commentCount)}
        </Text>
      </View>
    </Pressable>
  );
}

export default React.memo(ExploreTile);

const styles = StyleSheet.create({
  tile: {
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: theme.COLORS.bgInput,
  },
  pressed: {
    opacity: theme.OPACITY.subtle,
  },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  fallbackIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackIconLight: {
    backgroundColor: theme.COLORS.bgWhite,
  },
  fallbackIconDark: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  fallbackText: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: 14,
    textAlign: "center",
  },
  topBadges: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  formatBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.48)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  formatText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  metrics: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metricText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    marginRight: 3,
  },
});
