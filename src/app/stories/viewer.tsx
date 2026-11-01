import { normalizeMediaUrl } from "@/utils/mediaUrls";
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import StoryViewer from "@/components/stories/StoryViewer";
import { StoryItem } from "@/types";
import { api, getAuthGeneration } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { useOverlay } from "@/providers/OverlayProvider";

interface BackendStory {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: string;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  views: { viewerId: string }[];
}

function mapBackendStory(
  story: BackendStory,
  currentUserId: string,
): StoryItem {
  return {
    id: story.id,
    userId: story.user.id,
    username: story.user.username,
    displayName: story.user.displayName ?? story.user.username,
    avatarUrl: story.user.avatarUrl,
    mediaUrl: normalizeMediaUrl(story.mediaUrl) ?? "",
    mediaType: story.mediaType.toLowerCase() === "video" ? "video" : "image",
    caption: story.caption,
    createdAt: new Date(story.createdAt),
    expiresAt: new Date(story.expiresAt),
    isViewed: story.views.some((v) => v.viewerId === currentUserId),
    viewsCount: story.views.length,
  };
}

let storyCacheOwner: string | null = null;
let storyCacheGeneration = -1;
let storyCache: StoryItem[] = [];
let storyCacheTime: number = 0;
const CACHE_TTL = 30 * 1000;

export default function StoryViewerScreen() {
  const params = useLocalSearchParams<{ index?: string; storyId?: string }>();
  const requestedIndex = params.index ? parseInt(params.index, 10) : 0;
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  const hasToken = Boolean(token);
  const scopeKey = `${currentUserId}:${getAuthGeneration()}`;
  const [feed, setFeed] = useState(() => {
    const cached = storyCache.length > 0 && storyCacheOwner === currentUserId && storyCacheGeneration === getAuthGeneration() && Date.now() - storyCacheTime < CACHE_TTL;
    return { key: scopeKey, stories: cached ? storyCache : [] as StoryItem[], loading: !cached };
  });
  const stories = hasToken && feed.key === scopeKey ? feed.stories : [];
  const loading = hasToken && Boolean(currentUserId) && (feed.key !== scopeKey || feed.loading);
  const sharedIndex = params.storyId
    ? stories.findIndex((story) => story.id === params.storyId)
    : -1;
  const initialIndex =
    sharedIndex >= 0
      ? sharedIndex
      : Math.max(0, Number.isFinite(requestedIndex) ? requestedIndex : 0);

  useEffect(() => {
    if (!currentUserId || !hasToken) {
      storyCacheOwner = null;
      storyCache = [];
      storyCacheTime = 0;
      return;
    }
    if (feed.key === scopeKey && !feed.loading) return;
    let cancelled = false;
    const generation = getAuthGeneration();
    const current = () => !cancelled && generation === getAuthGeneration();
    api.get<{ success: boolean; data: BackendStory[] }>("/posts/stories", tokenRef.current ?? undefined)
      .then(response => {
        if (!current()) return;
        const mapped = response.data.map(story => mapBackendStory(story, currentUserId));
        storyCacheOwner = currentUserId;
        storyCacheGeneration = generation;
        storyCache = mapped;
        storyCacheTime = Date.now();
        setFeed({ key: scopeKey, stories: mapped, loading: false });
      })
      .catch(() => {
        if (current()) setFeed({ key: scopeKey, stories: [], loading: false });
      });
    return () => { cancelled = true; };
  }, [currentUserId, hasToken, scopeKey, feed.key, feed.loading]);

  const { openShare } = useOverlay();

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleStoryViewed = useCallback(
    (storyId: string, isViewed: boolean) => {
      setFeed(previous => previous.key !== scopeKey ? previous : {
        ...previous, stories: previous.stories.map(story => story.id === storyId ? { ...story, isViewed } : story),
      });
    },
    [scopeKey],
  );

  if (loading && stories.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <StatusBar
          barStyle="light-content"
          backgroundColor="rgba(0,0,0,0.95)"
        />
      </View>
    );
  }

  if (params.storyId && sharedIndex < 0) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <StatusBar barStyle="light-content" />
        <Text
          accessibilityRole="alert"
          style={{ color: "white", textAlign: "center", padding: 20 }}
        >
          This shared story isn’t available in your stories feed.
        </Text>
        <TouchableOpacity
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Back to conversation"
          style={{ padding: 16 }}
        >
          <Text style={{ color: "white" }}>Back to conversation</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />
      <StoryViewer
        key={currentUserId}
        stories={stories}
        initialIndex={initialIndex}
        onStoryViewed={handleStoryViewed}
        onClose={handleClose}
        onShare={(story) => {
          openShare({ storyId: story.id });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
});
