/* eslint-disable react-hooks/globals -- Test probes intentionally expose mounted hook results to assertions. */
// Explore screen wiring: ranked grid, skeleton, cursor pagination, pull-to-
// refresh, post-detail navigation and search mode. The tile and people list are
// stubbed at their module boundary so this stays a navigation/data test.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, deferred, storage } = require("../messaging/harness.cjs");

let auth = { user: { id: "me", username: "me" }, token: "token" };
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
const pushes = [];
mock("expo-router", {
  router: {
    push: (route) => pushes.push(route),
    back() {},
    navigate() {},
  },
  useFocusEffect: (callback) => React.useEffect(callback, [callback]),
  useLocalSearchParams: () => ({}),
});
const calls = [];
let handler;
mock("@/services/api", {
  api: {
    get: (path, token, options) => {
      calls.push(path);
      return handler(path);
    },
  },
});
mock("@/hooks/useDebounce", { useDebounce: (value) => value });
mock("@/components/ui", { ExploreGridSkeleton: "ExploreGridSkeleton" });
mock("@/components/explore/ExploreTile", (props) =>
  React.createElement("ExploreTile", props),
);
mock("@/components/explore/PeopleSearchResults", (props) =>
  React.createElement("PeopleSearchResults", props),
);

const raw = (id) => ({
  id,
  content: `Post ${id}`,
  author: { id: "writer", username: "writer", displayName: "Writer" },
  createdAt: "2026-11-16T12:00:00Z",
  imageUrls: [],
  videoUrl: null,
  likesCount: 2,
  commentsCount: 1,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
});
const page = (posts, nextCursor = null) => ({
  success: true,
  data: posts,
  meta: {
    hasNext: Boolean(nextCursor),
    nextCursor,
    exhausted: !nextCursor,
    expiresAt: "2026-11-16T12:15:00Z",
    algorithmVersion: 1,
  },
});
const Explore = require("../../src/app/(tabs)/explore.tsx").default;

let renderer;
beforeEach(() => {
  calls.length = 0;
  pushes.length = 0;
  storage.clear();
  handler = async (path) =>
    path.includes("cursor=c1")
      ? page([raw("p2")], null)
      : page([raw("p1")], "c1");
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("Explore renders a skeleton, then the ranked grid, and paginates with the server cursor", async () => {
  const pending = deferred();
  let first = true;
  handler = (path) => {
    if (first) {
      first = false;
      return pending.promise;
    }
    return path.includes("cursor=c1")
      ? page([raw("p2")], null)
      : page([raw("p1")], "c1");
  };
  await act(async () => {
    renderer = create(React.createElement(Explore));
  });
  assert.equal(
    renderer.root.findAllByType("ExploreGridSkeleton").length,
    1,
  );
  assert.equal(
    calls[0],
    "/posts/explore?limit=24",
  );
  await act(async () => pending.resolve(page([raw("p1")], "c1")));
  assert.equal(
    renderer.root.findAllByType("ExploreGridSkeleton").length,
    0,
  );
  const list = renderer.root.findByType("FlatList");
  assert.equal(list.props.numColumns, 3);
  assert.deepEqual(
    list.props.data.map((post) => post.id),
    ["p1"],
  );
  await act(async () => {
    list.props.onEndReached();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  assert.equal(calls.at(-1), "/posts/explore?limit=24&cursor=c1");
  assert.deepEqual(
    renderer.root.findByType("FlatList").props.data.map((post) => post.id),
    ["p1", "p2"],
  );
});

test("pull-to-refresh requests a new snapshot, and a tile opens post detail by id", async () => {
  await act(async () => {
    renderer = create(React.createElement(Explore));
  });
  const list = renderer.root.findByType("FlatList");
  await act(async () => list.props.onRefresh());
  assert.equal(calls.at(-1), "/posts/explore?limit=24&refresh=true");
  const tile = renderer.root.findByType("ExploreTile");
  await act(async () => tile.props.onOpen(tile.props.post.id));
  assert.deepEqual(pushes, [
    { pathname: "/posts/[id]", params: { id: "p1" } },
  ]);
});

test("typing in the search bar replaces the grid with people search", async () => {
  await act(async () => {
    renderer = create(React.createElement(Explore));
  });
  const input = renderer.root.findByProps({ accessibilityLabel: "Search people" });
  await act(async () => input.props.onChangeText("wri"));
  assert.equal(renderer.root.findAllByType("FlatList").length, 0);
  const people = renderer.root.findByType("PeopleSearchResults");
  assert.equal(people.props.query, "wri");
  await act(async () =>
    renderer.root.findByProps({ accessibilityLabel: "Clear search" }).props.onPress(),
  );
  assert.equal(renderer.root.findAllByType("FlatList").length, 1);
});
