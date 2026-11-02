/* eslint-disable react-hooks/globals -- Test probes intentionally expose mounted hook results to assertions. */
// Mounted frontend contract/state tests; no live API or device certification.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const {
  mock,
  deferred,
  scrolls,
  resetScrolls,
  storage,
} = require("../messaging/harness.cjs");
let auth = { user: { id: "me", username: "me" }, token: "token" };
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
const calls = [];
let handler;
mock("@/services/api", {
  api: {
    get: (path, token, options) => {
      calls.push({ method: "GET", path, token, options });
      return handler(path, "GET");
    },
    post: (path, body, token) => {
      calls.push({ method: "POST", path, body, token });
      return handler(path, "POST", body);
    },
    delete: (path, token) => {
      calls.push({ method: "DELETE", path, token });
      return handler(path, "DELETE");
    },
  },
});
mock("@/components/feed/PostCard", (props) =>
  React.createElement("PostCard", props),
);
const comments = [],
  shares = [],
  menus = [];
mock("@/providers/OverlayProvider", {
  useOverlay: () => ({
    openComments: (id) => comments.push(id),
    openShare: (value) => shares.push(value),
    openActionMenu: (value) => menus.push(value),
  }),
});
const { usePosts } = require("../../src/hooks/usePosts.ts");
const {
  normalizePostsPage,
  authorFeedParams,
} = require("../../src/utils/postContracts.ts");
const { publishPostUpdate } = require("../../src/utils/postUpdates.ts");
const Collection =
  require("../../src/components/posts/PostCollection.tsx").default;
let hook, renderer;
function Probe(props) {
  hook = usePosts(props);
  return null;
}
const raw = (id) => ({
  id,
  content: `Post ${id}`,
  author: { id: "writer", username: "writer", displayName: "Writer" },
  createdAt: "2026-10-31T12:00:00Z",
  imageUrls: [],
  videoUrl: null,
  _count: { likes: 3, comments: 2 },
  shareCount: 1,
  isLiked: false,
  isSaved: false,
});
const envelope = (posts, hasNext = false, total = posts.length) => ({
  success: true,
  data: posts,
  meta: { page: 1, limit: 20, total, hasNext },
});
const mount = async (Component = Probe, props = {}) => {
  await act(async () => {
    renderer = create(React.createElement(Component, props));
  });
};
beforeEach(() => {
  calls.length = 0;
  comments.length = 0;
  shares.length = 0;
  menus.length = 0;
  storage.clear();
  resetScrolls();
  auth = { user: { id: "me", username: "me" }, token: "token" };
  handler = async () => envelope([raw("p1")]);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("saved array/meta and author nested envelope are normalized without treating a valid collection as empty", () => {
  const saved = normalizePostsPage(
    envelope([raw("p1")], true, 30),
    "saved",
    1,
    20,
  );
  assert.equal(saved.posts[0].isBookmarked, true);
  assert.equal(saved.hasMore, true);
  const author = normalizePostsPage(
    { success: true, data: { user: {}, posts: [raw("p1")], total: 30 } },
    "author",
    1,
    20,
  );
  assert.equal(author.hasMore, true);
  assert.equal(
    author.posts[0].saveStateKnown,
    false,
    "backend's hard-coded isSaved=false is not authoritative",
  );
  assert.throws(
    () =>
      normalizePostsPage(
        { success: true, data: { posts: [] } },
        "saved",
        1,
        20,
      ),
    /Invalid/,
  );
});

test("one initial request and one single-flight next-page request; page commit does not refetch or duplicate", async () => {
  handler = async (path) =>
    path.includes("page=1")
      ? envelope([raw("p1")], true, 3)
      : envelope([raw("p1"), raw("p2")], false, 3);
  await mount();
  assert.equal(calls.length, 1);
  await act(async () => {
    await Promise.all([hook.loadMore(), hook.loadMore(), hook.loadMore()]);
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p1", "p2"],
  );
  assert.equal(hook.hasMore, false);
});

test("author page deep entry fetches only the requested page and then explicitly loads preceding pages", async () => {
  handler = async (path) => ({
    success: true,
    data: {
      user: {},
      posts: [raw(path.includes("page=3") ? "p41" : "p21")],
      total: 80,
    },
  });
  await mount(Probe, { source: "author", username: "writer", page: 3 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].path, /^\/posts\/user\/writer\?page=3&limit=20$/);
  assert.equal(hook.hasPrevious, true);
  await act(async () => hook.loadPrevious());
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p21", "p41"],
  );
  assert.equal(hook.firstPage, 2);
  assert.deepEqual(authorFeedParams("writer", "p41", 40), {
    pathname: "/user/[username]/posts",
    params: { username: "writer", postId: "p41", page: "3" },
  });
});

test("page errors retain existing rows and retry the exact failed direction/page", async () => {
  let fail = true;
  handler = async (path) => {
    if (path.includes("page=2") && fail) throw new Error("Offline");
    return envelope(
      [raw(path.includes("page=2") ? "p2" : "p1")],
      path.includes("page=1"),
      40,
    );
  };
  await mount();
  await act(async () => hook.loadMore());
  assert.equal(hook.paginationError.message, "Offline");
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p1"],
  );
  fail = false;
  await act(async () => hook.retryPagination());
  assert.equal(hook.paginationError, null);
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p1", "p2"],
  );
  assert.equal(calls[1].path, calls[2].path);
});

test("account change rejects stale collection results and does not reuse another account's feed cache", async () => {
  const pending = deferred();
  handler = () => pending.promise;
  await mount();
  auth = { user: { id: "account-b", username: "b" }, token: "token-b" };
  handler = async () => envelope([raw("account-b-post")]);
  await act(async () => renderer.update(React.createElement(Probe)));
  await act(async () => pending.resolve(envelope([raw("private-old-post")])));
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["account-b-post"],
  );
});

test("confirmed comment counts propagate only to the same account and an older refresh cannot undo them", async () => {
  await mount();
  const pending = deferred();
  handler = () => pending.promise;
  let request;
  await act(async () => {
    request = hook.refresh();
  });
  await act(async () => {
    publishPostUpdate({
      postId: "p1",
      accountId: "other-account",
      commentAdded: true,
    });
    publishPostUpdate({ postId: "p1", accountId: "me", commentAdded: true });
  });
  assert.equal(hook.posts[0].commentCount, 3);
  await act(async () => pending.resolve(envelope([raw("p1")])));
  await request;
  assert.equal(hook.posts[0].commentCount, 3);
});

test("failed like/save never alter confirmed post state; a verified already-liked response adds no fake count", async () => {
  await mount();
  handler = async () => {
    throw new Error("Offline");
  };
  await act(async () => {
    await assert.rejects(hook.like("p1"), /Offline/);
    await assert.rejects(hook.save("p1"), /Offline/);
  });
  assert.equal(hook.posts[0].isLiked, false);
  assert.equal(hook.posts[0].likeCount, 3);
  assert.equal(hook.posts[0].isBookmarked, false);
  handler = async () => {
    throw new Error("Already liked");
  };
  await act(async () => hook.like("p1"));
  assert.equal(hook.posts[0].isLiked, true);
  assert.equal(hook.posts[0].likeCount, 3);
});

test("bookmarks grid/list reuse the shared post actions and do not mount another navigation header", async () => {
  const post = raw("p1");
  delete post.isLiked;
  delete post.isSaved;
  handler = async () => envelope([post]);
  await mount(Collection, { source: "saved" });
  assert.match(calls[0].path, /^\/posts\/saved\?page=1&limit=20$/);
  const list = renderer.root.findByType("FlatList");
  assert.equal(list.props.numColumns, 3);
  assert.equal(list.props.data[0].isBookmarked, true);
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Show list" })
      .props.onPress(),
  );
  const card = renderer.root.findByType("PostCard");
  await act(async () => {
    card.props.onComment("p1");
    card.props.onShare("p1");
  });
  assert.deepEqual(comments, ["p1"]);
  assert.deepEqual(shares, [{ postId: "p1" }]);
  assert.equal(renderer.root.findAllByType("Stack.Screen").length, 0);
  assert.equal(
    renderer.root.findAllByProps({ accessibilityLabel: "Go back" }).length,
    1,
  );
});

test("author feed measures only its bounded initial page and positions selected variable-height item once", async () => {
  handler = async () => ({
    success: true,
    data: {
      user: {},
      total: 1000,
      posts: [raw("p41"), raw("p42"), raw("p43")],
    },
  });
  await mount(Collection, {
    source: "author",
    username: "writer",
    initialPage: 3,
    selectedId: "p43",
  });
  assert.equal(
    calls.length,
    1,
    "does not eagerly fetch pages one and two or all 1000 posts",
  );
  let list = renderer.root.findByType("FlatList");
  assert.equal(list.props.initialNumToRender, 20);
  await act(async () => list.props.onLayout());
  const measured = renderer.root
    .findAllByType("View")
    .filter((node) => node.props.onLayout);
  await act(async () => {
    measured[0].props.onLayout({ nativeEvent: { layout: { height: 143 } } });
    measured[1].props.onLayout({ nativeEvent: { layout: { height: 287 } } });
  });
  assert.deepEqual(scrolls, [{ offset: 430, animated: false }]);
  list = renderer.root.findByType("FlatList");
  assert.deepEqual(list.props.maintainVisibleContentPosition, {
    minIndexForVisible: 0,
  });
  assert.equal(list.props.style.opacity, 1);
  assert.equal(
    renderer.root.findAllByType("View").filter((node) => node.props.onLayout)
      .length,
    0,
    "no per-row scroll measurement after entry",
  );
});

test("cached feed renders before pending HTTP and remains usable when the network fails", async () => {
  const cached = normalizePostsPage(
    envelope([raw("cached")], true, 40),
    "feed",
    1,
    20,
  );
  storage.set(
    "cache:feed:me:page1",
    JSON.stringify({
      data: { posts: cached.posts, total: 40, hasMore: true },
      expiresAt: Date.now() + 60_000,
    }),
  );
  const pending = deferred();
  handler = () => pending.promise;
  await mount();
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["cached"],
  );
  assert.equal(
    hook.loading,
    false,
    "cached UI does not wait for the HTTP timeout",
  );
  assert.equal(hook.hasMore, true);
  await act(async () => pending.reject(new Error("Offline")));
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["cached"],
  );
  assert.equal(hook.error.message, "Offline");
});

test("same-account JWT refresh preserves loaded pages, row identity and scroll context without another initial fetch", async () => {
  handler = async (path) =>
    path.includes("page=1")
      ? envelope([raw("p1")], true, 40)
      : envelope([raw("p2")], false, 40);
  await mount();
  await act(async () => hook.loadMore());
  const rows = hook.posts,
    count = calls.length;
  auth = { ...auth, token: "refreshed-token" };
  await act(async () => renderer.update(React.createElement(Probe)));
  assert.equal(hook.posts, rows);
  assert.equal(calls.length, count);
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p1", "p2"],
  );
});

test("confirmed unsave removes only the saved-collection member, preserves remaining rows and updates the total", async () => {
  handler = async () => envelope([raw("p1"), raw("p2")], false, 2);
  await mount(Probe, { source: "saved" });
  handler = async () => ({ success: true });
  await act(async () => hook.unsave("p1"));
  assert.deepEqual(
    hook.posts.map((post) => post.id),
    ["p2"],
  );
  assert.equal(hook.total, 1);
  const pending = deferred();
  handler = (_path, method) =>
    method === "GET" ? pending.promise : Promise.resolve({ success: true });
  let request;
  await act(async () => {
    request = hook.refresh();
  });
  await act(async () => hook.unsave("p2"));
  await act(async () => pending.resolve(envelope([raw("p2")], false, 1)));
  await request;
  assert.deepEqual(
    hook.posts,
    [],
    "older GET cannot resurrect a confirmed removal",
  );
});
