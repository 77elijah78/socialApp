/* eslint-disable react-hooks/globals -- Test probes intentionally expose mounted hook results to assertions. */
// Mounted Explore contract tests against an in-memory API double. No live server.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, deferred, storage } = require("../messaging/harness.cjs");

let auth = { user: { id: "me", username: "me" }, token: "token" };
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
const calls = [];
let handler;
mock("@/services/api", {
  api: {
    get: (path, token, options) => {
      calls.push({ method: "GET", path, token, options });
      return handler(path);
    },
    post: () => Promise.reject(new Error("unused")),
    delete: () => Promise.reject(new Error("unused")),
  },
});
const { useExploreFeed } = require("../../src/hooks/useExploreFeed.ts");
const { publishPostUpdate } = require("../../src/utils/postUpdates.ts");

const raw = (id, patch = {}) => ({
  id,
  content: `Post ${id}`,
  author: { id: "writer", username: "writer", displayName: "Writer" },
  createdAt: "2026-11-16T12:00:00Z",
  imageUrls: [],
  videoUrl: null,
  _count: { likes: 4, comments: 1 },
  likesCount: 4,
  commentsCount: 1,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  shareCount: 0,
  ...patch,
});
const page = (posts, nextCursor = null, exhausted = false) => ({
  success: true,
  message: "Explore",
  data: posts,
  meta: {
    limit: 24,
    hasNext: Boolean(nextCursor),
    nextCursor,
    expiresAt: "2026-11-16T12:15:00Z",
    exhausted,
    algorithmVersion: 1,
  },
});
let hook;
function Probe(props) {
  hook = useExploreFeed(props);
  return null;
}
let renderer;
const mount = async (props = {}) => {
  await act(async () => {
    renderer = create(React.createElement(Probe, props));
  });
};
beforeEach(() => {
  calls.length = 0;
  storage.clear();
  auth = { user: { id: "me", username: "me" }, token: "token" };
  handler = async () => page([raw("p1")], "c1");
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("initial request uses the real recommend endpoint and canonical engagement fields", async () => {
  await mount();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/posts/explore?limit=24");
  assert.equal(hook.posts.length, 1);
  assert.equal(hook.posts[0].likeCount, 4);
  assert.equal(hook.posts[0].commentCount, 1);
  assert.equal(hook.posts[0].likeStateKnown, true);
  assert.equal(hook.posts[0].saveStateKnown, true);
  assert.equal(hook.hasMore, true);
  assert.equal(hook.loading, false);
});

test("cursor pagination is single-flight and de-duplicates repeated server posts", async () => {
  handler = async (path) =>
    path.includes("cursor=c1")
      ? page([raw("p1"), raw("p2")], null)
      : page([raw("p1")], "c1");
  await mount();
  await act(async () => {
    await Promise.all([hook.loadMore(), hook.loadMore(), hook.loadMore()]);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].path, "/posts/explore?limit=24&cursor=c1");
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p1", "p2"],
  );
  assert.equal(hook.hasMore, false);
  assert.equal(hook.exhausted, true);
});

test("refresh creates a new snapshot, replaces the list and resets the cursor", async () => {
  handler = async (path) => {
    if (path.includes("refresh=true")) return page([raw("fresh")], "c2");
    if (path.includes("cursor=c2")) return page([raw("fresh"), raw("older")], null);
    return page([raw("p1")], "c1");
  };
  await mount();
  await act(async () => hook.refresh());
  assert.equal(calls[1].path, "/posts/explore?limit=24&refresh=true");
  assert.deepEqual(hook.posts.map((post) => post.id), ["fresh"]);
  await act(async () => hook.loadMore());
  assert.equal(calls[2].path, "/posts/explore?limit=24&cursor=c2");
  assert.deepEqual(hook.posts.map((post) => post.id), ["fresh", "older"]);
});

test("an expired cursor is surfaced and retries with a fresh snapshot, not a stale cursor", async () => {
  handler = async (path) => {
    if (path.includes("cursor=c1"))
      throw new Error("Explore cursor expired or unavailable; refresh");
    if (path.includes("refresh=true")) return page([raw("renewed")], null);
    return page([raw("p1")], "c1");
  };
  await mount();
  await act(async () => hook.loadMore());
  assert.match(hook.paginationError.message, /cursor/i);
  assert.equal(hook.cursorExpired, true);
  assert.deepEqual(hook.posts.map((post) => post.id), ["p1"]);
  await act(async () => hook.retryPagination());
  assert.equal(calls[2].path, "/posts/explore?limit=24&refresh=true");
  assert.deepEqual(hook.posts.map((post) => post.id), ["renewed"]);
  assert.equal(hook.paginationError, null);
});

test("account change rejects a stale Explore response", async () => {
  const pending = deferred();
  handler = () => pending.promise;
  await mount();
  auth = { user: { id: "account-b", username: "b" }, token: "token-b" };
  handler = async () => page([raw("account-b-post")], null);
  await act(async () => renderer.update(React.createElement(Probe)));
  await act(async () => pending.resolve(page([raw("private-old-post")], "c9")));
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["account-b-post"],
  );
});

test("confirmed like/bookmark/delete updates propagate to Explore without a refetch", async () => {
  await mount();
  const before = calls.length;
  await act(async () => {
    publishPostUpdate({
      postId: "p1",
      accountId: "other",
      patch: { likeCount: 99 },
    });
    publishPostUpdate({
      postId: "p1",
      accountId: "me",
      patch: { likeCount: 8, isLiked: true, isBookmarked: true },
    });
  });
  assert.equal(hook.posts[0].likeCount, 8);
  assert.equal(hook.posts[0].isBookmarked, true);
  assert.equal(calls.length, before, "no extra network request");
  await act(async () =>
    publishPostUpdate({ postId: "p1", accountId: "me", deleted: true }),
  );
  assert.deepEqual(hook.posts, []);
});

test("a just-fetched first page renders from cache without another snapshot request", async () => {
  await mount();
  assert.equal(calls.length, 1);
  await act(async () => renderer.unmount());
  renderer = null;
  calls.length = 0;
  await mount();
  assert.equal(calls.length, 0);
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p1"],
  );
  assert.equal(hook.loading, false);
});
