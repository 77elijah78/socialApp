import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { api } from "../services/api";
import { useAppSelector } from "../store/hooks";
import type { Comment, PostOneResponse } from "../types";
import { publishPostUpdate } from "../utils/postUpdates";

const EMPTY_COMMENTS: Comment[] = [];
type WireComment = Partial<Comment> &
  Pick<Comment, "id" | "content" | "createdAt">;
export function normalizeComment(raw: WireComment, postId: string): Comment {
  const authorId = raw.authorId || raw.author?.id;
  if (
    !raw.id ||
    !authorId ||
    typeof raw.content !== "string" ||
    !Number.isFinite(new Date(raw.createdAt).getTime()) ||
    (raw.postId && raw.postId !== postId)
  )
    throw new Error("Invalid comment response");
  return { ...raw, authorId, postId, repliedToId: raw.repliedToId ?? null };
}

/** Real confirmed comments. Backend currently returns only the oldest 20 and
 * exposes no comment-like/delete/pagination contract. Never simulate those. */
export function usePostComments(
  postId: string | null | undefined,
  openSequence = 0,
) {
  const token = useAppSelector((state) => state.auth.token);
  const accountId = useAppSelector((state) => state.auth.user?.id);
  const authReady = Boolean(accountId && token);
  const scopeKey = JSON.stringify([accountId, postId, openSequence]);
  const [owner, setOwner] = useState(scopeKey);
  const tokenRef = useRef(token);
  useLayoutEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(0);
  const active = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const mutation = useRef(0);
  const knownIds = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const accessToken = tokenRef.current;
    if (!postId || !accessToken) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const epoch = session.current;
    const version = mutation.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{
        success: boolean;
        data: PostOneResponse;
      }>(`/posts/${encodeURIComponent(postId)}`, accessToken, {
        signal: controller.signal,
      });
      if (!response.success || !response.data)
        throw new Error("Could not load comments");
      const fetched = (response.data.comments ?? []).map((comment) =>
        normalizeComment(comment, postId),
      );
      if (
        !controller.signal.aborted &&
        epoch === session.current &&
        version === mutation.current
      ) {
        knownIds.current = new Set(fetched.map((comment) => comment.id));
        setComments(fetched);
        setTotal(Math.max(fetched.length, response.data._count?.comments ?? 0));
      }
    } catch (cause) {
      if (!controller.signal.aborted && epoch === session.current)
        setError(
          cause instanceof Error ? cause.message : "Could not load comments",
        );
    } finally {
      if (active.current === controller && epoch === session.current) {
        active.current = null;
        setLoading(false);
      }
    }
  }, [postId]);

  useEffect(() => {
    session.current += 1;
    sending.current = false;
    knownIds.current.clear();
    // Reset only when this post/account/sheet session changes, not on typing.
    // This effect owns the external post/account request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComments([]);
    setOwner(scopeKey);
    setTotal(0);
    setError(null);
    if (postId && authReady) void refresh();
    else setLoading(false);
    return () => {
      session.current += 1;
      active.current?.abort();
      active.current = null;
    };
  }, [authReady, postId, scopeKey, refresh]);

  const send = useCallback(
    async (content: string, repliedToId: string | null): Promise<void> => {
      const accessToken = tokenRef.current;
      if (!accessToken || !accountId || !postId)
        throw new Error("Sign in to comment");
      if (sending.current) throw new Error("A comment is already being sent");
      if (!content.trim()) return;
      if (
        repliedToId &&
        !comments.some((comment) => comment.id === repliedToId)
      )
        throw new Error(
          "The original comment is no longer available. Cancel the reply and try again.",
        );
      sending.current = true;
      const epoch = session.current;
      try {
        const response = await api.post<{
          success: boolean;
          data: WireComment;
        }>(
          `/posts/${encodeURIComponent(postId)}/comments`,
          { content: content.trim(), repliedToId },
          accessToken,
        );
        if (!response.success || !response.data)
          throw new Error("Comment was not confirmed by the server");
        const saved = normalizeComment(response.data, postId);
        if (epoch !== session.current) return;
        if (knownIds.current.has(saved.id)) return;
        knownIds.current.add(saved.id);
        mutation.current += 1;
        setComments((previous) =>
          previous.some((comment) => comment.id === saved.id)
            ? previous
            : [...previous, saved],
        );
        setTotal((previous) => previous + 1);
        publishPostUpdate({ postId, accountId, commentAdded: true });
      } finally {
        if (epoch === session.current) sending.current = false;
      }
    },
    [accountId, comments, postId],
  );

  return {
    comments: authReady && owner === scopeKey ? comments : EMPTY_COMMENTS,
    total: owner === scopeKey ? total : 0,
    loading: loading || Boolean(authReady && postId && owner !== scopeKey),
    error,
    refresh,
    send,
  };
}
