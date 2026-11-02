const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, deferred } = require("../messaging/harness.cjs");
const dialogs = [];
mock("@/services/AppDialogService", {
  showAppDialog: (value) => dialogs.push(value),
});
mock("@/components/messages/Videoplayer", {
  __esModule: true,
  default: (props) => React.createElement("LazyVideoPreview", props),
});
const Card = require("../../src/components/feed/PostCard.tsx").default;
const post = {
  id: "p1",
  author: { id: "writer", username: "writer", displayName: "Writer" },
  content: "Actual post",
  imageUrls: [],
  videoUrl: null,
  likeCount: 3,
  commentCount: 2,
  shareCount: 0,
  timestamp: "2026-10-31",
  isLiked: false,
  isBookmarked: false,
};
let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  dialogs.length = 0;
});

test("shared post card rolls failed optimistic like/bookmark actions back and prevents rapid duplicate mutations", async () => {
  const pending = deferred();
  let likes = 0;
  await act(async () => {
    renderer = create(
      React.createElement(Card, {
        post,
        onLike: () => {
          likes++;
          return pending.promise;
        },
        onBookmark: async () => {
          throw new Error("Offline");
        },
      }),
    );
  });
  let request;
  await act(async () => {
    request = renderer.root
      .findByProps({ accessibilityLabel: "Like post" })
      .props.onPress();
  });
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Unlike post" })
      .props.onPress(),
  );
  assert.equal(likes, 1);
  await act(async () => pending.reject(new Error("Offline")));
  await request;
  assert.ok(renderer.root.findByProps({ accessibilityLabel: "Like post" }));
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Bookmark post" })
      .props.onPress(),
  );
  assert.ok(renderer.root.findByProps({ accessibilityLabel: "Bookmark post" }));
  assert.equal(dialogs.length, 2);
});

test("video posts use the existing lazily imported preview/player rather than silently omitting their media", async () => {
  await act(async () => {
    renderer = create(
      React.createElement(Card, {
        post: { ...post, videoUrl: "https://cdn.test/post.mp4" },
      }),
    );
  });
  assert.equal(
    renderer.root.findAllByType("LazyVideoPreview").length,
    0,
    "waits for its actual container layout, not a screen-width guess",
  );
  const frame = renderer.root.findByProps({ testID: "post-video-frame" });
  await act(async () =>
    frame.props.onLayout({ nativeEvent: { layout: { width: 280 } } }),
  );
  assert.equal(renderer.root.findByType("LazyVideoPreview").props.width, 280);
  assert.equal(
    renderer.root.findByType("LazyVideoPreview").props.height,
    157.5,
  );
  await act(async () =>
    frame.props.onLayout({ nativeEvent: { layout: { width: 760 } } }),
  );
  assert.equal(renderer.root.findByType("LazyVideoPreview").props.width, 760);
  assert.equal(
    renderer.root.findByType("LazyVideoPreview").props.uri,
    "https://cdn.test/post.mp4",
  );
});
