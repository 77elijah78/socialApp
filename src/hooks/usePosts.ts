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
  normalizePostsPage,
  uniquePosts,
  type PostSource,
} from "@/utils/postContracts";
import {
  applyPostUpdate,
  publishPostUpdate,
  subscribePostUpdates,
} from "@/utils/postUpdates";

type Options = {
  page?: number;
  limit?: number;
  source?: PostSource;
  username?: string;
  /** Detail entry only; not a guessed canonical author-page position. */
  entryPost?: SocialPost;
};
type FeedCache = { posts: SocialPost[]; total: number; hasMore: boolean };
const EMPTY_POSTS: SocialPost[] = [];
const FEED_TTL = 5 * 60_000;

/** Existing post hook, with the backend's actual array/meta and author envelopes.
 * One fetch owner: page commits never trigger another fetch effect. */
export function usePosts({
  page: initialPage = 1,
  limit = 20,
  source = "feed",
  username,
  entryPost,
}: Options = {}) {
  const token = useAppSelector((state) => state.auth.token);
  const accountId = useAppSelector((state) => state.auth.user?.id);
  const authReady = Boolean(token && accountId);
  const scopeKey = JSON.stringify([
    accountId,
    source,
    username,
    initialPage,
    limit,
    entryPost?.id,
  ]);
  const [owner, setOwner] = useState(scopeKey);
  const entryRef = useRef(entryPost);
  useLayoutEffect(() => { entryRef.current = entryPost; }, [entryPost]);
  const [entrySeparate, setEntrySeparate] = useState(false);
  const tokenRef = useRef(token);
  useLayoutEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const networkCommitted = useRef(false);
  const cacheMeta = useRef({ total: 0, hasMore: false });
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paginating, setPaginating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [paginationError, setPaginationError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [firstPage, setFirstPage] = useState(initialPage);
  const rows = useRef<SocialPost[]>([]);
  const range = useRef({ first: initialPage, last: initialPage });
  const session = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const failedPageMode = useRef<"next" | "previous">("next");
  const updateVersion = useRef(0);
  const changed = useRef(new Map<string, number>());
  const removed = useRef(new Map<string, number>());
  const pendingMutations = useRef(new Map<string, Promise<void>>());
  const cacheKey = `feed:${accountId}:page1`;

  const commit = useCallback((next: SocialPost[]) => {
    rows.current = next;
    setPosts(next);
  }, []);
  const fetchPage = useCallback(
    async (page: number, signal: AbortSignal) => {
      const accessToken = tokenRef.current;
      if (!accessToken) throw new Error("Sign in to view posts");
      const path =
        source === "author"
          ? `/posts/user/${encodeURIComponent(username ?? "")}`
          : `/posts/${source}`;
      const response = await api.get(
        `${path}?page=${page}&limit=${limit}`,
        accessToken,
        { signal },
      );
      return normalizePostsPage(response, source, page, limit);
    },
    [source, username, limit],
  );

  const load = useCallback(
    (mode: "initial" | "refresh" | "next" | "previous"): Promise<void> => {
      if (inFlight.current) return inFlight.current;
      const epoch = session.current;
      const version = updateVersion.current;
      const abort = new AbortController();
      controller.current = abort;
      const page =
        mode === "next"
          ? range.current.last + 1
          : mode === "previous"
            ? range.current.first - 1
            : initialPage;
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      if (mode === "next" || mode === "previous") setPaginating(true);
      setPaginationError(null);
      const work = (async () => {
        try {
          const result = await fetchPage(page, abort.signal);
          if (epoch !== session.current || abort.signal.aborted) return;
          // Do not let an older GET undo a confirmed like/save/comment/delete.
          const currentById = new Map(
            rows.current.map((post) => [post.id, post]),
          );
          const removedFromResponse = result.posts.filter(
            (post) => (removed.current.get(post.id) ?? 0) > version,
          ).length;
          const responseTotal = Math.max(0, result.total - removedFromResponse);
          const fetched = result.posts.flatMap((post) =>
            (removed.current.get(post.id) ?? 0) > version
              ? []
              : (changed.current.get(post.id) ?? 0) > version &&
                  currentById.has(post.id)
                ? [currentById.get(post.id)!]
                : [post],
          );
          const entry = entryRef.current;
          const separate = entry && !removed.current.has(entry.id) && !fetched.some(post => post.id === entry.id);
          const prefix = separate ? [currentById.get(entry.id) ?? entry] : [];
          const existing = rows.current.map(post => post.id === entry?.id
            ? fetched.find(fresh => fresh.id === post.id) ?? post : post);
          const next =
            mode === "previous"
              ? uniquePosts([...fetched, ...existing])
              : mode === "next"
                ? uniquePosts([...existing, ...fetched])
                : uniquePosts([...prefix, ...fetched]);
          if (mode === "initial" || mode === "refresh") setEntrySeparate(Boolean(separate));
          networkCommitted.current = true;
          cacheMeta.current = {
            total: responseTotal,
            hasMore: responseTotal > limit,
          };
          commit(next);
          range.current =
            mode === "previous"
              ? { ...range.current, first: page }
              : mode === "next"
                ? { ...range.current, last: page }
                : { first: page, last: page };
          setFirstPage(range.current.first);
          setTotal(responseTotal);
          if (mode !== "previous") setHasMore(result.hasMore);
          setError(null);
          if (source === "feed" && range.current.first === 1)
            void setCached(
              cacheKey,
              { posts: next.slice(0, limit), ...cacheMeta.current },
              FEED_TTL,
            );
        } catch (cause) {
          if (epoch !== session.current || abort.signal.aborted) return;
          const failure =
            cause instanceof Error ? cause : new Error(String(cause));
          if (mode === "next" || mode === "previous") {
            failedPageMode.current = mode;
            setPaginationError(failure);
          } else {
            // A resolved detail entry remains usable if only the surrounding
            // author page fails; do not hide a real post behind a feed error.
            const entry = entryRef.current;
            if (entry && !rows.current.length && !removed.current.has(entry.id)) {
              commit([entry]);
              setEntrySeparate(true);
            }
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
    [cacheKey, commit, fetchPage, initialPage, limit, source],
  );

  useEffect(() => {
    const epoch = ++session.current;
    controller.current?.abort();
    inFlight.current = null;
    pendingMutations.current.clear();
    changed.current.clear();
    removed.current.clear();
    updateVersion.current = 0;
    range.current = { first: initialPage, last: initialPage };
    // Clear the previous external resource before starting this account/source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    commit([]);
    setOwner(scopeKey);
    networkCommitted.current = false;
    setFirstPage(initialPage);
    setHasMore(false);
    setError(null);
    if (authReady && source === "feed" && initialPage === 1) {
      const cacheVersion = updateVersion.current;
      void getCached<FeedCache>(cacheKey).then((cached) => {
        if (
          cached?.posts &&
          epoch === session.current &&
          !networkCommitted.current &&
          updateVersion.current === cacheVersion
        ) {
          commit(cached.posts);
          cacheMeta.current = { total: cached.total, hasMore: cached.hasMore };
          setTotal(cached.total);
          setHasMore(cached.hasMore);
          setLoading(false); // render cache immediately; do not wait for HTTP/timeout
        }
      });
    }
    void load("initial");
    return () => {
      session.current += 1;
      controller.current?.abort();
    };
  }, [authReady, cacheKey, commit, initialPage, load, scopeKey, source]);

  useEffect(
    () =>
      subscribePostUpdates((event) => {
        if (event.accountId !== accountId) return;
        const version = ++updateVersion.current;
        changed.current.set(event.postId, version);
        const removeMember =
          event.deleted ||
          (source === "saved" && event.patch?.isBookmarked === false);
        if (removeMember) removed.current.set(event.postId, version);
        else if (source === "saved" && event.patch?.isBookmarked === true)
          removed.current.delete(event.postId);
        const next = removeMember
          ? rows.current.filter((post) => post.id !== event.postId)
          : rows.current.map((post) => applyPostUpdate(post, event));
        const removedCount = rows.current.length - next.length;
        if (removedCount) {
          setTotal((previous) => Math.max(0, previous - removedCount));
          cacheMeta.current.total = Math.max(
            0,
            cacheMeta.current.total - removedCount,
          );
        }
        commit(next);
        if (source === "feed" && range.current.first === 1)
          void setCached(
            cacheKey,
            { posts: next.slice(0, limit), ...cacheMeta.current },
            FEED_TTL,
          );
      }),
    [accountId, cacheKey, commit, limit, source],
  );

  const mutate = useCallback(
    (
      postId: string,
      kind: "like" | "save" | "delete",
      value: boolean,
    ): Promise<void> => {
      const key = `${postId}:${kind}`;
      const existing = pendingMutations.current.get(key);
      if (existing) return existing;
      const epoch = session.current;
      const post = rows.current.find((row) => row.id === postId);
      const work = (async () => {
        if (!token || !accountId) throw new Error("Sign in to update posts");
        let alreadyApplied = false;
        try {
          const path = `/posts/${encodeURIComponent(postId)}${kind === "delete" ? "" : `/${kind}`}`;
          if (kind !== "delete" && value) await api.post(path, {}, token);
          else await api.delete(path, token);
        } catch (cause) {
          // Verified conflict responses establish the requested state, without a fake increment.
          const message = cause instanceof Error ? cause.message : "";
          if (
            value &&
            ((kind === "like" && message === "Already liked") ||
              (kind === "save" && message === "Post already saved"))
          )
            alreadyApplied = true;
          else throw cause;
        }
        if (epoch !== session.current) return;
        let count = Math.max(
          0,
          (post?.likeCount ?? 0) + (alreadyApplied ? 0 : value ? 1 : -1),
        );
        if (kind === "like" && post?.likeStateKnown === false) {
          // GET /posts/:id omits membership flags. An idempotent LIKE may
          // already exist, so never invent an increment for a detail entry.
          count = post.likeCount;
          try {
            const response = await api.get<{ data: { _count: { likes: number } } }>(`/posts/${encodeURIComponent(postId)}`, token, { deduplicate: false });
            if (Number.isSafeInteger(response.data?._count?.likes) && response.data._count.likes >= 0) count = response.data._count.likes;
          } catch { /* The write succeeded. Keep the last real count until refresh. */ }
        }
        if (epoch !== session.current) return;
        publishPostUpdate({
          postId,
          accountId,
          deleted: kind === "delete",
          patch:
            kind === "like"
              ? { isLiked: value, likeCount: count, likeStateKnown: true }
              : kind === "save"
                ? { isBookmarked: value, saveStateKnown: true }
                : undefined,
        });
      })();
      pendingMutations.current.set(key, work);
      void work
        .finally(() => {
          if (pendingMutations.current.get(key) === work)
            pendingMutations.current.delete(key);
        })
        .catch(() => {});
      return work;
    },
    [accountId, token],
  );

  return {
    posts: authReady && owner === scopeKey ? posts : EMPTY_POSTS,
    entrySeparate,
    loading: loading || (authReady && owner !== scopeKey),
    refreshing,
    paginating,
    error,
    paginationError,
    hasMore,
    total,
    firstPage,
    hasPrevious: firstPage > 1,
    retryPagination: useCallback(() => load(failedPageMode.current), [load]),
    refresh: useCallback(() => load("refresh"), [load]),
    loadMore: useCallback(
      () => (hasMore && !loading ? load("next") : Promise.resolve()),
      [hasMore, load, loading],
    ),
    loadPrevious: useCallback(
      () =>
        range.current.first > 1 && !loading
          ? load("previous")
          : Promise.resolve(),
      [load, loading],
    ),
    like: useCallback((id: string) => mutate(id, "like", true), [mutate]),
    unlike: useCallback((id: string) => mutate(id, "like", false), [mutate]),
    save: useCallback((id: string) => mutate(id, "save", true), [mutate]),
    unsave: useCallback((id: string) => mutate(id, "save", false), [mutate]),
    deletePost: useCallback(
      (id: string) => mutate(id, "delete", false),
      [mutate],
    ),
  };
}
