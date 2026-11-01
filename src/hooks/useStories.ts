import { normalizeMediaUrl } from "@/utils/mediaUrls";
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { api, getAuthGeneration } from "@/services/api";
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

const EMPTY_STORIES: StoryItem[] = [];
const STORIES_ENDPOINT = "/posts/stories" as const;

function mapBackendStory(story: BackendStory, currentUserId: string): StoryItem {
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

  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  const hasToken = Boolean(token);
  const scopeKey = `${currentUserId}:${getAuthGeneration()}`;
  const scope = useMemo(() => ({ ownerId: currentUserId, key: scopeKey }), [currentUserId, scopeKey]);
  const activeScope = useRef<typeof scope | null>(scope);
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => { activeScope.current = null; };
  }, [scope]);
  const [feed, setFeed] = useState({ key: scopeKey, items: EMPTY_STORIES, loading: true, error: null as Error | null });
  const stories = hasToken && feed.key === scopeKey ? feed.items : EMPTY_STORIES;
  const loading = hasToken && Boolean(currentUserId) && (feed.key !== scopeKey || feed.loading);
  const error = hasToken && feed.key === scopeKey ? feed.error : null;
  const refetch = useCallback(() => {
    if (!hasToken || !scope.ownerId) return Promise.resolve();
    const generation = getAuthGeneration();
    const current = () => activeScope.current === scope && generation === getAuthGeneration();
    return api.get<{ success: boolean; data: BackendStory[] }>(STORIES_ENDPOINT, tokenRef.current ?? undefined)
      .then(response => {
        if (!current()) return;
        const mapped = response.data.map(story => mapBackendStory(story, scope.ownerId));
        setFeed({ key: scope.key, items: mapped, loading: false, error: null });
        return mapped;
      })
      .catch(err => {
        if (!current()) return;
        setFeed(previous => ({ key: scope.key, items: previous.key === scope.key ? previous.items : [],
          loading: false, error: err instanceof Error ? err : new Error(String(err)) }));
      });
  }, [hasToken, scope]);
  useEffect(() => {
    void refetch();
  }, [refetch]);

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
    if (activeScope.current !== scope) return;
    setFeed(previous => {
      if (previous.key !== scope.key) return previous;
      const target = previous.items.find(story => story.id === storyId);
      if (!target) return previous;
      return { ...previous, items: previous.items.map(story => story.userId === target.userId ? { ...story, isViewed } : story) };
    });
  }, [scope]);

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
