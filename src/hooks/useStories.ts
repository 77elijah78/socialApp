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

  return { stories, loading, error, refetch: fetchStories };
}
