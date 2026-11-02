const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { row, remote, installServer, settle, database } = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { MessageStore, messageStore } = require("../../src/db/MessageStore.ts");
const { roomStore } = require("../../src/db/RoomStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { socketReceiver } = require("../../src/services/SocketReceiver.ts");
const { normalizeRemoteMessage } = require("../../src/utils/messaging/serialization.ts");
const { replyPreview, previewText, previewThumbnail, messageMetadata } = require("../../src/utils/messaging/presentation.ts");
const { createListItemBuilder } = require("../../src/utils/messaging/listItems.ts");
const ReplyPreview = require("../../src/components/messages/ReplyPreview.tsx").default;
const { useRooms } = require("../../src/hooks/useRooms.ts");
let renderer, server;
before(async () => { await runMigrations(); });
beforeEach(async () => {
  socketReceiver.disconnect();
  await messageStore.deleteAll(); await roomStore.deleteAll(); await receiptQueue.clear();
  server = installServer();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  socketReceiver.disconnect();
});

test("sparse duplicate notifications retain relationship, author and richer local media reply metadata", async () => {
  const source = row(1, { type: "VIDEO", mediaUrl: "https://files.test/v.mp4", thumbnailUrl: "https://files.test/v.jpg", duration: 37,
    senderData: JSON.stringify({ id: "other", username: "alice" }) });
  const reply = row(2, { repliedToId: source.id, replyData: JSON.stringify(replyPreview(source)) });
  await messageStore.saveMany([source, reply]);
  await messageStore.saveReceived(normalizeRemoteMessage({ ...remote(2), sender: { username: "alice" } }, "me"), () => true, "me");
  const saved = await messageStore.getById(reply.id);
  assert.equal(saved.repliedToId, source.id);
  const preview = createListItemBuilder()([saved], "me", null).find(item => item.kind === "message").repliedTo;
  assert.equal(preview.sender.username, "alice");
  assert.equal(preview.duration, 37);
  assert.equal(previewThumbnail(preview), source.thumbnailUrl);
  assert.match(previewText(preview), /Video.*0:37/);
});

test("all media reply models preserve real author, image/video thumbnails, voice duration and document name/size", () => {
  const author = JSON.stringify({ username: "alice", displayName: "Alice" });
  const image = replyPreview(row(1, { senderData: author, type: "IMAGE", mediaUrl: "https://files.test/photo.jpg", content: "Actual photo" }));
  const video = replyPreview(row(2, { senderData: author, type: "VIDEO", thumbnailUrl: "https://files.test/video.jpg", duration: 61, content: "Actual video" }));
  const voice = replyPreview(row(3, { senderData: author, type: "AUDIO", duration: 12, content: null }));
  const document = replyPreview(row(4, { senderData: author, type: "DOCUMENT", content: null,
    attachmentData: JSON.stringify({ name: "Quarterly plan.pdf", size: 2048, mimeType: "application/pdf" }) }));
  for (const quote of [image, video, voice, document]) assert.equal(quote.sender.displayName, "Alice");
  assert.equal(previewThumbnail(image), "https://files.test/photo.jpg");
  assert.equal(previewThumbnail(video), "https://files.test/video.jpg");
  assert.match(previewText(image), /Photo.*Actual photo/);
  assert.match(previewText(video), /1:01.*Actual video/);
  assert.match(previewText(voice), /Voice message.*0:12/);
  assert.match(previewText(document), /Quarterly plan\.pdf.*2\.0 KB/);
});

test("shared quote snapshots parse before bounding and never retain the raw serialized shared payload", () => {
  const source = row(1, { type: "SHARED_POST", content: JSON.stringify({ sharedPostId: "post", content: "Long caption ".repeat(1000), authorName: "Alice", imageUrl: "https://files.test/post.jpg" }) });
  const quote = replyPreview(source);
  assert.equal(quote.content.length, 240);
  assert.ok(quote.content.endsWith("…"));
  assert.equal(previewThumbnail(quote), "https://files.test/post.jpg");
  assert.ok(JSON.stringify(quote).length < 700);
  assert.ok(!quote.content.startsWith("{"));
});

test("real reply preview has a thumbnail fallback and a visible video indicator without needing text content", async () => {
  const quote = replyPreview(row(1, { type: "VIDEO", thumbnailUrl: "https://files.test/video.jpg", content: null, duration: 37 }));
  await act(async () => { renderer = create(React.createElement(ReplyPreview, { message: quote, userId: "me" })); });
  const thumb = renderer.root.findByType("ExpoImage");
  assert.equal(thumb.props.source.uri, quote.thumbnailUrl);
  assert.ok(renderer.root.findAllByProps({ name: "videocam-outline" }).length);
  await act(async () => thumb.props.onError());
  assert.equal(renderer.root.findAllByType("ExpoImage").length, 0);
  assert.ok(renderer.root.findAllByProps({ name: "videocam-outline" }).length);
});

test("an original with sparse cached sender data never erases the actual author from a known enriched quote", async () => {
  const source = row(1);
  const child = row(2, { repliedToId: source.id, replyData: JSON.stringify({ id: source.id, senderId: "other", sender: { username: "alice" }, type: "TEXT", content: source.content }) });
  await messageStore.saveMany([source, child]);
  const saved = await messageStore.getById(child.id);
  assert.equal(messageMetadata(saved).reply.sender.username, "alice");
  const model = createListItemBuilder()([source, saved], "me", null).find(item => item.kind === "message" && item.message.id === child.id);
  assert.equal(model.repliedTo.sender.username, "alice");
});

test("uncached-original deletion redacts existing replies immediately without publishing/fetching canonical parent bodies", async () => {
  const parentId = "never-cached";
  await messageStore.save(row(2, { repliedToId: parentId, replyData: JSON.stringify({ id: parentId, senderId: "other", type: "IMAGE", content: "Private caption", mediaUrl: "https://files.test/private.jpg", sender: { username: "alice" } }) }));
  const events = [];
  const stop = messageStore.subscribe(change => events.push(change));
  await messageStore.deleteOne(parentId, "me", { conversationId: "room", deleteFor: "everyone" });
  stop();
  const saved = await messageStore.getById(row(2).id);
  const quote = messageMetadata(saved).reply;
  assert.equal(quote.deleted, true); assert.equal(quote.content, ""); assert.equal(quote.mediaUrl, null);
  assert.equal(quote.sender.username, "alice");
  assert.equal(await messageStore.getById(parentId), null);
  assert.ok(events.some(event => event.type === "invalidate" && event.messageId === parentId));
  assert.ok(events.every(event => !event.rows), "a compact invalidation does not fan out reply body notifications");
});

test("per-device hide survives physical body-cache eviction, a new store instance, stale originals and stale reply snapshots", async () => {
  await messageStore.save(row(1));
  await messageStore.deleteOne(row(1).id, "me", { conversationId: "room", deleteFor: "me" });
  await messageStore.deleteOlderThan("room", Date.now());
  assert.equal(await messageStore.getById(row(1).id), null);
  const reopened = new MessageStore();
  await reopened.saveMany([row(1), row(2, { repliedToId: row(1).id,
    replyData: JSON.stringify({ id: row(1).id, type: "TEXT", senderId: "other", content: "Must not return" }) })]);
  assert.equal((await reopened.getRecent("room")).length, 1);
  assert.equal((await reopened.getById(row(1).id)).content, null);
  assert.equal(messageMetadata(await reopened.getById(row(2).id)).reply.deleted, true);
  assert.equal(previewText(messageMetadata(await reopened.getById(row(2).id)).reply), "Deleted message");
});

test("delete events are not blocked by an unrelated pending upload, and stale echo cannot enqueue new receipts", async () => {
  await messageStore.save(row(1));
  const release = messageStore.beginOutgoing("me");
  const received = [];
  const stop = socketReceiver.on("message:new", data => received.push(data));
  try {
    socketReceiver.connect("me", "token");
    socketReceiver.socket.receive("message:deleted", { messageId: row(1).id, conversationId: "room", deletedAt: "2026-10-30T12:00:00Z", deletedBy: "other" });
    await settle();
    assert.ok((await messageStore.getById(row(1).id)).deletedAt);
    socketReceiver.socket.receive("message:new", remote(1));
    await settle();
    assert.deepEqual(received, []);
    assert.equal((await receiptQueue.getBatch("DELIVERED")).length, 0);
  } finally { release(); stop(); }
});

test("a deletion preceding own REST identity confirmation still tombstones the stable optimistic local ID", async () => {
  const optimistic = row(1, { senderId: "me", status: "SENDING" });
  await messageStore.save(optimistic);
  socketReceiver.connect("me", "token");
  socketReceiver.socket.receive("message:deleted", { messageId: "confirmed-server-id", conversationId: "room", deletedAt: "2026-10-30T12:00:00Z", deletedBy: "me" });
  await settle();
  await messageStore.confirm(optimistic.localId, "confirmed-server-id");
  const saved = await messageStore.getByServerId("confirmed-server-id");
  assert.equal(saved.localId, optimistic.localId);
  assert.ok(saved.deletedAt);
  assert.equal(saved.content, null);
  assert.equal((await messageStore.getRecent("room")).length, 0);
});

test("server-history tombstones clear receipt work and survive later body eviction", async () => {
  await messageStore.save(row(1));
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  await receiptQueue.enqueue("DELIVERED", "room", [row(1).id]);
  await messageStore.saveMany([normalizeRemoteMessage({ ...remote(1), deletedAt: "2026-10-30T12:00:00Z", deletedBy: "other" }, "me")]);
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
  assert.equal((await receiptQueue.getBatch("DELIVERED")).length, 0);
  await messageStore.deleteOlderThan("room", Date.now());
  await messageStore.saveMany([row(1)]);
  assert.equal((await messageStore.getRecent("room")).length, 0);
});

test("v4 upgrades legacy tombstones/replies in place, and account clearing removes scoped invalidations", async () => {
  await messageStore.saveMany([row(1), row(2, { repliedToId: row(1).id })]);
  database.prepare("UPDATE messages SET deleted_at=?,content=? WHERE id=?").run("2026-10-30T12:00:00Z", "Legacy secret", row(1).id);
  database.prepare("UPDATE messages SET reply_data=? WHERE id=?").run(JSON.stringify({ id: row(1).id, type: "TEXT", senderId: "other", content: "Legacy secret" }), row(2).id);
  database.exec("DROP TABLE message_invalidations; PRAGMA user_version=3");
  const file = require.resolve("../../src/db/migrations.ts"); delete require.cache[file];
  await require(file).runMigrations();
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 4);
  assert.equal((await messageStore.getById(row(1).id)).content, null);
  assert.equal(messageMetadata(await messageStore.getById(row(2).id)).reply.deleted, true);
  assert.equal((await messageStore.getInvalidations([row(1).id])).length, 1);
  await messageStore.deleteAll();
  assert.equal((await messageStore.getInvalidations([row(1).id])).length, 0);
});

test("rooms REST refresh cannot resurrect deleted-for-me content in the conversation preview", async () => {
  await messageStore.save(row(1, { senderId: "me" }));
  await messageStore.deleteOne(row(1).id, "me", { conversationId: "room", deleteFor: "me" });
  server.response = async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: "room", isGroup: false,
    participants: [{ user: { id: "other", username: "alice", displayName: "Alice", avatarUrl: null } }],
    groupName: null, groupAvatar: null, updatedAt: "2026-10-30T12:00:00Z", unreadCount: 0,
    messages: [{ ...remote(1), senderId: "me", content: "Must never reappear in room preview" }] }] }) });
  let rooms;
  function Probe() {
    const state = useRooms();
    React.useLayoutEffect(() => { rooms = state.rooms; }, [state.rooms]);
    return null;
  }
  await act(async () => { renderer = create(React.createElement(Probe)); await settle(); });
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].lastMessage, "Deleted message");
  assert.equal((await roomStore.findRoom("room"))[0].lastMessage, "Deleted message");
});

test("an actual persisted deletion notification can confirm a lost HTTP response without inventing success", async () => {
  const { mediaService } = require("../../src/services/MediaService.ts");
  mediaService.message.setAuthToken("token");
  await messageStore.save(row(1, { senderId: "me" }));
  socketReceiver.connect("me", "token");
  server.response = async () => {
    socketReceiver.socket.receive("message:deleted", { messageId: row(1).id, conversationId: "room", deletedAt: "2026-10-30T12:00:00Z", deletedBy: "me" });
    await settle();
    throw new Error("HTTP response lost after server commit");
  };
  await mediaService.message.delete(row(1).id, "everyone");
  assert.equal((await messageStore.getRecent("room")).length, 0);
  const ledger = await messageStore.getInvalidations([row(1).id]);
  assert.equal(ledger[0].deletionMode, "everyone");
});

test("a personal notification cannot confirm everyone, stale live history cannot promote it, and a later global notification upgrades it monotonically", async () => {
  const { mediaService } = require("../../src/services/MediaService.ts");
  mediaService.message.resetSession(); mediaService.message.setAuthToken("token");
  const original = row(1, { senderId: "me" });
  await messageStore.save(original);
  socketReceiver.connect("me", "token");
  server.response = async () => {
    socketReceiver.socket.receive("message:deleted-for-me", { messageId: original.id, conversationId: "room" });
    await settle();
    throw new Error("Everyone response lost");
  };
  await assert.rejects(mediaService.message.delete(original.id, "everyone"), /Everyone response lost/);
  await messageStore.saveMany([original]);
  assert.equal((await messageStore.getInvalidations([original.id]))[0].deletionMode, "me");
  socketReceiver.socket.receive("message:deleted", { messageId: original.id, conversationId: "room", deletedAt: "2026-10-30T12:00:00Z", deletedBy: "me" });
  await settle();
  assert.equal((await messageStore.getInvalidations([original.id]))[0].deletionMode, "everyone");
  socketReceiver.socket.receive("message:deleted-for-me", { messageId: original.id, conversationId: "room" });
  await settle();
  const calls = server.calls.length;
  await mediaService.message.delete(original.id, "everyone");
  assert.equal(server.calls.length, calls, "a confirmed scoped deletion is idempotent");
  assert.equal((await messageStore.getInvalidations([original.id]))[0].deletionMode, "everyone");
});

test("an actual server history tombstone upgrades a personal hide without treating a stale undeleted body as global proof", async () => {
  const original = row(1);
  await messageStore.save(original);
  await messageStore.deleteOne(original.id, "me", { conversationId: "room", deleteFor: "me" });
  await messageStore.saveMany([original]);
  assert.equal((await messageStore.getInvalidations([original.id]))[0].deletionMode, "me");
  await messageStore.saveMany([{ ...original, deletedAt: "2026-10-30T12:00:00Z", deletedBy: "other" }]);
  assert.equal((await messageStore.getInvalidations([original.id]))[0].deletionMode, "everyone");
  assert.equal((await messageStore.getRecent("room")).length, 0);
  const plan = database.prepare("EXPLAIN QUERY PLAN SELECT * FROM message_invalidations WHERE message_id IN (?)").all(original.id);
  assert.ok(plan.some(step => step.detail.includes("idx_message_invalidations_id")), "room-head ID lookups stay indexed as hidden history grows");
});

test("own server-ID confirmation hydrates persisted child quotes before the original leaves the body cache", async () => {
  const parent = row(1, { localId: "optimistic-parent", id: "optimistic-parent", senderId: "me", status: "SENDING", type: "VIDEO",
    thumbnailUrl: "https://files.test/original.jpg", mediaUrl: "https://files.test/original.mp4", duration: 37,
    senderData: JSON.stringify({ id: "me", username: "original-author" }) });
  await messageStore.save(parent);
  const child = row(2, { repliedToId: "server-parent", replyData: JSON.stringify({ id: "server-parent", senderId: "me", type: "VIDEO", content: "" }) });
  await messageStore.save(child);
  await messageStore.confirm(parent.localId, "server-parent");
  database.prepare("DELETE FROM messages WHERE local_id = ?").run(parent.localId);
  const saved = await messageStore.getByLocalId(child.localId);
  const preview = createListItemBuilder()([saved], "me", null).find(item => item.kind === "message").repliedTo;
  assert.equal(preview.thumbnailUrl, parent.thumbnailUrl);
  assert.equal(preview.duration, 37);
  assert.equal(preview.sender.username, "original-author");
});

test("a real everyone notification upgrades an unknown legacy tombstone scope instead of treating it as unconfirmed forever", async () => {
  await messageStore.save(row(1));
  await messageStore.deleteOne(row(1).id, "me", { conversationId: "room", deleteFor: "me" });
  database.prepare("UPDATE message_invalidations SET deletion_mode = 'legacy'").run();
  socketReceiver.connect("me", "token");
  socketReceiver.socket.receive("message:deleted", { messageId: row(1).id, conversationId: "room", deletedAt: "2026-10-30T12:00:00Z", deletedBy: "other" });
  await settle();
  assert.equal((await messageStore.getInvalidations([row(1).id]))[0].deletionMode, "everyone");
});
