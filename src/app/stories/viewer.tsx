import React, { useEffect, useState, useCallback } from "react";
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
import { api } from "@/services/api";
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
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType as "image" | "video",
    caption: story.caption,
    createdAt: new Date(story.createdAt),
    expiresAt: new Date(story.expiresAt),
    isViewed: story.views.some((v) => v.viewerId === currentUserId),
    viewsCount: story.views.length,
  };
}

let storyCache: StoryItem[] = [];
let storyCacheTime: number = 0;
const CACHE_TTL = 30 * 1000;

export default function StoryViewerScreen() {
  const params = useLocalSearchParams<{ index?: string; storyId?: string }>();
  const requestedIndex = params.index ? parseInt(params.index, 10) : 0;
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const [stories, setStories] = useState<StoryItem[]>(() => {
    const isFresh = Date.now() - storyCacheTime < CACHE_TTL;
    return isFresh ? storyCache : [];
  });
  const [loading, setLoading] = useState(stories.length > 0 ? false : true);
  const sharedIndex = params.storyId
    ? stories.findIndex((story) => story.id === params.storyId)
    : -1;
  const initialIndex =
    sharedIndex >= 0
      ? sharedIndex
      : Math.max(0, Number.isFinite(requestedIndex) ? requestedIndex : 0);

  useEffect(() => {
    if (!token || stories.length > 0) return;

    let cancelled = false;

    api
      .get<{ success: boolean; data: BackendStory[] }>("/posts/stories", token)
      .then((response) => {
        if (!cancelled) {
          const mapped = response.data.map((s) =>
            mapBackendStory(s, currentUserId),
          );
          storyCache = mapped;
          storyCacheTime = Date.now();
          setStories(mapped);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error("Failed to load stories:", err?.message ?? err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, stories.length, currentUserId]);

  const { openShare } = useOverlay();

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleStoryViewed = useCallback(
    (storyId: string, isViewed: boolean) => {
      setStories((prev) =>
        prev.map((s) => (s.id === storyId ? { ...s, isViewed } : s)),
      );
    },
    [],
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
