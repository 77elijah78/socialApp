import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import PostCollection from "@/components/posts/PostCollection";
import { FeedPostSkeleton } from "@/components/ui/Skeleton";
import { COLORS, LAYOUT } from "@/constants/theme";
import { api, ApiError } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { mapPostResponse } from "@/utils/postContracts";
import type { PostResponse, SocialPost } from "@/types";

function SelectedPost({ id }: { id: string }) {
  const token = useAppSelector(state => state.auth.token);
  const tokenRef = useRef(token);
  useLayoutEffect(() => { tokenRef.current = token; }, [token]);
  const [post, setPost] = useState<SocialPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      try {
        if (!tokenRef.current || !id) throw new Error("Sign in to view this post.");
        const response = await api.get<{ success: boolean; data: PostResponse }>(`/posts/${encodeURIComponent(id)}`, tokenRef.current, { signal: abort.signal });
        if (abort.signal.aborted) return;
        if (!response.success || response.data?.id !== id || !response.data.author?.username)
          throw new Error("This post is no longer available.");
        setPost(mapPostResponse(response.data, "author"));
      } catch (cause) {
        if (abort.signal.aborted) return;
        setError(cause instanceof ApiError && (cause.status === 403 || cause.status === 404)
          ? "This post may have been removed or is no longer available to you."
          : cause instanceof Error ? cause.message : "Couldn’t load this post. Please try again.");
      }
    };
    void load();
    return () => abort.abort();
  }, [id, attempt]);

  if (post) return <PostCollection source="author" username={post.author.username} selectedId={post.id} entryPost={post} />;
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={23} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Post</Text>
      </View>
      {error ? <View style={styles.empty} accessibilityRole="alert">
        <Ionicons name="images-outline" size={38} color={COLORS.primary} />
        <Text style={styles.emptyTitle}>Can’t open this post</Text>
        <Text style={styles.message}>{error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry post" onPress={() => { setError(null); setAttempt(value => value + 1); }} style={styles.retry}>
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      </View> : <View style={styles.loading}><FeedPostSkeleton /></View>}
    </SafeAreaView>
  );
}

/** No guessed author, actor-as-author assumption, or scan of every author page.
 * The real post GET resolves the author; the existing collection owns media,
 * comments, mutations, pagination, native transition and selected-item entry. */
export default function ActivityPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = useAppSelector(state => state.auth.user?.id);
  const session = useAppSelector(state => state.notifications.session);
  return <SelectedPost key={`${accountId}:${session}:${id}`} id={id} />;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: LAYOUT.contentPadding, backgroundColor: COLORS.bgWhite },
  back: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  title: { color: COLORS.textPrimary, fontSize: 23, fontWeight: "700" },
  loading: { padding: LAYOUT.contentPadding },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "600" },
  message: { color: COLORS.textSecondary, textAlign: "center", lineHeight: 22 },
  retry: { minHeight: 44, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  link: { color: COLORS.primary, fontWeight: "600" },
});
