import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { StoryItem } from "@/types";

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

const STORIES_ENDPOINT = "/posts/stories" as const;

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

function computeGrouped(stories: StoryItem[]): StoryItem[] {
  const latestByUser = new Map<string, StoryItem>();
  for (const s of stories) {
    const existing = latestByUser.get(s.userId);
    if (!existing || new Date(s.createdAt) > new Date(existing.createdAt)) {
      latestByUser.set(s.userId, s);
    }
  }

  return Array.from(latestByUser.values()).sort((a, b) => {
    if (a.userId === "me") return -1;
    if (b.userId === "me") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function useStories() {
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    api
      .get<{ success: boolean; data: BackendStory[] }>(STORIES_ENDPOINT, token)
      .then((response) => {
        if (!cancelled) {
          const mapped = response.data.map((s) => mapBackendStory(s, currentUserId));
          setStories(mapped);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, currentUserId]);

  // Derived: one ring per user (latest story), sorted with "me" first
  const groupedStories = useMemo(() => computeGrouped(stories), [stories]);

  // Derived: story count per user (for badge display)
  const storyCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of stories) {
      counts[s.userId] = (counts[s.userId] ?? 0) + 1;
    }
    return counts;
  }, [stories]);

  // When any story from a user is viewed, mark ALL that user's stories as viewed
  const updateStoryViewed = useCallback((storyId: string, isViewed: boolean) => {
    setStories((prev) => {
      const target = prev.find((s) => s.id === storyId);
      if (!target) return prev;

      const userId = target.userId;

      return prev.map((s) =>
        s.userId === userId ? { ...s, isViewed } : s
      );
    });
  }, []);

  const refetch = useCallback(() => {
    if (!token) return Promise.resolve();
    return api
      .get<{ success: boolean; data: BackendStory[] }>(STORIES_ENDPOINT, token)
      .then((response) => {
        const mapped = response.data.map((s) => mapBackendStory(s, currentUserId));
        setStories(mapped);
        return mapped;
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
      });
  }, [token, currentUserId]);

  return {
    stories,
    groupedStories,
    storyCounts,
    loading,
    error,
    refetch,
    updateStoryViewed,
  };
}
