import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { PostResponse, PaginatedResponse, SocialPost } from "@/types";
import { getCached, setCached } from "@/utils/queryCache";

const FEED_CACHE_KEY = "feed:page1";
const FEED_CACHE_TTL = 5 * 60_000;

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
  loadMore: () => Promise<void>;
  hasMore: boolean;
  paginating: boolean;
  paginationError: Error | null;
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
    shareCount: post.shareCount ?? 0,
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
  const [paginating, setPaginating] = useState(false);
  const [paginationError, setPaginationError] = useState<Error | null>(null);
  const [page, setPage] = useState(initialPage);
  const postsRef = useRef<SocialPost[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const cached = await getCached<SocialPost[]>(FEED_CACHE_KEY);
        if (cached && !cancelled) {
          setPosts(cached);
          hydratedRef.current = true;
          setLoading(false);
        }
      } catch {
        // ignore cache errors
      }
    }

    hydrate();

    async function fetchPosts() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.get<PaginatedResponse<PostResponse>>(
          `/posts/feed?page=${page}&limit=${limit}`,
          token ?? undefined,
        );

        if (!cancelled) {
          const mapped = data.data.map(mapPostResponse);
          if (page === 1) {
            setPosts(mapped);
            setCached(FEED_CACHE_KEY, mapped, FEED_CACHE_TTL);
          } else {
            setPosts((prev) => [...prev, ...mapped]);
          }
          setHasMore(data.page * data.pageSize < data.total);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          if (!hydratedRef.current) {
            setLoading(false);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          hydratedRef.current = false;
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
      setCached(FEED_CACHE_KEY, mapped, FEED_CACHE_TTL);
      setError(null);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [token, limit]);

  const loadMore = useCallback(async () => {
    if (paginating || !hasMore || loading) {
      return;
    }

    setPaginating(true);
    setPaginationError(null);

    try {
      const data = await api.get<PaginatedResponse<PostResponse>>(
        `/posts/feed?page=${page + 1}&limit=${limit}`,
        token ?? undefined,
      );

      const mapped = data.data.map(mapPostResponse);
      setPosts((prev) => [...prev, ...mapped]);
      setHasMore(data.page * data.pageSize < data.total);
      setPage((prev) => prev + 1);
    } catch (err) {
      setPaginationError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPaginating(false);
    }
  }, [paginating, hasMore, loading, page, limit, token]);

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
    paginating,
    paginationError,
    like,
    unlike,
    save,
    unsave,
  };
}
