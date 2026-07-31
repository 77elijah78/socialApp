import { useState, useEffect, useCallback } from "react";
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
  error: Error | null;
  refresh: () => void;
  hasMore: boolean;
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
    isLiked: false,
    isBookmarked: false,
  };
}

export function usePosts(options: UsePostsOptions = {}): UsePostsReturn {
  const { page: initialPage = 1, limit = 20 } = options;
  const token = useAppSelector((s) => s.auth.token);

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(initialPage);

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
          setPosts((prev) => (page === 1 ? mapped : [...prev, ...mapped]));
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

  const refresh = useCallback(() => {
    setPage(1);
    setHasMore(true);
  }, []);

  return {
    posts,
    loading,
    error,
    refresh,
    hasMore,
  };
}