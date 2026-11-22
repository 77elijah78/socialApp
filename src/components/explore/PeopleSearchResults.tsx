import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import * as theme from "@/constants/theme";
import { api } from "@/services/api";
import { showAppDialog } from "@/services/AppDialogService";
import { useAppSelector } from "@/store/hooks";
import { formatCount } from "@/utils/format";

export interface SearchedUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  _count: { followers: number; following: number; posts: number };
  isFollowing: boolean;
}

type Props = {
  /** Already-trimmed, debounced query. The parent owns typing state. */
  query: string;
};

/** Existing `/users/search` people search, kept while the grid is replaced. */
export default function PeopleSearchResults({ query }: Props) {
  const token = useAppSelector((state) => state.auth.token);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string[]>([]);
  const busyRef = useRef<Set<string>>(new Set());
  const requestKey = JSON.stringify([query, attempt, token ?? null]);
  // Results are keyed to the request that produced them, so a new query never
  // renders the previous query's people while its response is in flight.
  const [state, setState] = useState<{
    key: string | null;
    results: SearchedUser[];
    error: string | null;
  }>({ key: null, results: [], error: null });

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ success: boolean; data: SearchedUser[] }>(
      `/users/search?q=${encodeURIComponent(query)}`,
      token ?? undefined,
      { signal: controller.signal },
    ).then((response) => {
      if (controller.signal.aborted) return;
      setState({
        key: requestKey,
        results: Array.isArray(response.data) ? response.data : [],
        error: null,
      });
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      setState({
        key: requestKey,
        results: [],
        error:
          cause instanceof Error
            ? cause.message
            : "Couldn’t search for people. Try again.",
      });
    });
    return () => controller.abort();
  }, [query, requestKey, token]);

  const results = state.key === requestKey ? state.results : [];
  const loading = state.key !== requestKey;
  const error = state.key === requestKey ? state.error : null;

  const handleFollow = useCallback(
    async (user: SearchedUser) => {
      // Ref-based single flight: two taps in the same frame cannot both fire.
      if (busyRef.current.has(user.id)) return;
      busyRef.current.add(user.id);
      setBusy((previous) => [...previous, user.id]);
      try {
        if (user.isFollowing) {
          await api.delete(
            `/users/${encodeURIComponent(user.username)}/follow`,
            token ?? undefined,
          );
        } else {
          await api.post(
            `/users/${encodeURIComponent(user.username)}/follow`,
            {},
            token ?? undefined,
          );
        }
        const isFollowing = !user.isFollowing;
        setState((previous) => ({
          ...previous,
          results: previous.results.map((result) =>
            result.id === user.id
              ? {
                  ...result,
                  isFollowing,
                  _count: {
                    ...result._count,
                    followers: Math.max(
                      0,
                      result._count.followers + (isFollowing ? 1 : -1),
                    ),
                  },
                }
              : result,
          ),
        }));
      } catch (cause) {
        showAppDialog({
          title: user.isFollowing ? "Couldn’t unfollow" : "Couldn’t follow",
          message:
            cause instanceof Error ? cause.message : "Please try again.",
          tone: "error",
        });
      } finally {
        busyRef.current.delete(user.id);
        setBusy((previous) => previous.filter((id) => id !== user.id));
      }
    },
    [token],
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchedUser }) => {
      const displayName = item.displayName || item.username;
      const isBusy = busy.includes(item.id);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${displayName}'s profile`}
          onPress={() =>
            router.push({
              pathname: "/user/[username]",
              params: { username: item.username },
            })
          }
          style={({ pressed }) => [
            styles.row,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.avatarFrame}>
            {item.avatarUrl ? (
              <AuthenticatedImage
                uri={item.avatarUrl}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.copy}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
              {item.isVerified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={theme.COLORS.primary}
                />
              ) : null}
            </View>
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}
            </Text>
            <Text style={styles.stats} numberOfLines={1}>
              {formatCount(item._count.posts)} posts ·{" "}
              {formatCount(item._count.followers)} followers
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.isFollowing
                ? `Unfollow ${displayName}`
                : `Follow ${displayName}`
            }
            accessibilityState={{ busy: isBusy }}
            disabled={isBusy || !token}
            onPress={(event) => {
              event.stopPropagation();
              void handleFollow(item);
            }}
            style={({ pressed }) => [
              styles.follow,
              item.isFollowing && styles.following,
              pressed && styles.pressed,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator
                size="small"
                color={
                  item.isFollowing
                    ? theme.COLORS.primary
                    : theme.COLORS.white
                }
              />
            ) : (
              <Text
                style={[
                  styles.followText,
                  item.isFollowing && styles.followingText,
                ]}
              >
                {item.isFollowing ? "Following" : "Follow"}
              </Text>
            )}
          </Pressable>
        </Pressable>
      );
    },
    [busy, handleFollow, token],
  );

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={theme.COLORS.primary} />
        <Text style={styles.stateText}>Finding your people…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.state} accessibilityRole="alert">
        <View style={styles.stateIcon}>
          <Ionicons
            name="cloud-offline-outline"
            size={24}
            color={theme.COLORS.primary}
          />
        </View>
        <Text style={styles.stateTitle}>Search unavailable</Text>
        <Text style={styles.stateText}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setAttempt((value) => value + 1)}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
      windowSize={7}
      ListHeaderComponent={
        <View style={styles.heading}>
          <Text style={styles.headingTitle}>People</Text>
          <Text style={styles.headingCount}>{results.length} found</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.state}>
          <View style={styles.stateIcon}>
            <Ionicons
              name="people-outline"
              size={24}
              color={theme.COLORS.primary}
            />
          </View>
          <Text style={styles.stateTitle}>No people found</Text>
          <Text style={styles.stateText}>
            Try a different name or username.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingBottom: theme.SPACING.xxxxxxxxl,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.SPACING.md,
  },
  headingTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  headingCount: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    marginBottom: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
  avatarFrame: {
    width: 46,
    height: 46,
    padding: 2,
    borderRadius: 23,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgInput,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
  },
  name: {
    flexShrink: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  username: {
    marginTop: 1,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  stats: {
    marginTop: 2,
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  follow: {
    minWidth: 80,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
  },
  following: {
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  followText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  followingText: {
    color: theme.COLORS.primary,
  },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.xxxxl,
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  stateTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  stateText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    textAlign: "center",
  },
  retry: {
    minHeight: 40,
    paddingHorizontal: theme.SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  retryText: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
});
