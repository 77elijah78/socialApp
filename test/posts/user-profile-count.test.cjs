const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock } = require("../messaging/harness.cjs");

const auth = {
  user: { id: "me", username: "me", displayName: "Me" },
  token: "token",
};
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
mock("expo-router", {
  router: { push() {}, back() {}, navigate() {} },
  useLocalSearchParams: () => ({ username: "yuki" }),
  Stack: { Screen: () => null },
});
mock("@/hooks/useNetworkStatus", { useNetworkStatus: () => ({ isOffline: false }) });
mock("@/components/ui", {
  ProfileGridItemSkeleton: () => null,
  ProfileSkeleton: () => null,
  OfflineBanner: () => null,
});
mock("@/services/MediaService", {
  mediaService: { message: { syncLatest: async () => {} } },
});
mock("@/db/MessageStore", {
  messageStore: { getRecent: async () => [] },
});
mock("@/utils/recentMessageCache", { setRecentMessageCache() {} });

const visiblePost = {
  id: "p1",
  author: { id: "yuki", username: "yuki", displayName: "Yuki" },
  content: "Still here",
  imageUrls: [],
  imageUrl: "",
  videoUrl: null,
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  timestamp: "2026-11-16T12:00:00Z",
  isLiked: false,
  isBookmarked: false,
};
mock("@/hooks/usePosts", {
  usePosts: () => ({
    posts: [visiblePost],
    total: 1,
    loading: false,
    refreshing: false,
    paginating: false,
    error: null,
    paginationError: null,
    hasMore: false,
    refresh: async () => {},
    loadMore: async () => {},
  }),
});
mock("@/services/api", {
  api: {
    get: async () => ({
      success: true,
      data: {
        id: "yuki",
        username: "yuki",
        displayName: "Yuki",
        bio: null,
        avatarUrl: "http://localhost:3000/uploads/images/yuki.jpg",
        isVerified: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        _count: { posts: 5, followers: 4, following: 3 },
        isFollowing: false,
      },
    }),
  },
});

const Screen = require("../../src/app/user/[username]/index.tsx").default;

let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("another user's profile shows the live author total instead of a stale soft-delete count", async () => {
  await act(async () => {
    renderer = create(React.createElement(Screen));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  const list = renderer.root.findByType("FlatList");
  let header;
  await act(async () => {
    header = create(list.props.ListHeaderComponent());
  });
  const text = header.root
    .findAll((node) => node.type === "Text")
    .map((node) => node.props.children)
    .filter((value) => typeof value === "string");

  assert.ok(text.includes("Posts"));
  assert.ok(text.includes("1"), "the filtered author total is displayed");
  assert.equal(text.includes("5"), false, "the unfiltered _count is not shown");
  await act(async () => header.unmount());
});
