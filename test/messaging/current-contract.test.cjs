// Contracts inspected on backend main eb79c440ae38f0f120b8301c59ff64904b67c7bc.
// Real frontend SQLite/store/hook/normalizer/service; transport boundaries adapted.
const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { row, settle, installServer } = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { mediaService } = require("../../src/services/MediaService.ts");
const { socketReceiver } = require("../../src/services/SocketReceiver.ts");
const { normalizeRemoteMessage } = require("../../src/utils/messaging/serialization.ts");
const { replyPreview, previewText } = require("../../src/utils/messaging/presentation.ts");
const { createListItemBuilder } = require("../../src/utils/messaging/listItems.ts");
const { useChat } = require("../../src/hooks/useChat.ts");
let renderer, chat, server;
function Probe() {
  const value = useChat({ conversationId: "room", currentUser: { id: "me", token: "token" }, isFocused: true });
  React.useLayoutEffect(() => { chat = value; }, [value]);
  return null;
}
before(runMigrations);
beforeEach(async () => {
  mediaService.message.resetSession();
  mediaService.message.setAuthToken("token");
  socketReceiver.disconnect();
  await messageStore.deleteAll();
  await receiptQueue.clear();
  server = installServer();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  socketReceiver.disconnect();
});
async function mount() {
  await act(async () => { renderer = create(React.createElement(Probe)); await settle(); });
}
const liveReply = () => ({
  id: "reply-server-id", messageId: "reply-server-id", conversationId: "room",
  senderId: "other", receiverId: "me", isGroup: false, readByMe: false,
  content: "A live reply", type: "TEXT", createdAt: new Date(1700000000000).toISOString(),
  sender: { id: "other", username: "alice", avatarUrl: null },
  repliedTo: { id: "original-id", content: "Actual original", senderId: "other", senderUsername: "alice", type: "TEXT" },
});

test("actual sparse Kafka socket reply uses nested original identity/name without waiting for REST", () => {
  const normalized = normalizeRemoteMessage(liveReply(), "me");
  assert.equal(normalized.repliedToId, "original-id");
  const quote = JSON.parse(normalized.replyData);
  assert.equal(quote.sender.username, "alice");
  const item = createListItemBuilder()([normalized], "me", null).find(i => i.kind === "message");
  assert.equal(item.repliedTo.id, "original-id");
  assert.equal(item.repliedTo.content, "Actual original");
});

test("a live received reply older than the loaded floor still paints immediately and deduplicates", async () => {
  await messageStore.save(row(900, { senderId: "me", timestamp: 1900000000000 }));
  server.failure = new Error("fixture offline history");
  await mount();
  await act(async () => {
    await messageStore.saveReceived(normalizeRemoteMessage(liveReply(), "me"), () => true, "me");
    await messageStore.saveReceived(normalizeRemoteMessage(liveReply(), "me"), () => true, "me");
    await settle();
  });
  assert.equal(chat.messages.filter(m => m.id === "reply-server-id").length, 1);
  assert.equal((await messageStore.getByRoom("room")).length, 2);
});

test("backfill below the loaded floor does not re-expand a bounded timeline", async () => {
  await messageStore.saveMany(Array.from({ length: 100 }, (_, n) => row(n)));
  server.failure = new Error("fixture offline history");
  await mount();
  const first = chat.messages[0].id;
  await act(async () => { await messageStore.saveMany([row(-10)]); });
  assert.equal(chat.messages.length, 30);
  assert.equal(chat.messages[0].id, first);
});

test("delete uses the mounted backend messages path and JSON body, then tombstones on confirmed success", async () => {
  const message = row(1, { senderId: "me" });
  await messageStore.save(message);
  server.response = async (url, options) => {
    assert.equal(new URL(url).pathname, `/api/v1/messages/messages/${message.id}`);
    assert.equal(new URL(url).search, "");
    assert.equal(options.method, "DELETE");
    assert.deepEqual(JSON.parse(options.body), { deleteFor: "everyone" });
    return { ok: true, status: 200, json: async () => ({ success: true, data: { messageId: message.id, deleteFor: "everyone" } }) };
  };
  await mediaService.message.delete(message.id, "everyone");
  assert.equal((await messageStore.getRecent("room")).length, 0);
});

test("an unloaded deletion event cannot be resurrected by a later history page", async () => {
  socketReceiver.connect("me", "token");
  const socket = socketReceiver.socket;
  socket.receive("message:deleted", { messageId: row(3).id, conversationId: "room", deletedAt: new Date().toISOString(), deletedBy: "other" });
  await settle();
  await messageStore.saveMany([row(3)]);
  assert.equal((await messageStore.getRecent("room")).length, 0);
});

test("a foreign-conversation deletion must not mutate a cached message with a different scope", async () => {
  await messageStore.save(row(4));
  socketReceiver.connect("me", "token");
  socketReceiver.socket.receive("message:deleted", { messageId: row(4).id, conversationId: "another-room", deletedAt: new Date().toISOString(), deletedBy: "other" });
  await settle();
  assert.equal((await messageStore.getRecent("room")).length, 1);
});

for (const [type, content, expected] of [
  ["SHARED_POST", JSON.stringify({ sharedPostId: "post", content: "Nebula photo", authorName: "Alice", imageUrl: "https://files.test/post.jpg" }), /Nebula photo/],
  ["SHARED_STORY", JSON.stringify({ sharedStoryId: "story", caption: "Evening in Tokyo", authorName: "Alice", mediaType: "image", mediaUrl: "https://files.test/story.jpg" }), /Evening in Tokyo/],
]) {
  test(`${type} reply contains the actual shared caption, not just a generic label or truncated JSON`, () => {
    const quote = replyPreview(row(7, { type, content }));
    assert.match(previewText(quote), expected);
  });
}

test("the stable session lookup reflects a committed receipt/deletion before a rendered callback can reuse stale identity", async () => {
  await messageStore.save(row(8));
  server.failure = new Error("offline fixture");
  await mount();
  const lookup = chat.getLoadedMessage;
  await act(async () => { await messageStore.markRead(row(8).id, "room", "me"); });
  assert.equal(chat.getLoadedMessage, lookup);
  assert.equal(lookup(row(8).id).status, "READ");
  await act(async () => {
    await messageStore.deleteOne(row(8).id, "me", { conversationId: "room", deleteFor: "everyone" });
    assert.equal(lookup(row(8).localId), undefined);
  });
});

test("history/live/confirmation collisions reject another conversation without moving or destroying either room's row", async () => {
  const original = row(8);
  await messageStore.save(original);
  const foreign = { ...original, conversationId: "foreign-room", content: "Must not overwrite" };
  await assert.rejects(messageStore.saveMany([foreign]), /identity across conversations/);
  await assert.rejects(messageStore.saveReceived(foreign, () => true, "me"), /identity across conversations/);
  const pending = row(9, { localId: "pending-foreign", id: "pending-foreign", conversationId: "foreign-room", status: "SENDING", senderId: "me" });
  await messageStore.save(pending);
  await assert.rejects(messageStore.confirm(pending.localId, original.id), /identity across conversations/);
  assert.equal((await messageStore.getByLocalId(original.localId)).conversationId, "room");
  assert.equal((await messageStore.getByLocalId(original.localId)).content, original.content);
  assert.equal((await messageStore.getByLocalId(pending.localId)).id, pending.id);
});
