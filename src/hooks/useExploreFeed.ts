import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import type { SocialPost } from "@/types";
import { getCached, setCached } from "@/utils/queryCache";
import {
  normalizeExplorePage,
  uniquePosts,
  type ExplorePage,
} from "@/utils/postContracts";
import {
  applyPostUpdate,
  subscribePostUpdates,
} from "@/utils/postUpdates";

type Mode = "initial" | "refresh" | "more";
type CachedExplore = {
  posts: SocialPost[];
  nextCursor: string | null;
  hasMore: boolean;
  exhausted: boolean;
  fetchedAt: number;
};
type Options = { limit?: number };

const EMPTY_POSTS: SocialPost[] = [];
const CACHE_TTL = 5 * 60_000;
// A just-fetched snapshot is already ranked and suppressing it immediately on
// re-mount would needlessly consume the server's seen history (and its rate
// limit). Pull-to-refresh remains the explicit way to ask for a new snapshot.
const FRESH_WINDOW = 60_000;

function isExpiredCursor(error: Error): boolean {
  // Structural check: the API layer's error class is not part of the contract.
  return (
    (error as { status?: number }).status === 400 ||
    /cursor/i.test(error.message)
  );
}

/** Cursor-based Explore feed over `GET /posts/explore`.
 *
 * One owner for the ranked snapshot: initial load, explicit refresh, single-
 * flight cursor pagination, account-scope guards, confirmed mutation
 * propagation and a short-lived first-page cache. No fabricated total and no
 * guessed next cursor. */
export function useExploreFeed({ limit = 24 }: Options = {}) {
  const token = useAppSelector((state) => state.auth.token);
  const accountId = useAppSelector((state) => state.auth.user?.id);
  const authReady = Boolean(token && accountId);
  const scopeKey = JSON.stringify([accountId, limit]);
  const [owner, setOwner] = useState(scopeKey);
  const tokenRef = useRef(token);
  useLayoutEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paginating, setPaginating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [paginationError, setPaginationError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [cursorExpired, setCursorExpired] = useState(false);

  const rows = useRef<SocialPost[]>([]);
  const cursor = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const exhaustedRef = useRef(false);
  const session = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const updateVersion = useRef(0);
  const changed = useRef(new Map<string, number>());
  const removed = useRef(new Map<string, number>());
  const cacheKey = `explore:${accountId}:page1`;

  const commit = useCallback((next: SocialPost[]) => {
    rows.current = next;
    setPosts(next);
  }, []);

  const fetchPage = useCallback(
    async (mode: Mode, signal: AbortSignal): Promise<ExplorePage> => {
      const accessToken = tokenRef.current;
      if (!accessToken) throw new Error("Sign in to explore posts");
      const params = new URLSearchParams({ limit: String(limit) });
      if (mode === "more") {
        if (!cursor.current) throw new Error("No more recommendations");
        params.set("cursor", cursor.current);
      } else if (mode === "refresh") {
        params.set("refresh", "true");
      }
      const response = await api.get<unknown>(
        `/posts/explore?${params.toString()}`,
        accessToken,
        { signal },
      );
      return normalizeExplorePage(response, limit);
    },
    [limit],
  );

  const writeCache = useCallback(
    (next: SocialPost[]) => {
      void setCached<CachedExplore>(
        cacheKey,
        {
          posts: next,
          nextCursor: cursor.current,
          hasMore: hasMoreRef.current,
          exhausted: exhaustedRef.current,
          fetchedAt: Date.now(),
        },
        CACHE_TTL,
      );
    },
    [cacheKey],
  );

  const load = useCallback(
    (mode: Mode): Promise<void> => {
      if (mode === "more" && (!cursor.current || !hasMoreRef.current))
        return Promise.resolve();
      if (inFlight.current) return inFlight.current;
      const epoch = session.current;
      const version = updateVersion.current;
      const abort = new AbortController();
      controller.current = abort;
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setPaginating(true);
      if (mode !== "more") setPaginationError(null);
      setCursorExpired(false);
      const work = (async () => {
        try {
          const result = await fetchPage(mode, abort.signal);
          if (epoch !== session.current || abort.signal.aborted) return;
          const currentById = new Map(
            rows.current.map((post) => [post.id, post]),
          );
          const fetched = result.posts.flatMap((post) =>
            (removed.current.get(post.id) ?? 0) > version
              ? []
              : (changed.current.get(post.id) ?? 0) > version &&
                  currentById.has(post.id)
                ? [currentById.get(post.id)!]
                : [post],
          );
          const next =
            mode === "more"
              ? uniquePosts([...rows.current, ...fetched])
              : uniquePosts(fetched);
          cursor.current = result.nextCursor;
          const more = result.hasMore;
          hasMoreRef.current = more;
          exhaustedRef.current = result.exhausted || !more;
          commit(next);
          setHasMore(more);
          setExhausted(exhaustedRef.current);
          setError(null);
          setPaginationError(null);
          // Persist the full loaded page window so returning to Explore renders
          // immediately; the cursor stays valid for up to 15 minutes server-side.
          writeCache(next);
        } catch (cause) {
          if (epoch !== session.current || abort.signal.aborted) return;
          const failure =
            cause instanceof Error ? cause : new Error(String(cause));
          if (mode === "more") {
            setPaginationError(failure);
            setCursorExpired(isExpiredCursor(failure));
          } else {
            setError(failure);
          }
        } finally {
          if (epoch === session.current) {
            inFlight.current = null;
            controller.current = null;
            setLoading(false);
            setRefreshing(false);
            setPaginating(false);
          }
        }
      })();
      inFlight.current = work;
      return work;
    },
    [commit, fetchPage, writeCache],
  );

  useEffect(() => {
    const epoch = ++session.current;
    controller.current?.abort();
    inFlight.current = null;
    changed.current.clear();
    removed.current.clear();
    updateVersion.current = 0;
    cursor.current = null;
    hasMoreRef.current = false;
    exhaustedRef.current = false;
    // Own the external account/resource lifecycle for this feed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    commit([]);
    setOwner(scopeKey);
    setHasMore(false);
    setExhausted(false);
    setCursorExpired(false);
    setError(null);
    setPaginationError(null);
    if (!authReady) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getCached<CachedExplore>(cacheKey).then((cached) => {
      if (cancelled || epoch !== session.current) return;
      if (cached?.posts?.length) {
        const surviving = cached.posts.filter(
          (post) => !removed.current.has(post.id),
        );
        commit(surviving);
        cursor.current = cached.nextCursor;
        hasMoreRef.current = cached.hasMore;
        exhaustedRef.current = cached.exhausted;
        setHasMore(cached.hasMore);
        setExhausted(cached.exhausted);
        setLoading(false);
        if (Date.now() - cached.fetchedAt < FRESH_WINDOW) return;
      }
      void load("initial");
    });
    return () => {
      cancelled = true;
      session.current += 1;
      controller.current?.abort();
    };
  }, [authReady, cacheKey, commit, load, scopeKey]);

  useEffect(
    () =>
      subscribePostUpdates((event) => {
        if (event.accountId !== accountId) return;
        const version = ++updateVersion.current;
        changed.current.set(event.postId, version);
        const touched = rows.current.some(
          (post) => post.id === event.postId,
        );
        if (!touched) return;
        const removeMember = Boolean(event.deleted);
        if (removeMember) removed.current.set(event.postId, version);
        const next = removeMember
          ? rows.current.filter((post) => post.id !== event.postId)
          : rows.current.map((post) => applyPostUpdate(post, event));
        commit(next);
        writeCache(next);
      }),
    [accountId, commit, writeCache],
  );

  const refresh = useCallback(() => load("refresh"), [load]);
  const loadMore = useCallback(() => {
    if (!hasMore || loading || refreshing) return Promise.resolve();
    return load("more");
  }, [hasMore, load, loading, refreshing]);
  const retryPagination = useCallback(
    () => (cursorExpired ? load("refresh") : load("more")),
    [cursorExpired, load],
  );

  return {
    posts: authReady && owner === scopeKey ? posts : EMPTY_POSTS,
    loading: loading || Boolean(authReady && owner !== scopeKey),
    refreshing,
    paginating,
    error,
    paginationError,
    cursorExpired,
    hasMore,
    exhausted,
    refresh,
    loadMore,
    retryPagination,
  };
}

/** Exported for focused contract tests without mounting the whole screen. */
export const EXPLORE_FRESH_WINDOW = FRESH_WINDOW;
export const EXPLORE_CACHE_TTL = CACHE_TTL;
