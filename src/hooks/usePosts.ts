import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { PostResponse, PaginatedResponse, SocialPost } from "@/types";

interface UsePostsOptions {
  page?: number;
  limit?: number;
}

interface UsePostsReturn {
  posts: SocialPost[];
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  loadMore: () => void;
  hasMore: boolean;
  like: (postId: string) => Promise<void>;
  unlike: (postId: string) => Promise<void>;
  save: (postId: string) => Promise<void>;
  unsave: (postId: string) => Promise<void>;
}

function mapPostResponse(post: PostResponse): SocialPost {
  return {
    ...post,
    timestamp: new Date(post.createdAt).toISOString(),
    imageUrl: post.imageUrls[0] ?? "",
    tags: [],
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    shareCount: 0,
    isLiked: post.isLiked,
    isBookmarked: post.isSaved,
  };
}

export function usePosts(options: UsePostsOptions = {}): UsePostsReturn {
  const { page: initialPage = 1, limit = 20 } = options;
  const token = useAppSelector((s) => s.auth.token);

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(initialPage);
  const postsRef = useRef<SocialPost[]>([]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    if (!token) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    let cancelled = false;

    async function fetchPosts() {
      try {
        const data = await api.get<PaginatedResponse<PostResponse>>(
          `/posts/feed?page=${page}&limit=${limit}`,
          token ?? undefined,
        );

        if (!cancelled) {
          const mapped = data.data.map(mapPostResponse);
          if (page === 1) {
            setPosts(mapped);
          } else {
            setPosts((prev) => [...prev, ...mapped]);
          }
          setHasMore(data.page * data.pageSize < data.total);
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

    fetchPosts();

    return () => {
      cancelled = true;
    };
  }, [token, page, limit]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const data = await api.get<PaginatedResponse<PostResponse>>(
        `/posts/feed?page=1&limit=${limit}`,
        token ?? undefined,
      );

      const mapped = data.data.map(mapPostResponse);
      setPosts(mapped);
      setPage(1);
      setHasMore(data.page * data.pageSize < data.total);
      postsRef.current = mapped;
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [token, limit]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
    }
  }, [loading, hasMore]);

  const like = useCallback(async (postId: string) => {
    await api.post(`/posts/${postId}/like`, {}, token ?? undefined);
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, isLiked: true, likeCount: p.likeCount + 1 } : p
    ));
  }, [token]);

  const unlike = useCallback(async (postId: string) => {
    await api.delete(`/posts/${postId}/like`, token ?? undefined);
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, isLiked: false, likeCount: p.likeCount - 1 } : p
    ));
  }, [token]);

  const save = useCallback(async (postId: string) => {
    await api.post(`/posts/${postId}/save`, {}, token ?? undefined);
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, isBookmarked: true } : p
    ));
  }, [token]);

  const unsave = useCallback(async (postId: string) => {
    await api.delete(`/posts/${postId}/save`, token ?? undefined);
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, isBookmarked: false } : p
    ));
  }, [token]);

  return {
    posts,
    loading,
    refreshing,
    error,
    refresh,
    loadMore,
    hasMore,
    like,
    unlike,
    save,
    unsave,
  };
}
