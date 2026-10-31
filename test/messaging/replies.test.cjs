const { test, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  row,
  remote,
  installServer,
  deferred,
  settle,
  metrics,
} = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { roomStore } = require("../../src/db/RoomStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { MessageService } = require("../../src/services/MessageService.ts");
const {
  normalizeRemoteMessage,
} = require("../../src/utils/messaging/serialization.ts");
const {
  createListItemBuilder,
} = require("../../src/utils/messaging/listItems.ts");
const {
  messageMetadata,
  replyPreview,
  previewText,
  waveformPeaks,
  fileIcon,
  fitMedia,
} = require("../../src/utils/messaging/presentation.ts");
const {
  ReplyNavigator,
} = require("../../src/utils/messaging/replyNavigation.ts");
let service, server;
before(runMigrations);
beforeEach(async () => {
  await messageStore.deleteAll();
  await roomStore.deleteAll();
  await receiptQueue.clear();
  server = installServer();
  service = new MessageService("https://example.test/api/v1");
  service.setAuthToken("token");
});
const author = {
  id: "other",
  username: "yuki",
  displayName: "Yuki Tanaka",
  avatarUrl: "https://cdn.test/yuki.jpg",
};
const meta = {
  senderId: "me",
  receiverId: "other",
  conversationId: "room",
  sender: { id: "me", username: "alex" },
};

test("existing author and rich reply snapshots survive SQLite reload without fabricating a parent row", async () => {
  const payload = remote(9, {
    sender: author,
    repliedToId: "old-image",
    repliedTo: {
      id: "old-image",
      content: "A photo",
      senderId: "original-author",
      type: "IMAGE",
      thumbnailUrl: "https://cdn.test/thumb.jpg",
      mediaUrl: "https://cdn.test/photo.jpg",
      sender: {
        id: "original-author",
        username: "mika",
        avatarUrl: "https://cdn.test/mika.jpg",
      },
    },
  });
  await messageStore.save(normalizeRemoteMessage(payload, "me"));
  const saved = await messageStore.getById(payload.id);
  assert.equal(messageMetadata(saved).author.displayName, "Yuki Tanaka");
  const items = createListItemBuilder()([saved], "me", null);
  const preview = items.find((item) => item.kind === "message").repliedTo;
  assert.equal(preview.sender.username, "mika");
  assert.equal(preview.thumbnailUrl, "https://cdn.test/thumb.jpg");
  assert.equal(
    await messageStore.getById("old-image"),
    null,
    "a preview is not an invented historical row",
  );
});
for (const type of [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "SHARED_POST",
  "SHARED_STORY",
]) {
  test(`an existing ${type} message is a valid original for text replies`, async () => {
    const parent = row(1, { type });
    await messageStore.save(parent);
    await service.replyMessage("A reply", meta, parent.id);
    const call = server.calls.find((call) => call.options.method === "POST");
    assert.ok(call.path.endsWith("/reply"));
    const body = JSON.parse(call.options.body);
    assert.equal(body.repliedToId, parent.id);
    assert.equal(body.type, "TEXT");
    assert.equal(body.content, "A reply");
    const reply = (await messageStore.getRecent("room")).find(
      (item) => item.senderId === "me",
    );
    assert.equal(reply.repliedToId, parent.id);
    assert.equal(reply.status, "SENT");
  });
}
for (const type of ["IMAGE", "VIDEO", "AUDIO"]) {
  test(`${type} attachments preserve reply target, type and real metadata through the existing REST DTO`, async () => {
    const extension = { IMAGE: "jpg", VIDEO: "mp4", AUDIO: "m4a" }[type];
    const mime = { IMAGE: "image/jpeg", VIDEO: "video/mp4", AUDIO: "audio/mp4" }[type];
    const name = `recording.${extension}`;
    await messageStore.save(row(1));
    service.uploadMedia = async () => ({
      url: "https://cdn.test/file",
      thumbnailUrl: "https://cdn.test/preview",
      width: 640,
      height: 480,
      size: 8200,
      mimeType: mime,
    });
    await service.sendMediaRecord(
      type,
      `file:///picked/${name}`,
      meta,
      12,
      row(1).id,
      { name, mimeType: mime, size: 8000, width: 600, height: 400 },
    );
    const body = JSON.parse(
      server.calls.find((call) => call.options.method === "POST").options.body,
    );
    assert.equal(body.type, type);
    assert.equal(body.repliedToId, row(1).id);
    assert.equal(body.duration, 12);
    assert.equal(body.thumbnailUrl, "https://cdn.test/preview");
    assert.equal(body.mediaUrl, "https://cdn.test/file");
    assert.equal(body.attachmentData, undefined);
    assert.equal(body.sender, undefined);
    const sent = (await messageStore.getRecent("room")).find(
      (item) => item.senderId === "me",
    );
    assert.equal(messageMetadata(sent).attachment.name, name);
    assert.equal(messageMetadata(sent).attachment.size, 8200);
    assert.equal(messageMetadata(sent).attachment.width, 640);
  });
}
test("unsupported local documents fail honestly without uploading or sending a pretend attachment", async () => {
  await assert.rejects(service.sendMediaRecord("DOCUMENT", "file:///report.pdf", meta), /does not support/);
  assert.equal(server.calls.filter((call) => call.options.method === "POST").length, 0);
  assert.equal((await messageStore.getRecent("room"))[0].status, "FAILED");
});
test("several-hundred-message reply search uses existing offset pages, including timestamp ties", async () => {
  const target = row(10).id;
  server.messages = Array.from({ length: 625 }, (_, index) =>
    remote(index, {
      createdAt: new Date(row(1).timestamp).toISOString(),
      repliedToId: index > 10 && index % 19 === 0 ? target : null,
      sender: {
        id: index % 2 ? "me" : "other",
        username: index % 2 ? "alex" : "yuki",
      },
      senderId: index % 2 ? "me" : "other",
    }),
  );
  const result = await service.loadReplyContext(
    "room",
    "me",
    target,
    () => true,
  );
  assert.equal(result.complete, true);
  assert.equal(result.parent.id, target);
  assert.equal(result.rows.length, 615);
  assert.equal(new Set(result.rows.map((r) => r.id)).size, 615);
  assert.deepEqual(
    result.rows.map((r) => r.id),
    result.rows.map((r) => r.id).sort(),
  );
  assert.equal(
    server.calls.filter((call) => call.path.includes("&page=")).length,
    7,
  );
  assert.equal((await messageStore.getReplies("room", [target])).length, 32);
});
test("far cached parent and replies remain navigable offline, explicitly marked incomplete", async () => {
  const rows = Array.from({ length: 610 }, (_, index) =>
    row(index, {
      repliedToId: index > 5 && index % 20 === 0 ? row(5).id : null,
    }),
  );
  await messageStore.saveMany(rows);
  server.failure = new Error("offline");
  const result = await service.loadReplyContext(
    "room",
    "me",
    row(5).id,
    () => true,
  );
  assert.equal(result.parent.id, row(5).id);
  assert.equal(result.rows.length, 605);
  assert.equal(result.complete, false);
  assert.equal((await messageStore.getReplies("room", [row(5).id])).length, 30);
  assert.ok(result.error);
});
test("cancelled lookup cannot be reported as complete or navigate a new room", async () => {
  const response = deferred();
  let active = true;
  server.response = () => response.promise;
  const work = service.loadReplyContext("room", "me", row(1).id, () => active);
  await settle();
  active = false;
  response.resolve({
    ok: true,
    status: 200,
    json: async () => ({ data: [remote(1)] }),
  });
  await assert.rejects(work, /cancelled/);
});
test("deleted or foreign-room originals are not resurrected or disclosed by lookup", async () => {
  await messageStore.save(row(1));
  await messageStore.deleteOne(row(1).id);
  server.messages = [remote(1)];
  await assert.rejects(
    service.loadReplyContext("room", "me", row(1).id, () => true),
    /deleted/,
  );
  assert.equal(server.calls.length, 0);
  await messageStore.save(row(2, { conversationId: "private-other-room" }));
  await assert.rejects(
    service.loadReplyContext("room", "me", row(2).id, () => true),
    /no longer available/,
  );
});
test("reply context is paginated chronological presentation above the parent, never a history reorder", () => {
  const rows = [
    row(1),
    ...Array.from({ length: 13 }, (_, index) =>
      row(index + 2, { repliedToId: row(1).id }),
    ),
  ];
  const build = createListItemBuilder();
  const before = build(rows, "me", null);
  const after = build(rows, "me", null, new Date(), {
    parentId: row(1).id,
    status: "complete",
    page: 0,
  });
  assert.deepEqual(
    after.filter((r) => r.kind === "message").map((r) => r.id),
    before.filter((r) => r.kind === "message").map((r) => r.id),
  );
  const visual = after.slice().reverse(),
    context = visual.find((r) => r.kind === "reply-context");
  assert.equal(visual[visual.indexOf(context) + 1].message.id, row(1).id);
  assert.equal(context.total, 13);
  assert.equal(context.replies.length, 5);
  assert.equal(context.pageCount, 3);
  assert.deepEqual(
    context.replies.map((r) => r.id),
    rows.slice(1, 6).map((r) => r.id),
  );
  const last = build(rows, "me", null, new Date(), {
    parentId: row(1).id,
    status: "complete",
    page: 2,
  }).find((r) => r.kind === "reply-context");
  assert.deepEqual(
    last.replies.map((r) => r.id),
    rows.slice(11).map((r) => r.id),
  );
  assert.equal(new Set(after.map((r) => r.id)).size, after.length);
});
test("receipt-only changes do not rebuild reply summaries; source edits update the right previews", () => {
  const build = createListItemBuilder(),
    selection = { parentId: row(1).id, status: "complete", page: 0 };
  const rows = [row(1), row(2, { repliedToId: row(1).id }), row(3)];
  const before = build(rows, "me", null, new Date(), selection);
  const after = build(
    [{ ...rows[0], status: "READ", isRead: true }, ...rows.slice(1)],
    "me",
    null,
    new Date(),
    selection,
  );
  assert.equal(
    after.find((r) => r.kind === "reply-context"),
    before.find((r) => r.kind === "reply-context"),
  );
  assert.equal(after.filter((r, index) => r !== before[index]).length, 1);
  const edited = build(
    [{ ...rows[0], content: "edited" }, ...rows.slice(1)],
    "me",
    null,
    new Date(),
    selection,
  );
  assert.equal(
    edited.find((r) => r.kind === "message" && r.message.id === row(2).id)
      .repliedTo.content,
    "edited",
  );
});
test("reply lookup uses a scoped indexed query rather than loading an entire room", async () => {
  await messageStore.saveMany([
    row(1),
    row(2, { repliedToId: row(1).id }),
    row(3, { repliedToId: row(1).id, conversationId: "different" }),
  ]);
  const start = metrics.statements.length;
  assert.equal((await messageStore.getReplies("room", [row(1).id])).length, 1);
  assert.equal(metrics.statements.length - start, 1);
  assert.match(metrics.statements.at(-1), /conversation_id/);
  assert.match(metrics.statements.at(-1), /replied_to_id/);
});
test("type-aware previews and actual waveform samples never become fabricated data", () => {
  assert.match(
    previewText({
      ...replyPreview(row(1)),
      type: "AUDIO",
      content: "",
      duration: 65,
    }),
    /1:05/,
  );
  assert.equal(
    previewText({ ...replyPreview(row(1)), type: "IMAGE", content: "" }),
    "Photo",
  );
  assert.equal(
    previewText({
      ...replyPreview(row(1)),
      type: "DOCUMENT",
      content: "budget.pdf",
    }),
    "budget.pdf",
  );
  assert.equal(fileIcon("budget.pdf"), "document-text-outline");
  assert.equal(waveformPeaks(undefined), null);
  assert.equal(waveformPeaks([]), null);
  assert.deepEqual(waveformPeaks([0, 25, 100]), [0, 0.25, 1]);
  assert.deepEqual(waveformPeaks([0, 0.5, 1]), [0, 0.5, 1]);
  assert.equal(waveformPeaks([NaN]), null);
  assert.ok(
    Math.abs(
      fitMedia(400, 1200, 280, 400).width /
        fitMedia(400, 1200, 280, 400).height -
        1 / 3,
    ) < 1e-9,
  );
});
function navigation() {
  const calls = [],
    arrived = [],
    failures = [];
  const list = {
    scrollToIndex: (value) => calls.push(value),
    scrollToOffset: (value) => calls.push(value),
  };
  const nav = new ReplyNavigator({
    list: () => list,
    height: () => 600,
    arrived: (...args) => arrived.push(args),
    failed: () => failures.push(true),
  });
  return { nav, calls, arrived, failures };
}
test("far navigation uses animated native estimates then an exact measured cell, without bottom jumps", () => {
  const { nav, calls, arrived } = navigation();
  const data = createListItemBuilder()(
    Array.from({ length: 650 }, (_, index) => row(index)),
    "me",
    null,
  );
  nav.update(data);
  nav.request(row(4).id);
  const index = data.findIndex(
    (item) => item.kind === "message" && item.message.id === row(4).id,
  );
  assert.equal(calls[0].index, index);
  nav.indexFailed(90);
  nav.measure(data[index].id, index, 60000, 100);
  nav.viewable([row(4).localId]);
  assert.equal(arrived.length, 1);
  assert.equal(arrived[0][0], row(4).localId);
  assert.equal(calls.at(-1).offset, 60000 - 500 * 0.35);
  assert.ok(calls.every((call) => call.animated));
  assert.ok(calls.every((call) => call.offset !== 0));
  const count = calls.length;
  nav.settled();
  nav.viewable([row(4).localId]);
  assert.equal(calls.length, count);
});
test("navigation tracks server/local identity across prepends, and cancels without stale index scrolling", () => {
  const { nav, calls, arrived } = navigation();
  const build = createListItemBuilder();
  const rows = [row(1, { localId: "stable-original" }), row(2), row(3)];
  nav.update(build(rows, "me", null));
  nav.request(row(1).id);
  nav.update(build([...rows, row(4)], "me", null));
  assert.equal(calls.at(-1).index, 3);
  const count = calls.length;
  nav.cancel();
  nav.settled();
  nav.viewable(["stable-original"]);
  assert.equal(calls.length, count);
  assert.equal(arrived.length, 0);
});
test("navigation waits for cache/network insertion and bounds no-progress failures", () => {
  const { nav, calls, failures } = navigation();
  const build = createListItemBuilder();
  nav.update(build([row(50)], "me", null));
  nav.request(row(1).id);
  assert.equal(calls.length, 0);
  nav.update(build([row(1), row(50)], "me", null));
  assert.equal(calls[0].index, 1);
  nav.indexFailed(100);
  const count = calls.length;
  nav.indexFailed(100);
  assert.equal(
    calls.length,
    count,
    "same metrics wait for native layout rather than repeating a guessed scroll",
  );
  assert.equal(failures.length, 0);
  for (const average of [110, 120, 130, 140]) nav.indexFailed(average);
  assert.equal(failures.length, 1);
  assert.equal(nav.pending, false);
  assert.ok(calls.every((call) => call.offset !== 0));
});

test("group/global READ is never inferred as this recipient's personal visibility", () => {
  const incoming = normalizeRemoteMessage(
    remote(1, { status: "READ", isRead: true, receiverId: null }),
    "me",
    true,
  );
  assert.equal(incoming.receiverId, null);
  assert.equal(incoming.isRead, false);
  assert.equal(incoming.status, "DELIVERED");
  const outgoing = normalizeRemoteMessage(
    remote(2, {
      senderId: "me",
      status: "READ",
      isRead: true,
      receiverId: null,
    }),
    "me",
    true,
  );
  assert.equal(outgoing.status, "READ");
  assert.equal(outgoing.isRead, true);
});
test("an already visible original highlights without scrolling unnecessarily toward the bottom", () => {
  const { nav, calls, arrived } = navigation();
  const data = createListItemBuilder()([row(1), row(2)], "me", null);
  nav.update(data);
  nav.measure(data[0].id, 0, 0, 60);
  nav.viewable([row(2).id]);
  nav.request(row(2).id);
  assert.equal(calls.length, 0);
  assert.equal(arrived.length, 1);
});

test("existing participant roster supplies real group display names and survives sparse message profiles", async () => {
  await roomStore.upsertRoom({
    id: "room",
    conversationId: "room",
    name: "Group",
    avatarUrl: "",
    lastMessage: "",
    lastMessageType: "TEXT",
    lastMessageTimestamp: 0,
    unreadCount: 0,
    cachedAt: 1,
    updatedAt: 1,
    isGroup: true,
    participantsData: JSON.stringify([
      {
        id: "other",
        username: "yuki",
        displayName: "Yuki Tanaka",
        avatarUrl: "https://cdn.test/yuki.jpg",
      },
    ]),
  });
  server.messages = [
    remote(1, { sender: { id: "other", username: "yuki" }, receiverId: null }),
  ];
  await service.syncFromServer("room", "me");
  let saved = await messageStore.getById(row(1).id);
  assert.equal(messageMetadata(saved).author.displayName, "Yuki Tanaka");
  await messageStore.saveReceived(
    normalizeRemoteMessage(
      remote(1, {
        sender: { id: "other", username: "yuki" },
        receiverId: null,
      }),
      "me",
      true,
    ),
  );
  saved = await messageStore.getById(row(1).id);
  assert.equal(messageMetadata(saved).author.displayName, "Yuki Tanaka");
  assert.equal(
    messageMetadata(saved).author.avatarUrl,
    "https://cdn.test/yuki.jpg",
  );
});

test("an offline outgoing reply retains its original's type-aware author/media snapshot on reopen", async () => {
  await messageStore.save(
    row(1, {
      type: "VIDEO",
      thumbnailUrl: "https://cdn.test/video.jpg",
      duration: 25,
      senderData: JSON.stringify(author),
    }),
  );
  server.failure = new Error("offline");
  await assert.rejects(
    service.replyMessage("Reply offline", meta, row(1).id),
    /offline/,
  );
  const saved = (await messageStore.getRecent("room")).find(
    (item) => item.senderId === "me",
  );
  assert.equal(saved.status, "FAILED");
  const item = createListItemBuilder()([saved], "me", null)[0];
  assert.equal(item.repliedTo.type, "VIDEO");
  assert.equal(item.repliedTo.duration, 25);
  assert.equal(item.repliedTo.sender.displayName, "Yuki Tanaka");
  assert.equal(item.repliedTo.thumbnailUrl, "https://cdn.test/video.jpg");
});

test("deleting an original atomically redacts persisted reply snapshots and publishes affected previews", async () => {
  await messageStore.save(row(1, { content: "original private text" }));
  await service.replyMessage("a reply", meta, row(1).id);
  const events = [];
  const stop = messageStore.subscribe((change) => events.push(change));
  try {
    await messageStore.deleteOne(row(1).id);
  } finally {
    stop();
  }
  const saved = (await messageStore.getRecent("room")).find(
    (r) => r.senderId === "me",
  );
  assert.equal(messageMetadata(saved).reply.deleted, true);
  assert.equal(messageMetadata(saved).reply.content, "");
  assert.ok(
    events.some((change) => change.rows?.some((r) => r.id === row(1).id)),
  );
  assert.ok(
    events.every((change) => !change.rows || change.rows.length === 1),
    "publish the changed original, not every reply body",
  );
  const preview = createListItemBuilder()([saved], "me", null)[0].repliedTo;
  assert.equal(previewText(preview), "Deleted message");
});
test("stale or out-of-order history cannot put deleted text back into a reply snapshot", async () => {
  const parent = row(1, { deletedAt: "2026-10-30T12:00:00Z" });
  const child = row(2, {
    repliedToId: parent.id,
    replyData: JSON.stringify({
      id: parent.id,
      senderId: "other",
      type: "TEXT",
      content: "must not reappear",
    }),
  });
  await messageStore.saveMany([parent, child]);
  assert.equal(
    messageMetadata(await messageStore.getById(child.id)).reply.deleted,
    true,
  );
  await messageStore.saveMany([child, { ...parent, deletedAt: null }]);
  const saved = await messageStore.getById(child.id);
  assert.equal(messageMetadata(saved).reply.deleted, true);
  assert.equal(messageMetadata(saved).reply.content, "");
});

test("a stale async preview cannot undo a known deletion", () => {
  const {
    mergePersistedMessage,
  } = require("../../src/utils/messaging/timeline.ts");
  const deleted = row(2, {
    repliedToId: row(1).id,
    replyData: JSON.stringify({
      id: row(1).id,
      type: "TEXT",
      content: "",
      deleted: true,
    }),
  });
  const stale = {
    ...deleted,
    replyData: JSON.stringify({
      id: row(1).id,
      type: "TEXT",
      content: "old private text",
      deleted: false,
    }),
  };
  const merged = mergePersistedMessage(deleted, stale);
  assert.equal(JSON.parse(merged.replyData).deleted, true);
  assert.equal(JSON.parse(merged.replyData).content, "");
});

test("immutable outgoing clock skew cannot exclude cached direct replies from context", async () => {
  const parent = row(1, { senderId: "me", timestamp: 10000 });
  const reply = row(2, { timestamp: 200, repliedToId: parent.id });
  await messageStore.saveMany([parent, reply, row(3, { timestamp: 300 })]);
  server.failure = new Error("offline");
  const result = await service.loadReplyContext(
    "room",
    "me",
    parent.id,
    () => true,
  );
  assert.equal(
    result.rows.some((row) => row.id === reply.id),
    true,
  );
  assert.equal(result.parent.timestamp, 10000);
  assert.equal(result.complete, false);
});

test("retrying malformed legacy attachment metadata does not fail again after a successful upload", async () => {
  service.uploadMedia = async () => { throw new Error("Offline upload"); };
  await assert.rejects(service.sendMediaRecord("IMAGE", "file:///legacy.jpg", meta), /Offline upload/);
  const failed = (await messageStore.getRecent("room"))[0];
  await messageStore.patch(failed.localId, { attachmentData: "{malformed" });
  service.uploadMedia = async file => {
    assert.equal(file.type, "image/jpeg");
    return { url: "https://cdn.test/legacy.jpg", size: 123, mimeType: "image/jpeg" };
  };
  await service.retry("room", failed.localId, meta);
  const sent = await messageStore.getByLocalId(failed.localId);
  assert.equal(sent.status, "SENT");
  assert.equal(messageMetadata(sent).attachment.size, 123);
  const body = JSON.parse(server.calls.find(call => call.options.method === "POST").options.body);
  assert.equal(body.mediaUrl, "https://cdn.test/legacy.jpg");
});
