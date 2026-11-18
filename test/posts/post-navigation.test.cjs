/* eslint-disable react-hooks/globals -- Test probes intentionally expose mounted hook results to assertions. */
// The bookmark regression: a saved post opens the shared post-detail route with
// its real id, and comments only ever open from an explicit comment action.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, storage } = require("../messaging/harness.cjs");

let auth = { user: { id: "me", username: "me" }, token: "token" };
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
const pushes = [];
const backs = [];
mock("expo-router", {
  router: {
    push: (route) => pushes.push(route),
    back() { backs.push(true); },
    navigate() {},
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback) => React.useEffect(callback, [callback]),
});
const raw = {
  id: "saved-42",
  content: "A saved post",
  author: { id: "writer", username: "writer", displayName: "Writer" },
  createdAt: "2026-11-16T12:00:00Z",
  imageUrls: [],
  videoUrl: null,
  _count: { likes: 4, comments: 2 },
  likesCount: 4,
  commentsCount: 2,
  isBookmarkedByCurrentUser: true,
};
const deletes = [];
mock("@/services/api", {
  api: {
    get: async () => ({
      success: true,
      data: [raw],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    }),
    post: async () => ({ success: true }),
    delete: async (path) => {
      deletes.push(path);
      return { success: true };
    },
  },
});
const dialogs = [];
mock("@/services/AppDialogService", {
  showAppDialog: (options) => dialogs.push(options),
});
mock("@/components/feed/PostCard", (props) =>
  React.createElement("PostCard", props),
);
const comments = [];
const menus = [];
mock("@/providers/OverlayProvider", {
  useOverlay: () => ({
    openComments: (id) => comments.push(id),
    openShare() {},
    openActionMenu: (items, anchor) => menus.push({ items, anchor }),
  }),
});
const Collection =
  require("../../src/components/posts/PostCollection.tsx").default;

let renderer;
beforeEach(() => {
  storage.clear();
  pushes.length = 0;
  comments.length = 0;
  backs.length = 0;
  deletes.length = 0;
  menus.length = 0;
  dialogs.length = 0;
  raw.author.id = "writer";
  raw.isBookmarked = true;
  raw.isBookmarkedByCurrentUser = true;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("a bookmarked grid tile opens post detail with the preserved id, never comments", async () => {
  await act(async () => {
    renderer = create(
      React.createElement(Collection, { source: "saved" }),
    );
  });
  const tile = renderer.root.findByProps({
    accessibilityLabel: "Open post by Writer",
  });
  await act(async () => tile.props.onPress());
  assert.deepEqual(pushes, [
    { pathname: "/posts/[id]", params: { id: "saved-42" } },
  ]);
  assert.deepEqual(comments, []);
});

test("list mode opens detail from the card body and comments only from the comment action", async () => {
  await act(async () => {
    renderer = create(
      React.createElement(Collection, { source: "saved" }),
    );
  });
  await act(async () =>
    renderer.root.findByProps({ accessibilityLabel: "Show list" }).props.onPress(),
  );
  const card = renderer.root.findByType("PostCard");
  assert.equal(card.props.post.id, "saved-42");
  assert.equal(card.props.post.isBookmarked, true);
  await act(async () => card.props.onOpen("saved-42"));
  assert.deepEqual(pushes, [
    { pathname: "/posts/[id]", params: { id: "saved-42" } },
  ]);
  assert.deepEqual(comments, []);
  await act(async () => card.props.onComment("saved-42"));
  assert.deepEqual(comments, ["saved-42"]);
});

test("the profile detail sheet matches the feed and can delete the selected own post", async () => {
  raw.author.id = "me";
  raw.isBookmarked = false;
  raw.isBookmarkedByCurrentUser = false;
  await act(async () => {
    renderer = create(
      React.createElement(Collection, {
        source: "author",
        username: "me",
        selectedId: "saved-42",
      }),
    );
  });
  const card = renderer.root.findByType("PostCard");
  await act(async () => card.props.onMenuPress("saved-42", { x: 1, y: 2, width: 3, height: 4 }));
  assert.deepEqual(
    menus[0].items.map((item) => item.label),
    ["Save post", "Share", "Edit post", "Delete post"],
  );
  assert.equal(menus[0].items.at(-1).destructive, true);

  await act(async () => menus[0].items.at(-1).onPress());
  assert.equal(dialogs[0].title, "Delete this post?");
  await act(async () => {
    await dialogs[0].buttons.find((button) => button.destructive).onPress();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(deletes, ["/posts/saved-42"]);
  assert.equal(backs.length, 1, "closes the selected post after deletion");
});
