import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { FEED } from "@/constants/feedTheme";
import * as theme from "@/constants/theme";
import type { SocialPost } from "@/types";
import { authorFeedParams } from "@/utils/postContracts";

export const PROFILE_GRID_COLUMNS = 3;
export const PROFILE_GRID_GAP = 3;
export const PROFILE_GRID_PADDING = 8;

export type ProfileFilter = "posts" | "photos" | "videos" | "text";

export const PROFILE_FILTERS: { key: ProfileFilter; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Videos" },
  { key: "text", label: "Text" },
];

export function filterProfilePosts(
  posts: SocialPost[],
  filter: ProfileFilter,
): SocialPost[] {
  if (filter === "photos")
    return posts.filter((post) => post.imageUrls.length > 0);
  if (filter === "videos") return posts.filter((post) => Boolean(post.videoUrl));
  if (filter === "text")
    return posts.filter(
      (post) => post.imageUrls.length === 0 && !post.videoUrl,
    );
  return posts;
}

export function profileGridItemSize(screenWidth: number): number {
  return (
    (screenWidth -
      PROFILE_GRID_PADDING * 2 -
      PROFILE_GRID_GAP * (PROFILE_GRID_COLUMNS - 1)) /
    PROFILE_GRID_COLUMNS
  );
}

export function formatProfileCount(count: number): string {
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

export function memoryLabel(timestamp: string): string {
  const age = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(age) || age < 0) return "New";
  const days = Math.floor(age / 86_400_000);
  if (days <= 0) return "Today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

type ProfileActionProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

export function ProfileActionButton({
  label,
  icon,
  onPress,
  variant = "primary",
  disabled,
  loading,
  accessibilityLabel,
}: ProfileActionProps) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary ? styles.actionPrimary : styles.actionSecondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={primary ? theme.COLORS.white : FEED.text}
        />
      ) : (
        <Ionicons
          name={icon}
          size={17}
          color={primary ? theme.COLORS.white : FEED.text}
        />
      )}
      <Text
        style={[
          styles.actionText,
          primary ? styles.actionPrimaryText : styles.actionSecondaryText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface ProfileHeaderContentProps {
  avatarUrl: string | null;
  initial: string;
  displayName: string;
  username: string;
  bio: string | null;
  isVerified?: boolean;
  postCount: number;
  followers: number;
  following: number;
  actions: ReactNode;
  memories: SocialPost[];
  filter: ProfileFilter;
  onFilterChange: (filter: ProfileFilter) => void;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
}

/** Shared, hook-free profile header used by both my profile and public profiles. */
export function ProfileHeaderContent({
  avatarUrl,
  initial,
  displayName,
  username,
  bio,
  isVerified,
  postCount,
  followers,
  following,
  actions,
  memories,
  filter,
  onFilterChange,
  onFollowersPress,
  onFollowingPress,
}: ProfileHeaderContentProps) {
  const followersStat = (
    <>
      <Text style={styles.statValue}>{formatProfileCount(followers)}</Text>
      <Text style={styles.statLabel}>Followers</Text>
    </>
  );
  const followingStat = (
    <>
      <Text style={styles.statValue}>{formatProfileCount(following)}</Text>
      <Text style={styles.statLabel}>Following</Text>
    </>
  );

  return (
    <View style={styles.profileHeader}>
      <View style={styles.avatarRing}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        {isVerified ? (
          <Ionicons name="checkmark-circle" size={17} color={FEED.accent} />
        ) : null}
      </View>
      {username ? <Text style={styles.username}>@{username}</Text> : null}
      {bio ? (
        <Text style={styles.bio} numberOfLines={2}>
          {bio}
        </Text>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatProfileCount(postCount)}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open followers"
          disabled={!onFollowersPress}
          onPress={onFollowersPress}
          style={styles.statItem}
        >
          {followersStat}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open following"
          disabled={!onFollowingPress}
          onPress={onFollowingPress}
          style={styles.statItem}
        >
          {followingStat}
        </Pressable>
      </View>

      <View style={styles.actionsRow}>{actions}</View>

      {memories.length > 0 ? (
        <View style={styles.memoriesSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Memories</Text>
            <Text style={styles.sectionMeta}>
              {formatProfileCount(memories.length)}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.memoriesList}
          >
            {memories.map((post, index) => (
              <Pressable
                key={post.id}
                accessibilityRole="button"
                accessibilityLabel={`Open memory from ${memoryLabel(post.timestamp)}`}
                onPress={() =>
                  router.push(authorFeedParams(username, post.id, index))
                }
                style={({ pressed }) => [
                  styles.memoryItem,
                  pressed && styles.pressed,
                ]}
              >
                <Image
                  source={{ uri: post.imageUrls[0] }}
                  style={styles.memoryImage}
                />
                <Text style={styles.memoryLabel} numberOfLines={1}>
                  {memoryLabel(post.timestamp)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {PROFILE_FILTERS.map((item) => {
          const active = item.key === filter;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onFilterChange(item.key)}
              style={[styles.filter, active && styles.filterActive]}
            >
              <Text
                style={[styles.filterText, active && styles.filterTextActive]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ProfileGridItem({
  post,
  index,
  size,
  username,
}: {
  post: SocialPost;
  index: number;
  size: number;
  username: string;
}) {
  const imageUrl = post.imageUrl ?? post.imageUrls?.[0] ?? "";
  const hasVideo = Boolean(post.videoUrl);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open post by ${post.author.displayName ?? post.author.username}`}
      style={[styles.gridItem, { width: size, height: size }]}
      onPress={() => router.push(authorFeedParams(username, post.id, index))}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.gridImage} />
      ) : hasVideo ? (
        <View style={[styles.gridImage, styles.videoTile]}>
          <Ionicons name="play" size={24} color={FEED.text} />
          <Text style={styles.gridTileLabel}>Video</Text>
        </View>
      ) : (
        <View style={[styles.gridImage, styles.textTile]}>
          <Ionicons name="text-outline" size={19} color={FEED.muted} />
          <Text style={styles.textPostContent} numberOfLines={4}>
            {post.content}
          </Text>
        </View>
      )}
      {hasVideo && imageUrl ? (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={10} color={theme.COLORS.white} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    paddingTop: theme.SPACING.xxl,
    paddingBottom: theme.SPACING.sm,
    backgroundColor: FEED.surface,
  },
  avatarRing: {
    alignSelf: "center",
    width: 94,
    height: 94,
    padding: 3,
    borderRadius: 47,
    borderWidth: 2,
    borderColor: FEED.accent,
    backgroundColor: FEED.surface,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 44,
    backgroundColor: FEED.imageFallback,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FEED.accentSoft,
  },
  avatarInitial: {
    color: FEED.accent,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.xxl,
  },
  displayName: {
    flexShrink: 1,
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -0.3,
  },
  username: {
    marginTop: 2,
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    textAlign: "center",
  },
  bio: {
    marginTop: theme.SPACING.sm,
    marginHorizontal: theme.SPACING.xxxxxl,
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xxxxxl,
    marginTop: theme.SPACING.lg,
  },
  statItem: {
    alignItems: "center",
    minWidth: 58,
  },
  statValue: {
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  statLabel: {
    marginTop: 1,
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.SPACING.md,
    marginTop: theme.SPACING.lg,
    marginHorizontal: theme.SPACING.xxl,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    borderRadius: 12,
    paddingHorizontal: theme.SPACING.sm,
  },
  actionPrimary: {
    backgroundColor: FEED.accent,
  },
  actionSecondary: {
    backgroundColor: FEED.surface,
    borderWidth: 1,
    borderColor: FEED.border,
  },
  actionText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  actionPrimaryText: {
    color: theme.COLORS.white,
  },
  actionSecondaryText: {
    color: FEED.text,
  },
  disabled: {
    opacity: theme.OPACITY.disabled,
  },
  memoriesSection: {
    marginTop: theme.SPACING.xxl,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.xxl,
    marginBottom: theme.SPACING.md,
  },
  sectionTitle: {
    color: FEED.text,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sectionMeta: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  memoriesList: {
    paddingHorizontal: theme.SPACING.xxl,
    gap: theme.SPACING.lg,
  },
  memoryItem: {
    width: 66,
    alignItems: "center",
  },
  memoryImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: FEED.imageFallback,
  },
  memoryLabel: {
    width: 66,
    marginTop: theme.SPACING.xs,
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    textAlign: "center",
  },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  filter: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xl,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  filterActive: {
    backgroundColor: FEED.accent,
  },
  filterText: {
    color: FEED.muted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  filterTextActive: {
    color: theme.COLORS.white,
  },
  gridItem: {
    position: "relative",
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: FEED.imageFallback,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  videoTile: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    backgroundColor: "#E8EAF0",
  },
  gridTileLabel: {
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  textTile: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: theme.SPACING.md,
    backgroundColor: "#F0F1F4",
  },
  textPostContent: {
    color: FEED.secondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
  },
  videoBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,20,0.55)",
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
});
