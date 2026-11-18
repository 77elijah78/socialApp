const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("../messaging/harness.cjs");

const dialogs = [];
mock("@/services/AppDialogService", {
  showAppDialog: (options) => dialogs.push(options),
});

const { buildPostMenu } = require("../../src/utils/postMenu.ts");

const basePost = {
  id: "p1",
  author: { id: "me", username: "me", displayName: "Me" },
  content: "Hello",
  imageUrls: [],
  videoUrl: null,
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  timestamp: "2026-11-16T12:00:00Z",
  isLiked: false,
  isBookmarked: false,
};
const noop = () => {};

function menu(overrides = {}) {
  return buildPostMenu({
    post: basePost,
    currentUserId: "me",
    onSave: noop,
    onUnsave: noop,
    onShare: noop,
    onEdit: noop,
    onDelete: async () => {},
    ...overrides,
  });
}
const labels = (items) => items.map((item) => item.label);

test.beforeEach(() => {
  dialogs.length = 0;
});

test("the owner gets feed-identical save, share, edit and delete actions", () => {
  const items = menu();
  assert.deepEqual(labels(items), [
    "Save post",
    "Share",
    "Edit post",
    "Delete post",
  ]);
  assert.equal(items.find((item) => item.key === "delete").destructive, true);
  assert.deepEqual(labels(menu({ post: { ...basePost, isBookmarked: true } })), [
    "Remove from saved",
    "Share",
    "Edit post",
    "Delete post",
  ]);
});

test("the owner must confirm a delete and can cancel it", async () => {
  let deleted = 0;
  const items = menu({ onDelete: async () => { deleted += 1; } });
  items.find((item) => item.key === "delete").onPress();
  assert.equal(dialogs[0].title, "Delete this post?");
  assert.deepEqual(dialogs[0].buttons.map((button) => button.label), [
    "Cancel",
    "Delete post",
  ]);
  assert.equal(dialogs[0].buttons[0].cancel, true);
  assert.equal(deleted, 0);

  await dialogs[0].buttons[1].onPress();
  assert.equal(deleted, 1);
});

test("a failed delete surfaces the canonical error dialog", async () => {
  const items = menu({
    onDelete: async () => {
      throw new Error("network down");
    },
  });
  items.find((item) => item.key === "delete").onPress();
  await dialogs[0].buttons[1].onPress();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(dialogs[1].title, "Couldn’t delete post");
  assert.equal(dialogs[1].message, "network down");
  assert.equal(dialogs[1].tone, "error");
});

test("non-owners never receive edit or delete actions", () => {
  const items = menu({ currentUserId: "someone-else" });
  assert.deepEqual(labels(items), [
    "Save post",
    "Share",
    "Report",
    "Hide post",
    "Unfollow",
  ]);
  assert.equal(items.some((item) => item.key === "edit"), false);
  assert.equal(items.some((item) => item.key === "delete"), false);
});
