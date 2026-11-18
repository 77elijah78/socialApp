const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, storage } = require("../messaging/harness.cjs");

const auth = { user: { id: "me", username: "me", displayName: "Me" }, token: "token" };
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
mock("expo-router", {
  router: { push() {}, back() {}, navigate() {} },
  useFocusEffect: (callback) => React.useEffect(callback, [callback]),
  useLocalSearchParams: () => ({}),
});

const post = {
  id: "p1",
  author: { id: "me", username: "me", displayName: "Me" },
  content: "Mine",
  imageUrls: [],
  videoUrl: null,
  likeCount: 1,
  commentCount: 0,
  shareCount: 0,
  timestamp: "2026-11-16T12:00:00Z",
  isLiked: false,
  isBookmarked: false,
};
const feed = {
  posts: [post],
  total: 2,
  loading: false,
  refreshing: false,
  paginating: false,
  error: null,
  paginationError: null,
  hasMore: false,
  refresh: async () => {},
  loadMore: async () => {},
};
mock("@/hooks/usePosts", { usePosts: () => feed });
mock("@/services/api", {
  api: {
    get: async () => ({
      success: true,
      data: {
        id: "me",
        username: "me",
        displayName: "Me",
        bio: null,
        avatarUrl: null,
        isVerified: false,
        _count: { posts: 2, followers: 4, following: 3 },
      },
    }),
  },
});

const Profile = require("../../src/app/(tabs)/profile.tsx").default;
const { publishPostUpdate } = require("../../src/utils/postUpdates.ts");

let renderer;
beforeEach(() => storage.clear());
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

async function headerStats() {
  const list = renderer.root.findByType("FlatList");
  let header;
  await act(async () => {
    header = create(list.props.ListHeaderComponent());
  });
  const values = header.root
    .findAll((node) => node.type === "Text")
    .map((node) => node.props.children)
    .filter((value) => typeof value === "string");
  await act(async () => header.unmount());
  return values;
}

test("a confirmed post deletion immediately lowers the profile post count", async () => {
  await act(async () => {
    renderer = create(React.createElement(Profile));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const before = await headerStats();
  assert.ok(before.includes("2"), "initial server count");
  assert.ok(before.includes("Posts"));

  await act(async () => {
    publishPostUpdate({ postId: "p1", accountId: "me", deleted: true });
  });
  const after = await headerStats();
  assert.ok(after.includes("1"), "deletion decrements the visible count");
  assert.equal(after.includes("2"), false);
});
