const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const {
  row,
  remote,
  mock,
  deferred,
  settle,
  installServer,
} = require("./harness.cjs");
let auth = { user: { id: "me" }, token: "token" };
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
const { useRooms } = require("../../src/hooks/useRooms.ts");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { roomStore } = require("../../src/db/RoomStore.ts");
const { setTokens } = require("../../src/services/api.ts");
const room = () => ({
  id: "room",
  conversationId: "room",
  name: "Other",
  avatarUrl: "",
  lastMessage: "Cached",
  lastMessageType: "text",
  lastMessageTimestamp: row(0).timestamp,
  unreadCount: 100,
  receiverId: "other",
  cachedAt: 1,
  updatedAt: 1,
});
const conversation = () => ({
  id: "room",
  isGroup: false,
  groupName: null,
  groupAvatar: null,
  updatedAt: new Date().toISOString(),
  participants: [
    {
      user: {
        id: "other",
        username: "other",
        displayName: "Other",
        avatarUrl: null,
      },
    },
  ],
  unreadCount: 100,
  messages: [remote(0)],
});
const response = (data) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => ({ data }),
});
let renderer, rooms, server;
const snapshots = [];
function Probe() {
  rooms = useRooms();
  snapshots.push({
    user: auth.user.id,
    ids: rooms.rooms.map((item) => item.id),
  });
  return null;
}
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(Probe));
    await settle();
  });
}
before(async () => runMigrations());
beforeEach(async () => {
  await messageStore.deleteAll();
  await roomStore.deleteAll();
  auth = { user: { id: "me" }, token: "token" };
  setTokens("token", "refresh");
  server = installServer();
  snapshots.length = 0;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
test("cached inbox paints before a pending server response and retains global unread with a partial body cache", async () => {
  await roomStore.upsertRoom(room());
  await messageStore.save(row(0));
  const pending = deferred();
  server.response = () => pending.promise;
  await mount();
  assert.equal(rooms.loading, false);
  assert.equal(rooms.rooms[0].lastMessage, "Cached");
  assert.equal(rooms.rooms[0].unreadCount, 100);
  await act(async () => {
    pending.resolve(response([conversation()]));
    await settle();
  });
  assert.equal(
    rooms.rooms[0].unreadCount,
    100,
    "one cached message is not the whole conversation unread count",
  );
});
test("visibility reads during inbox sync keep the global unread delta and newer realtime summary", async () => {
  await roomStore.upsertRoom(room());
  await messageStore.save(row(0));
  const pending = deferred();
  server.response = () => pending.promise;
  await mount();
  await act(async () => {
    await messageStore.markVisibleReadIds([row(0).id], "room", "me");
    await messageStore.saveReceived(row(1), () => true, "me");
    await settle();
  });
  assert.equal(
    rooms.rooms[0].unreadCount,
    100,
    "100 minus one read plus one new message",
  );
  assert.equal(rooms.rooms[0].lastMessage, row(1).content);
  await act(async () => {
    pending.resolve(response([conversation()]));
    await settle();
  });
  assert.equal(rooms.rooms[0].unreadCount, 100);
  assert.equal(rooms.rooms[0].lastMessage, row(1).content);
});
test("account change never displays or persists the old-account inbox response", async () => {
  await roomStore.upsertRoom(room());
  const pending = deferred();
  server.response = (_url, options) =>
    options.headers.Authorization === "Bearer token"
      ? pending.promise
      : response([]);
  await mount();
  await act(async () => {
    await messageStore.deleteAll();
    await roomStore.deleteAll();
    auth = { user: { id: "new-user" }, token: "new-token" };
    setTokens("new-token", "new-refresh");
    renderer.update(React.createElement(Probe));
  });
  await act(async () => {
    pending.resolve(response([conversation()]));
    await settle();
  });
  assert.ok(
    snapshots
      .filter((item) => item.user === "new-user")
      .every((item) => item.ids.length === 0),
  );
  assert.equal((await roomStore.getAllRooms()).length, 0);
});
test("deleting the last cached message removes its stale inbox preview without clearing other unread history", async () => {
  await roomStore.upsertRoom({
    ...room(),
    lastMessage: row(1).content,
    lastMessageTimestamp: row(1).timestamp,
  });
  await messageStore.saveMany([row(0), row(1)]);
  server.failure = new Error("offline");
  await mount();
  await act(async () => {
    await messageStore.deleteOne(row(1).id, "me");
    await settle();
  });
  assert.equal(rooms.rooms[0].lastMessage, row(0).content);
  assert.equal(rooms.rooms[0].unreadCount, 99);
  await act(async () => {
    await messageStore.deleteOne(row(0).id, "me");
    await settle();
  });
  assert.equal(rooms.rooms[0].lastMessage, "");
  assert.equal(rooms.rooms[0].unreadCount, 98);
});
