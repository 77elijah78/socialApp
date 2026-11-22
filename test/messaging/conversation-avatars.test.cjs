const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./harness.cjs");

const { toRoomRow } = require("../../src/services/ConversationService.ts");

const conversation = (overrides = {}) => ({
  id: "room-1",
  isGroup: false,
  groupName: null,
  groupAvatar: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  participants: [
    {
      user: {
        id: "me",
        username: "me",
        displayName: "Me",
        avatarUrl: "http://localhost:3000/uploads/images/me.jpg",
      },
    },
    {
      user: {
        id: "other",
        username: "yuki",
        displayName: "Yuki",
        avatarUrl: "http://localhost:3000/uploads/images/yuki.jpg",
      },
    },
  ],
  messages: [],
  ...overrides,
});

test("message-room avatars and participant snapshots are rebased for the current API origin", () => {
  const room = toRoomRow(conversation(), "me");

  assert.equal(room.avatarUrl, "https://api.test/uploads/images/yuki.jpg");
  assert.deepEqual(JSON.parse(room.participantsData), [
    {
      id: "me",
      username: "me",
      displayName: "Me",
      avatarUrl: "https://api.test/uploads/images/me.jpg",
    },
    {
      id: "other",
      username: "yuki",
      displayName: "Yuki",
      avatarUrl: "https://api.test/uploads/images/yuki.jpg",
    },
  ]);
});

test("a group avatar wins over participant avatars and external CDN URLs stay intact", () => {
  const room = toRoomRow(
    conversation({
      isGroup: true,
      groupName: "Weekend crew",
      groupAvatar: "http://192.168.1.20:3000/uploads/images/group.jpg",
      participants: [
        {
          user: {
            id: "other",
            username: "yuki",
            displayName: "Yuki",
            avatarUrl: "https://cdn.test/yuki.jpg",
          },
        },
      ],
    }),
    "me",
  );

  assert.equal(room.avatarUrl, "https://api.test/uploads/images/group.jpg");
  assert.equal(
    JSON.parse(room.participantsData)[0].avatarUrl,
    "https://cdn.test/yuki.jpg",
  );
});
