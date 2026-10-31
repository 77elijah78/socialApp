import type { PostResponse, SocialPost } from "../types";
import { normalizeMediaUrl } from "./mediaUrls";

export type PostSource = "feed" | "saved" | "author";
export interface PostsPage {
  posts: SocialPost[];
  total: number;
  hasMore: boolean;
}
export function mapPostResponse(
  post: PostResponse,
  source: PostSource = "feed",
): SocialPost {
  const imageUrls = (post.imageUrls ?? [])
    .map((url) => normalizeMediaUrl(url))
    .filter((url): url is string => Boolean(url));
  return {
    ...post,
    imageUrls,
    videoUrl: normalizeMediaUrl(post.videoUrl),
    timestamp: new Date(post.createdAt).toISOString(),
    imageUrl: imageUrls[0] ?? "",
    tags: [],
    likeCount: post._count?.likes ?? 0,
    commentCount: post._count?.comments ?? 0,
    _count: {
      likes: post._count?.likes ?? 0,
      comments: post._count?.comments ?? 0,
    },
    shareCount: post.shareCount ?? 0,
    isLiked: post.isLiked ?? false,
    // Membership proves saved=true. Author endpoint's hard-coded false proves nothing.
    isBookmarked:
      source === "saved" || (source === "feed" && post.isSaved === true),
    likeStateKnown: typeof post.isLiked === "boolean",
    saveStateKnown:
      source === "saved" ||
      (source === "feed" && typeof post.isSaved === "boolean"),
  };
}
export function normalizePostsPage(
  response: unknown,
  source: PostSource,
  page: number,
  limit: number,
): PostsPage {
  const value = response as {
    success?: boolean;
    data?: PostResponse[] | { posts: PostResponse[]; total: number };
    meta?: { total: number; hasNext: boolean };
  };
  if (!value?.success) throw new Error("Could not load posts");
  const rawPosts =
    source === "author" && !Array.isArray(value.data)
      ? value.data?.posts
      : value.data;
  const total =
    source === "author" && !Array.isArray(value.data)
      ? value.data?.total
      : value.meta?.total;
  if (
    !Array.isArray(rawPosts) ||
    typeof total !== "number" ||
    !Number.isFinite(total)
  )
    throw new Error("Invalid posts pagination response");
  return {
    posts: rawPosts.map((post) => mapPostResponse(post, source)),
    total,
    hasMore:
      source === "author" ? page * limit < total : value.meta?.hasNext === true,
  };
}
export function uniquePosts(posts: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  return posts.filter(
    (post) => !seen.has(post.id) && Boolean(seen.add(post.id)),
  );
}
export function authorFeedParams(
  username: string,
  postId: string,
  index: number,
  limit = 20,
) {
  return {
    pathname: "/user/[username]/posts" as const,
    params: { username, postId, page: String(Math.floor(index / limit) + 1) },
  };
}
