import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import PostCard from "@/components/feed/PostCard";
import { usePosts } from "@/hooks/usePosts";
import { useOverlay } from "@/providers/OverlayProvider";
import { showAppDialog } from "@/services/AppDialogService";
import * as theme from "@/constants/theme";
import type { SocialPost } from "@/types";

const PAGE_SIZE = 20;
type Props = {
  source: "saved" | "author";
  username?: string;
  selectedId?: string;
  initialPage?: number;
  entryPost?: SocialPost;
};

/** A bounded page is measured once for a variable-height selected-item entry.
 * No fixed-height guess, eager traversal of all author pages, or timer scrolling.
 * Older/newer pages use FlatList's MVCP; no manual pagination correction. */
export default function PostCollection({
  source,
  username,
  selectedId,
  initialPage = 1,
  entryPost,
}: Props) {
  const feed = usePosts({
    source,
    username,
    page: initialPage,
    limit: PAGE_SIZE,
    entryPost,
  });
  const { openComments, openShare, openActionMenu } = useOverlay();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<"grid" | "list">(
    source === "saved" ? "grid" : "list",
  );
  const [anchored, setAnchored] = useState(!selectedId);
  const [notice, setNotice] = useState<string | null>(null);
  const list = useRef<FlatList<SocialPost>>(null);
  const heights = useRef(new Map<string, number>());
  const anchorDone = useRef(!selectedId);
  const viewportReady = useRef(false);
  const tileWidth =
    (width - theme.LAYOUT.contentPadding * 2 - theme.SPACING.sm * 2) / 3;

  const positionSelected = useCallback(() => {
    if (
      anchorDone.current ||
      !selectedId ||
      !viewportReady.current ||
      !list.current
    )
      return;
    const index = feed.posts.findIndex((post) => post.id === selectedId);
    if (index < 0) return;
    let offset = 0;
    for (const post of feed.posts.slice(0, index)) {
      const height = heights.current.get(post.id);
      if (height === undefined) return;
      offset += height;
    }
    anchorDone.current = true;
    list.current.scrollToOffset({ offset, animated: false });
    setAnchored(true);
  }, [feed.posts, selectedId]);

  useEffect(() => {
    if (!selectedId || feed.loading || feed.error || anchorDone.current) return;
    if (!feed.posts.some((post) => post.id === selectedId)) {
      anchorDone.current = true;
      // The external page response can invalidate a selected native-list anchor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnchored(true);
      setNotice(
        "The selected post is no longer on this page. It may have been removed or the author's posts may have changed. Browse the surrounding posts below.",
      );
    }
  }, [feed.error, feed.loading, feed.posts, selectedId]);

  const menu = useCallback(
    (postId: string) => {
      const post = feed.posts.find((item) => item.id === postId);
      openActionMenu([
        {
          key: "save",
          icon: "bookmark-outline",
          label: post?.isBookmarked ? "Remove bookmark" : "Save post",
          onPress: () => {
            void (
              post?.isBookmarked ? feed.unsave(postId) : feed.save(postId)
            ).catch((error) =>
              showAppDialog({
                title: "Couldn’t update bookmark",
                message: error.message,
                tone: "error",
              }),
            );
          },
        },
        {
          key: "share",
          icon: "share-outline",
          label: "Share post",
          onPress: () => openShare({ postId }),
        },
      ]);
    },
    [feed, openActionMenu, openShare],
  );

  const renderItem = ({ item }: { item: SocialPost }) =>
    mode === "grid" ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View comments on ${item.author.username}'s post`}
        onPress={() => openComments(item.id)}
        style={[styles.tile, { width: tileWidth, height: tileWidth }]}
      >
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.textTile}>
            <Ionicons
              name={
                item.videoUrl
                  ? "videocam-outline"
                  : "chatbubble-ellipses-outline"
              }
              size={20}
              color={theme.COLORS.primary}
            />
            <Text style={styles.tileCopy} numberOfLines={4}>
              {item.content || "Video post"}
            </Text>
          </View>
        )}
        <View style={styles.tileMeta}>
          <Ionicons name="bookmark" size={12} color={theme.COLORS.white} />
          <Text style={styles.tileMetaText}>{item.commentCount} comments</Text>
        </View>
      </Pressable>
    ) : (
      <View
        style={styles.feedItem}
        onLayout={
          !anchored
            ? (event) => {
                heights.current.set(item.id, event.nativeEvent.layout.height);
                positionSelected();
              }
            : undefined
        }
      >
        {feed.entrySeparate && item.id === entryPost?.id ? (
          <Text style={styles.entryLabel}>SELECTED POST · MORE FROM THIS AUTHOR BELOW</Text>
        ) : null}
        <PostCard
          post={item}
          onLike={(id, liked) => (liked ? feed.like(id) : feed.unlike(id))}
          onBookmark={(id, saved) => (saved ? feed.save(id) : feed.unsave(id))}
          onComment={openComments}
          onShare={(postId) => openShare({ postId })}
          onUserPress={(name) => router.push(`/user/${name}`)}
          onMenuPress={menu}
        />
      </View>
    );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Ionicons
            name="chevron-back"
            size={23}
            color={theme.COLORS.textPrimary}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>
            {source === "saved" ? "YOUR COLLECTION" : "AUTHOR FEED"}
          </Text>
          <Text numberOfLines={1} style={styles.title}>
            {source === "saved" ? "Bookmarks" : `@${username}`}
          </Text>
        </View>
        <View style={styles.headerMark}>
          <Ionicons
            name={source === "saved" ? "bookmark" : "grid"}
            size={19}
            color={theme.COLORS.primary}
          />
        </View>
      </View>
      <View style={styles.toolbar}>
        <Text style={styles.subtitle}>
          {entryPost && feed.error && !feed.total ? "More from this author" : `${feed.total} ${source === "saved" ? "saved posts" : "posts"}`}
        </Text>
        {source === "saved" ? (
          <View style={styles.switch}>
            {(["grid", "list"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Show ${value}`}
                accessibilityState={{ selected: mode === value }}
                onPress={() => setMode(value)}
                style={[styles.mode, mode === value && styles.modeActive]}
              >
                <Ionicons
                  name={value === "grid" ? "grid-outline" : "list-outline"}
                  size={19}
                  color={
                    mode === value
                      ? theme.COLORS.primary
                      : theme.COLORS.textMuted
                  }
                />
              </Pressable>
            ))}
          </View>
        ) : feed.hasPrevious ? (
          <Pressable
            disabled={feed.paginating || !anchored}
            onPress={() => void feed.loadPrevious()}
          >
            <Text style={styles.link}>Load newer posts</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {feed.error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void feed.refresh()}
          style={styles.notice}
        >
          <Text style={styles.link}>{feed.error.message} · Retry</Text>
        </Pressable>
      ) : null}
      {feed.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.COLORS.primary} />
          <Text style={styles.subtitle}>Loading posts…</Text>
        </View>
      ) : (
        <>
          {!anchored && !feed.error ? (
            <View pointerEvents="none" style={styles.anchorLoading}>
              <ActivityIndicator color={theme.COLORS.primary} />
              <Text style={styles.subtitle}>Opening selected post…</Text>
            </View>
          ) : null}
          <FlatList
            key={mode}
            ref={list}
            data={feed.posts}
            renderItem={renderItem}
            keyExtractor={(post) => post.id}
            numColumns={mode === "grid" ? 3 : 1}
            columnWrapperStyle={mode === "grid" ? styles.gridRow : undefined}
            style={{ flex: 1, opacity: anchored || feed.error ? 1 : 0 }}
            contentContainerStyle={styles.content}
            initialNumToRender={selectedId ? PAGE_SIZE : 8}
            maxToRenderPerBatch={8}
            windowSize={7}
            onLayout={() => {
              viewportReady.current = true;
              positionSelected();
            }}
            maintainVisibleContentPosition={
              source === "author" && anchored
                ? { minIndexForVisible: 0 }
                : undefined
            }
            refreshing={feed.refreshing}
            onRefresh={() => void feed.refresh()}
            onEndReached={() => {
              if (anchored && feed.hasMore) void feed.loadMore();
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              !feed.error ? (
                <View style={styles.center}>
                  <Ionicons
                    name={
                      source === "saved" ? "bookmark-outline" : "images-outline"
                    }
                    size={42}
                    color={theme.COLORS.primary}
                  />
                  <Text style={styles.emptyTitle}>
                    {source === "saved"
                      ? "Keep what inspires you"
                      : "No posts yet"}
                  </Text>
                  <Text style={styles.subtitle}>
                    {source === "saved"
                      ? "Save a post to find it here later."
                      : "This author hasn't shared any posts."}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              <View style={styles.footer}>
                {feed.paginating ? (
                  <ActivityIndicator color={theme.COLORS.primary} />
                ) : null}
                {feed.paginationError ? (
                  <Pressable onPress={() => void feed.retryPagination()}>
                    <Text style={styles.link}>
                      {feed.paginationError.message} · Retry page
                    </Text>
                  </Pressable>
                ) : null}
                {source === "saved" &&
                mode === "list" &&
                feed.posts.some((post) => !post.likeStateKnown) ? (
                  <Text style={styles.subtitle}>
                    This server does not return your existing like status for
                    saved posts. Like counts are real; tapping Like confirms the
                    state with the server.
                  </Text>
                ) : null}
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.COLORS.bgLight },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    color: theme.COLORS.textSecondary,
    fontWeight: "600",
  },
  title: { fontSize: 25, fontWeight: "700", color: theme.COLORS.textPrimary },
  headerMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
  },
  subtitle: { color: theme.COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  switch: {
    flexDirection: "row",
    backgroundColor: theme.COLORS.bgInput,
    borderRadius: 12,
    padding: 3,
  },
  mode: {
    minWidth: 44,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  modeActive: { backgroundColor: theme.COLORS.bgWhite },
  content: { flexGrow: 1, paddingBottom: theme.SPACING.xxxxxl },
  gridRow: {
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    marginBottom: theme.SPACING.sm,
  },
  tile: {
    borderRadius: theme.BORDER_RADIUS.lg,
    overflow: "hidden",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  textTile: { flex: 1, padding: theme.SPACING.md, gap: theme.SPACING.sm },
  tileCopy: { fontSize: 12, color: theme.COLORS.textPrimary, lineHeight: 17 },
  tileMeta: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileMetaText: { fontSize: 10, color: theme.COLORS.white },
  feedItem: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingBottom: theme.SPACING.lg,
  },
  entryLabel: { color: theme.COLORS.textSecondary, fontSize: 10, lineHeight: 16, letterSpacing: 0.5, marginBottom: theme.SPACING.md },
  link: { color: theme.COLORS.primary, fontSize: 13, lineHeight: 20 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.SPACING.xxl,
    gap: theme.SPACING.md,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "600",
    color: theme.COLORS.textPrimary,
  },
  footer: { padding: theme.LAYOUT.contentPadding, gap: theme.SPACING.md },
  notice: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
    fontSize: 13,
    color: theme.COLORS.textSecondary,
    lineHeight: 19,
  },
  anchorLoading: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.SPACING.md,
  },
});
