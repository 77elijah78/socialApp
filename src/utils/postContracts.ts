import type { PostResponse, SocialPost } from "../types";
import { normalizeMediaUrl } from "./mediaUrls";

export type PostSource = "feed" | "saved" | "author";
/** Explore is a read-only ranked source with its own cursor envelope. */
export type PostViewSource = PostSource | "explore";
export interface PostsPage {
  posts: SocialPost[];
  total: number;
  hasMore: boolean;
}

/** Explore uses an opaque server cursor, not a numeric page. */
export interface ExplorePage {
  posts: SocialPost[];
  nextCursor: string | null;
  hasMore: boolean;
  exhausted: boolean;
  expiresAt: string | null;
  algorithmVersion: number | null;
}

function engagementCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

export function mapPostResponse(
  post: PostResponse,
  source: PostViewSource = "feed",
): SocialPost {
  const imageUrls = (post.imageUrls ?? [])
    .map((url) => normalizeMediaUrl(url))
    .filter((url): url is string => Boolean(url));
  // Prefer canonical engagement fields; fall back to legacy `_count` and
  // `isLiked`/`isSaved` so older servers keep working.
  const likes = engagementCount(post.likesCount) ?? post._count?.likes ?? 0;
  const comments =
    engagementCount(post.commentsCount) ?? post._count?.comments ?? 0;
  const likedFlag =
    typeof post.isLikedByCurrentUser === "boolean"
      ? post.isLikedByCurrentUser
      : typeof post.isLiked === "boolean"
        ? post.isLiked
        : undefined;
  const savedFlag =
    typeof post.isBookmarkedByCurrentUser === "boolean"
      ? post.isBookmarkedByCurrentUser
      : typeof post.isSaved === "boolean"
        ? post.isSaved
        : undefined;
  return {
    ...post,
    imageUrls,
    videoUrl: normalizeMediaUrl(post.videoUrl),
    timestamp: new Date(post.createdAt).toISOString(),
    imageUrl: imageUrls[0] ?? "",
    tags: post.tags ?? [],
    likeCount: likes,
    commentCount: comments,
    likesCount: likes,
    commentsCount: comments,
    _count: {
      likes,
      comments,
    },
    shareCount: post.shareCount ?? 0,
    isLiked: likedFlag ?? false,
    // Membership proves saved=true. The legacy author endpoint's hard-coded
    // `isSaved:false` proves nothing.
    isBookmarked:
      source === "saved" || savedFlag === true,
    likeStateKnown: typeof likedFlag === "boolean",
    // Canonical bookmarks flag or a saved collection membership is
    // authoritative; the legacy feed flag only when the server sends it.
    saveStateKnown:
      source === "saved" ||
      typeof post.isBookmarkedByCurrentUser === "boolean" ||
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
/** Validates the real `GET /posts/explore` cursor envelope. No fabricated
 * total/count is derived: the server intentionally returns only hasNext,
 * nextCursor, expiry and exhaustion for a ranked snapshot. */
export function normalizeExplorePage(
  response: unknown,
  limit: number,
): ExplorePage {
  const value = response as {
    success?: boolean;
    data?: PostResponse[];
    meta?: {
      limit?: number;
      hasNext?: boolean;
      nextCursor?: string | null;
      expiresAt?: string | null;
      exhausted?: boolean;
      algorithmVersion?: number;
    };
  };
  if (!value?.success) throw new Error("Could not load Explore");
  if (!Array.isArray(value.data))
    throw new Error("Invalid Explore response");
  const nextCursor =
    typeof value.meta?.nextCursor === "string" && value.meta.nextCursor
      ? value.meta.nextCursor
      : null;
  const exhausted = value.meta?.exhausted === true;
  return {
    posts: value.data.map((post) => mapPostResponse(post, "explore")),
    nextCursor,
    // A cursor is required to continue; never guess another page.
    hasMore: value.meta?.hasNext === true && Boolean(nextCursor) && !exhausted,
    exhausted,
    expiresAt:
      typeof value.meta?.expiresAt === "string" ? value.meta.expiresAt : null,
    algorithmVersion:
      typeof value.meta?.algorithmVersion === "number"
        ? value.meta.algorithmVersion
        : null,
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
