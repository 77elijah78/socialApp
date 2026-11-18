const { test, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mock, root } = require("../messaging/harness.cjs");
const path = require("node:path");

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const calls = [];
let getHandler = async () => ({ data: null });
let postHandler = async () => ({ data: null });
let patchHandler = async () => ({ data: null });
let deleteHandler = async () => ({ data: null });
const api = {
  get: async (...args) => { calls.push(["GET", ...args]); return getHandler(...args); },
  post: async (...args) => { calls.push(["POST", ...args]); return postHandler(...args); },
  patch: async (...args) => { calls.push(["PATCH", ...args]); return patchHandler(...args); },
  delete: async (...args) => { calls.push(["DELETE", ...args]); return deleteHandler(...args); },
};
mock("@/services/api", { api, ApiError });

const {
  groupService,
  GroupFeatureUnavailableError,
} = require("../../src/services/GroupService.ts");
const {
  channelService,
  ChannelFeatureUnavailableError,
} = require("../../src/services/ChannelService.ts");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { MessageService } = require("../../src/services/MessageService.ts");

before(runMigrations);
beforeEach(async () => { calls.length = 0; await messageStore.deleteAll(); });

test("creating a group sends real members and normalizes owner permissions", async () => {
  postHandler = async () => ({
    data: {
      id: "g1",
      name: "Weekend crew",
      groupAvatar: "https://api.test/uploads/images/g.webp",
      memberCount: 3,
      myRole: "owner",
      members: [
        { userId: "me", role: "owner", user: { id: "me", username: "me", displayName: "Me", avatarUrl: null } },
        { userId: "u2", role: "member", user: { id: "u2", username: "sam", displayName: "Sam", avatarUrl: null } },
      ],
    },
  });
  const group = await groupService.createGroup({ name: " Weekend crew ", memberIds: ["u2", "u3"], avatarUrl: "https://api.test/a.webp" });
  assert.equal(calls[0][0], "POST");
  assert.equal(calls[0][1], "/messages/groups");
  assert.deepEqual(calls[0][2], {
    name: "Weekend crew",
    memberIds: ["u2", "u3"],
    avatarUrl: "https://api.test/a.webp",
    description: undefined,
  });
  assert.equal(group.id, "g1");
  assert.equal(group.name, "Weekend crew");
  assert.equal(group.avatarUrl, "https://api.test/uploads/images/g.webp");
  assert.equal(group.canManage, true);
  assert.equal(group.myRole, "owner");
  assert.equal(group.members[1].displayName, "Sam");
});

test("group info stays usable on the current backend by falling back to real conversations", async () => {
  getHandler = async (endpoint) => {
    if (endpoint.startsWith("/messages/groups/")) throw new ApiError("Not found", 404);
    return {
      data: [{
        id: "g2",
        isGroup: true,
        groupName: "Existing group",
        groupAvatar: null,
        updatedAt: new Date().toISOString(),
        participants: [
          { user: { id: "me", username: "me", displayName: "Me", avatarUrl: null } },
          { user: { id: "u2", username: "sam", displayName: "Sam", avatarUrl: null } },
        ],
      }],
    };
  };
  const group = await groupService.getGroup("g2", "me");
  assert.equal(group.name, "Existing group");
  assert.equal(group.memberCount, 2);
  assert.equal(group.members.length, 2);
  assert.equal(group.managementAvailable, false);
  assert.equal(group.canManage, false);
  assert.equal(calls[1][1], "/messages/conversations");
});

test("group management uses the dedicated routes and keeps API errors intact", async () => {
  patchHandler = async () => ({ data: { id: "g1", name: "Renamed", members: [] } });
  postHandler = async () => ({ data: { id: "g1", name: "Renamed", members: [] } });
  deleteHandler = async () => ({ data: { success: true } });
  await groupService.updateGroup("g1", { name: "Renamed" });
  await groupService.addMembers("g1", ["u4"]);
  await groupService.setRole("g1", "u4", "admin");
  await groupService.removeMember("g1", "u4");
  await groupService.leaveGroup("g1");
  assert.deepEqual(calls.map((call) => [call[0], call[1]]), [
    ["PATCH", "/messages/groups/g1"],
    ["POST", "/messages/groups/g1/members"],
    ["PATCH", "/messages/groups/g1/members/u4/role"],
    ["DELETE", "/messages/groups/g1/members/u4"],
    ["POST", "/messages/groups/g1/leave"],
  ]);

  postHandler = async () => { throw new ApiError("Not a member", 403); };
  await assert.rejects(groupService.leaveGroup("g1"), (error) => error instanceof ApiError && error.status === 403);
  postHandler = async () => { throw new ApiError("Not deployed", 404); };
  await assert.rejects(groupService.createGroup({ name: "x", memberIds: ["u"] }), GroupFeatureUnavailableError);
});

test("channel discovery, subscription and publishing call the documented contracts", async () => {
  getHandler = async (endpoint) => {
    if (endpoint.startsWith("/channels?")) {
      return { data: { items: [{ id: "c1", name: "Product", description: "News", subscriberCount: 42, subscribed: true, role: "admin", canPost: true }] } };
    }
    if (endpoint.includes("/posts")) {
      return { data: { posts: [{ id: "p2", type: "STICKER", content: "[[sticker:circle:happy]]", mediaUrl: "https://api.test/s.webp", pinned: true }] }, meta: { nextCursor: "p2" } };
    }
    return { data: { id: "c1", name: "Product", subscribersCount: 42, canPost: true } };
  };
  postHandler = async () => ({ data: { id: "c1", name: "Team", isPrivate: true, role: "owner", canPost: true } });
  deleteHandler = async () => ({ data: { id: "c1", name: "Team" } });

  const list = await channelService.list(" prod ", "discover", 1);
  assert.match(calls[0][1], /^\/channels\?query=prod&scope=discover&page=1&limit=20$/);
  assert.equal(list[0].isSubscribed, true);
  assert.equal(list[0].canPost, true);
  assert.equal(list[0].subscriberCount, 42);

  const created = await channelService.create({ name: " Team ", description: "Updates", isPrivate: true });
  assert.deepEqual(calls[1], ["POST", "/channels", { name: "Team", description: "Updates", avatarUrl: undefined, isPrivate: true }]);
  assert.equal(created.role, "owner");
  assert.equal(created.isPrivate, true);

  const subscribed = await channelService.subscribe("c1", true);
  assert.equal(calls[2][0], "POST");
  assert.equal(calls[2][1], "/channels/c1/subscribe");
  assert.equal(subscribed.id, "c1");
  await channelService.subscribe("c1", false);
  assert.equal(calls[3][0], "DELETE");

  const page = await channelService.listPosts("c1", "p1");
  assert.match(calls[4][1], /\/channels\/c1\/posts\?limit=20&cursor=p1$/);
  assert.equal(page.nextCursor, "p2");
  assert.equal(page.posts[0].type, "STICKER");
  assert.equal(page.posts[0].pinned, true);
  assert.equal(page.posts[0].content, "[[sticker:circle:happy]]");
});

test("channel publishing permission is server-normalized, not inferred from subscriber state", async () => {
  getHandler = async () => ({ data: { id: "c2", name: "Read only", isSubscribed: true, role: "subscriber", subscriberCount: 9 } });
  const channel = await channelService.get("c2");
  assert.equal(channel.isSubscribed, true);
  assert.equal(channel.canPost, false);
  assert.equal(channel.role, "subscriber");

  getHandler = async () => { throw new ApiError("Not deployed", 405); };
  await assert.rejects(channelService.get("c2"), ChannelFeatureUnavailableError);
});

test("group text and media messages reuse the existing conversation send contract", async () => {
  postHandler = async () => ({ data: { id: "server-group-msg", createdAt: new Date().toISOString() } });
  const service = new MessageService("https://example.test/api/v1");
  service.setAuthToken("token");
  const message = await service.send("Hello group", {
    senderId: "me",
    receiverId: null,
    conversationId: "g1",
    sender: { id: "me", username: "me" },
  });
  assert.equal(message.type, "TEXT");
  assert.equal(message.status, "SENT");
  const send = calls.find((call) => call[0] === "POST" && String(call[1]).includes("/messages"));
  assert.equal(send[1], "/messages/conversations/g1/messages");
  assert.equal(send[2].content, "Hello group");
  assert.equal("receiverId" in send[2], false);
  assert.equal(calls.some((call) => call[0] === "POST" && call[1] === "/messages/groups"), false);
});
