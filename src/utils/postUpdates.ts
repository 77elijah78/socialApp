import type { SocialPost } from "../types";

export type PostUpdate = {
  postId: string;
  accountId: string;
  patch?: Partial<SocialPost>;
  commentAdded?: boolean;
  deleted?: boolean;
};
const listeners = new Set<(event: PostUpdate) => void>();
/** Confirmed mutations only; transient invalidation, not a second post cache. */
export function publishPostUpdate(event: PostUpdate) {
  for (const listener of listeners) listener(event);
}
export function subscribePostUpdates(listener: (event: PostUpdate) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function applyPostUpdate(
  post: SocialPost,
  event: PostUpdate,
): SocialPost {
  return post.id !== event.postId
    ? post
    : {
        ...post,
        ...event.patch,
        ...(event.commentAdded
          ? {
              commentCount: post.commentCount + 1,
              _count: { ...post._count, comments: post._count.comments + 1 },
            }
          : {}),
      };
}
