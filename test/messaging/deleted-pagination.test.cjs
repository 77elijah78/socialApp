const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { row, remote, installServer, settle } = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { roomStore } = require("../../src/db/RoomStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { syncStateStore } = require("../../src/db/syncStateStore.ts");
const { socketReceiver } = require("../../src/services/SocketReceiver.ts");
const { mediaService } = require("../../src/services/MediaService.ts");
const { useChat } = require("../../src/hooks/useChat.ts");
let chat, renderer, server;
function Probe() {
  const value = useChat({ conversationId: "room", currentUser: { id: "me", token: "token" }, isFocused: true });
  React.useLayoutEffect(() => { chat = value; }, [value]);
  return null;
}
async function mount(messages, failCursor) {
  server = installServer(messages);
  server.response = async (url) => {
    const params = new URL(url).searchParams;
    const cursor = params.get("cursorId");
    if (failCursor?.(cursor)) throw new Error("Temporary history failure");
    const sorted = [...messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
    const start = cursor ? sorted.findIndex(message => message.id === cursor) + 1 : 0;
    const page = sorted.slice(start, start + Number(params.get("limit"))).reverse();
    return { ok: true, status: 200, json: async () => ({ success: true, data: page, meta: { total: messages.length, nextCursor: page[0]?.id } }) };
  };
  await act(async () => { renderer = create(React.createElement(Probe)); await settle(); });
}
before(async () => { await runMigrations(); });
beforeEach(async () => {
  socketReceiver.disconnect(); mediaService.message.resetSession(); mediaService.message.setAuthToken("token");
  await messageStore.deleteAll(); await roomStore.deleteAll(); await receiptQueue.clear(); await syncStateStore.clear();
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const history = (from, to) => Array.from({ length: 100 }, (_, i) => remote(i, i >= from && i <= to ? {
  deletedAt: "2026-10-30T12:00:00Z", deletedBy: "other", content: "",
} : {}));

test("a full tombstone page advances its raw server cursor and reveals the next live older messages", async () => {
  await mount(history(30, 69));
  assert.equal(chat.messages.length, 30);
  const before = server.calls.length;
  await act(async () => { await chat.loadMore(); });
  assert.equal(chat.messages.length, 50);
  assert.equal(server.calls.length - before, 2);
  assert.ok(server.calls.at(-1).path.includes(`cursorId=${row(40).id}`));
  assert.equal(chat.messages[0].id, row(10).id);
  assert.equal(chat.hasMore, true);
  assert.equal((await receiptQueue.getBatch("READ")).length, 0, "history fetching is not reading");
});

test("a failure after confirmed tombstones retries the failed cursor, not the beginning or false EOF", async () => {
  let failing = true;
  await mount(history(30, 69), cursor => failing && cursor === row(40).id);
  await act(async () => { await chat.loadMore(); });
  assert.equal(chat.messages.length, 30);
  assert.ok(chat.paginationError);
  assert.equal(chat.hasMore, true);
  const failed = server.calls.at(-1).path;
  failing = false;
  await act(async () => { await chat.loadMore(); });
  assert.equal(server.calls.at(-1).path, failed);
  assert.equal(chat.messages.length, 50);
  assert.equal(chat.paginationError, null);
});

test("exhausting only deleted older pages terminates at actual empty server history without repeated read or reload", async () => {
  await mount(history(0, 69));
  await act(async () => { await chat.loadMore(); });
  assert.equal(chat.messages.length, 30);
  assert.equal(chat.hasMore, false);
  const calls = server.calls.length;
  await act(async () => { await chat.loadMore(); });
  assert.equal(server.calls.length, calls);
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
});

test("a fresh room whose entire server head is deleted loads the nearest live older page without navigation or an empty-list pagination trap", async () => {
  await mount(history(70, 99));
  assert.equal(chat.messages.length, 30);
  assert.equal(chat.messages.at(-1).id, row(69).id);
  assert.equal(server.calls.length, 2);
});

for (const firstDeleted of [70, 80]) {
  test(`deleting the only cached head row admits the next live server rows instead of retaining its removed floor (${firstDeleted})`, async () => {
    await messageStore.save(row(99));
    await mount(history(firstDeleted, 99));
    assert.ok(chat.messages.length > 0);
    assert.equal(chat.messages.at(-1).id, row(firstDeleted - 1).id);
    assert.equal(chat.messages.some(message => message.id === row(99).id), false);
  });
}
