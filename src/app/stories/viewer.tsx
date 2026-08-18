import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, StatusBar } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import StoryViewer from "@/components/stories/StoryViewer";
import { StoryItem } from "@/types";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { useShare } from "@/hooks/useShare";

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

function mapBackendStory(story: BackendStory, currentUserId: string): StoryItem {
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
  const params = useLocalSearchParams<{ index?: string }>();
  const initialIndex = params.index ? parseInt(params.index, 10) : 0;
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";
  const { shareStory } = useShare();

  const [stories, setStories] = useState<StoryItem[]>(() => {
    const isFresh = Date.now() - storyCacheTime < CACHE_TTL;
    return isFresh ? storyCache : [];
  });
  const [loading, setLoading] = useState(stories.length > 0 ? false : true);

  useEffect(() => {
    if (!token || stories.length > 0) return;

    let cancelled = false;

    setLoading(true);
    api
      .get<{ success: boolean; data: BackendStory[] }>(
        "/posts/stories",
        token,
      )
      .then((response) => {
        if (!cancelled) {
          const mapped = response.data.map((s) => mapBackendStory(s, currentUserId));
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

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleStoryViewed = useCallback(
    (storyId: string, isViewed: boolean) => {
      setStories((prev) =>
        prev.map((s) => (s.id === storyId ? { ...s, isViewed } : s))
      );
    },
    []
  );

  if (loading && stories.length === 0) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />
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
        onShare={(story) => shareStory({
          id: story.id,
          mediaUrl: story.mediaUrl,
          mediaType: story.mediaType,
          caption: story.caption,
          expiresAt: story.expiresAt,
          user: {
            id: story.userId,
            username: story.username,
            displayName: story.displayName,
            avatarUrl: story.avatarUrl,
          },
        })}
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
