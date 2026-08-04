import { useState, useEffect, useCallback } from "react";
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

export function useStories() {
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [groupedStories, setGroupedStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStories = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get<{
        success: boolean;
        data: BackendStory[];
      }>("/posts/stories", token);

      const mapped = response.data.map((s) => mapBackendStory(s, currentUserId));

      setStories(mapped);

      // Group by user — keep latest story per user (for ring display)
      const latestByUser = new Map<string, StoryItem>();
      for (const s of mapped) {
        const existing = latestByUser.get(s.userId);
        if (!existing || new Date(s.createdAt) > new Date(existing.createdAt)) {
          latestByUser.set(s.userId, s);
        }
      }

      // Sort: "me" first, then by createdAt desc
      const grouped = Array.from(latestByUser.values()).sort((a, b) => {
        if (a.userId === "me") return -1;
        if (b.userId === "me") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setGroupedStories(grouped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [token, currentUserId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const response = await api.get<{
          success: boolean;
          data: BackendStory[];
        }>("/posts/stories", token);

        if (!cancelled) {
          const mapped = response.data.map((s) => mapBackendStory(s, currentUserId));
          setStories(mapped);

          // Group by user — keep latest story per user
          const latestByUser = new Map<string, StoryItem>();
          for (const s of mapped) {
            const existing = latestByUser.get(s.userId);
            if (!existing || new Date(s.createdAt) > new Date(existing.createdAt)) {
              latestByUser.set(s.userId, s);
            }
          }

          const grouped = Array.from(latestByUser.values()).sort((a, b) => {
            if (a.userId === "me") return -1;
            if (b.userId === "me") return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          setGroupedStories(grouped);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [token, currentUserId]);

  // Update a story's viewed status (for "me" user's own stories)
  const updateStoryViewed = useCallback((storyId: string, isViewed: boolean) => {
    setStories((prev) =>
      prev.map((s) => (s.id === storyId ? { ...s, isViewed } : s))
    );
    setGroupedStories((prev) =>
      prev.map((s) => {
        if (s.userId === stories.find((st) => st.id === storyId)?.userId) {
          return { ...s, isViewed };
        }
        return s;
      })
    );
  }, [stories]);

  // Count stories per user (for badge display)
  const storyCounts: Record<string, number> = {};
  for (const s of stories) {
    storyCounts[s.userId] = (storyCounts[s.userId] ?? 0) + 1;
  }

  return {
    stories,
    groupedStories,
    storyCounts,
    loading,
    error,
    refetch: fetchStories,
    updateStoryViewed,
  };
}
