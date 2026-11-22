const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("../messaging/harness.cjs");

mock("@/services/api", { api: { get: async () => ({ data: [] }) } });

const { mapPostResponse } = require("../../src/utils/postContracts.ts");

const base = {
  id: "post-1",
  content: "A photo post",
  imageUrls: [],
  videoUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  author: {
    id: "author-1",
    username: "yuki",
    displayName: "Yuki",
    avatarUrl: "http://localhost:3000/uploads/images/avatar.jpg",
  },
  _count: { likes: 0, comments: 0 },
  isLiked: false,
  isSaved: false,
  shareCount: 0,
};

test("post images accept legacy single/object shapes and rebase owned uploads", () => {
  const post = mapPostResponse({
    ...base,
    imageUrl: "http://localhost:3000/uploads/images/first.jpg",
    images: [
      { url: "http://localhost:3000/uploads/images/first.jpg" },
      { url: "https://cdn.test/second.png", type: "IMAGE" },
      { url: "https://cdn.test/clip.mp4", type: "VIDEO" },
      { url: "file:///camera/local.jpg" },
    ],
    mediaUrls: ["/uploads/images/third.webp"],
  });

  assert.deepEqual(post.imageUrls, [
    "https://api.test/uploads/images/first.jpg",
    "https://cdn.test/second.png",
    "https://api.test/uploads/images/third.webp",
  ]);
  assert.equal(post.imageUrl, "https://api.test/uploads/images/first.jpg");
  assert.equal(
    post.author.avatarUrl,
    "https://api.test/uploads/images/avatar.jpg",
  );
});

test("post attachments keep only renderable image URLs and dedupe them", () => {
  const post = mapPostResponse({
    ...base,
    imageUrls: ["https://cdn.test/a.jpg"],
    attachments: [
      { mediaUrl: "https://cdn.test/a.jpg", type: "photo" },
      { thumbnailUrl: "https://cdn.test/thumb.jpg", type: "IMAGE" },
    ],
  });

  assert.deepEqual(post.imageUrls, ["https://cdn.test/a.jpg"]);
});

test("comment author avatars use the same owned-upload normalization", () => {
  const post = mapPostResponse({
    ...base,
    comments: [
      {
        id: "comment-1",
        content: "Nice",
        createdAt: "2026-01-01T00:00:00.000Z",
        author: {
          ...base.author,
          avatarUrl: "http://127.0.0.1:3000/uploads/images/commenter.jpg",
        },
      },
    ],
  });

  assert.equal(
    post.comments[0].author.avatarUrl,
    "https://api.test/uploads/images/commenter.jpg",
  );
});
