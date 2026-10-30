const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { row, deferred, settle, installServer, native, database } = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { mediaService } = require("../../src/services/MediaService.ts");
const { registerAppDialogHandler } = require("../../src/services/AppDialogService.ts");
const { useOverlay } = require("../../src/providers/OverlayProvider.tsx");
const { useMessageSelection } = require("../../src/hooks/useMessageSelection.ts");
const { runMessageBatch, copyableMessageText } = require("../../src/utils/messaging/actions.ts");
let renderer, selection, fixture, server, menu, dialog, unregister;
function Probe({ messages }) {
  const value = useMessageSelection(messages, "me");
  React.useLayoutEffect(() => { selection = value; }, [value]);
  return null;
}
async function mount(messages) {
  fixture = messages;
  await messageStore.saveMany(messages);
  await act(async () => { renderer = create(React.createElement(Probe, { messages })); });
}
async function select(...messages) { await act(async () => messages.forEach(message => selection.toggle(message))); }
async function confirm(mode) {
  await act(async () => selection.requestDelete());
  const action = menu.find(item => item.key === mode);
  assert.ok(action);
  await act(async () => action.onPress());
  assert.ok(dialog.buttons.find(button => button.destructive));
  await act(async () => { dialog.buttons.find(button => button.key === "delete").onPress(); await settle(); });
}
const response = (ok, data, status = ok ? 200 : 403) => ({ ok, status, json: async () => data });
before(async () => { await runMigrations(); });
beforeEach(async () => {
  await messageStore.deleteAll();
  mediaService.message.resetSession();
  mediaService.message.setAuthToken("token");
  server = installServer();
  menu = null; dialog = null;
  useOverlay().openActionMenu = items => { menu = items; };
  unregister = registerAppDialogHandler(options => { dialog = options; });
  native.Clipboard.setString = () => {};
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  unregister();
});

test("selection uses immutable stable local IDs, stable callbacks, remote pruning and back-before-navigation", async () => {
  await mount([row(1), row(2)]);
  const toggle = selection.toggle;
  const back = selection.handleBack;
  await select(fixture[0], fixture[1]);
  assert.equal(selection.ids.size, 2);
  assert.equal(selection.toggle, toggle);
  assert.equal(selection.handleBack, back);
  await act(async () => renderer.update(React.createElement(Probe, { messages: [row(2, { status: "READ" })] })));
  assert.deepEqual([...selection.ids], [row(2).localId]);
  await act(async () => assert.equal(selection.handleBack(), true));
  assert.equal(selection.active, false);
  assert.equal(selection.handleBack(), false);
});

test("mixed delete-for-me waits for confirmation, persists only accepted IDs, and retains received-message permission failures", async () => {
  const own = row(1, { senderId: "me" }), incoming = row(2), failed = row(3, { senderId: "me", status: "FAILED" });
  await mount([own, incoming, failed]);
  await select(own, incoming, failed);
  server.response = async (url, options) => {
    const id = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
    if (id === incoming.id) return response(false, { message: "Cannot delete someone else's message" });
    return response(true, { success: true, data: { messageId: id, deleteFor: JSON.parse(options.body).deleteFor } });
  };
  await act(async () => { selection.requestDelete(); menu.find(item => item.key === "me").onPress(); });
  assert.equal(server.calls.length, 0, "a menu/confirmation is not a deletion");
  assert.match(dialog.message, /received messages/);
  await act(async () => { dialog.buttons.find(button => button.key === "delete").onPress(); await settle(); });
  assert.equal(server.calls.length, 2, "unsent failed drafts are removed locally, never sent to DELETE");
  assert.deepEqual([...selection.ids], [incoming.localId]);
  assert.match(selection.notice, /2 deleted; 1 kept selected/);
  assert.match(selection.notice, /Cannot delete someone else's message/);
  assert.ok((await messageStore.getById(own.id)).deletedAt);
  assert.ok((await messageStore.getById(failed.id)).deletedAt);
  assert.equal((await messageStore.getById(incoming.id)).deletedAt, null);
  assert.equal(database.prepare("SELECT count(*) AS n FROM message_invalidations").get().n, 2);
});

test("mixed everyone deletion requests only owned committed messages and keeps every ineligible selection", async () => {
  await mount([row(1, { senderId: "me" }), row(2), row(3, { senderId: "me", status: "FAILED" }), row(4, { senderId: "me", status: "SENDING" })]);
  await select(...fixture);
  await confirm("everyone");
  assert.match(dialog.title, /Delete 1 message for everyone/);
  assert.match(dialog.message, /3 ineligible messages/);
  assert.equal(server.calls.length, 1);
  assert.deepEqual(JSON.parse(server.calls[0].options.body), { deleteFor: "everyone" });
  assert.deepEqual([...selection.ids], fixture.slice(1).map(message => message.localId));
  assert.match(selection.notice, /1 deleted; 3 kept selected/);
});

test("a rejected or mismatched success response never tombstones content or creates a ledger entry", async () => {
  await mount([row(1, { senderId: "me" })]);
  await select(...fixture);
  server.response = async () => response(true, { success: true, data: { messageId: "not-this-id", deleteFor: "me" } });
  await confirm("me");
  assert.equal(selection.ids.size, 1);
  assert.match(selection.notice, /did not confirm/);
  assert.equal((await messageStore.getById(fixture[0].id)).content, fixture[0].content);
  assert.equal(database.prepare("SELECT count(*) AS n FROM message_invalidations").get().n, 0);
});

test("copy uses human text/captions in canonical order and keeps non-text attachments selected", async () => {
  await mount([row(1, { content: "Hello" }), row(2, { type: "IMAGE", content: "Photo caption" }),
    row(3, { type: "SHARED_POST", content: JSON.stringify({ sharedPostId: "p", content: "Shared caption" }) }),
    row(4, { type: "AUDIO", content: "recording.m4a" }), row(5, { type: "DOCUMENT", content: "plan.pdf" })]);
  await select(...[...fixture].reverse());
  let copied;
  native.Clipboard.setString = value => { copied = value; };
  await act(async () => { await selection.copy(); });
  assert.equal(copied, "Hello\n\nPhoto caption\n\nShared caption");
  assert.deepEqual([...selection.ids].sort(), fixture.slice(3).map(message => message.localId));
  assert.match(selection.notice, /Attachments.*remain selected/);
  assert.equal(copyableMessageText(row(9, { content: "secret", deletedAt: "2026-10-30" })), null);
});

test("clipboard rejection keeps the entire selection, and pending actions consume hardware-back intent", async () => {
  await mount([row(1)]);
  await select(...fixture);
  const pending = deferred();
  native.Clipboard.setString = () => pending.promise;
  let copying;
  await act(async () => { copying = selection.copy(); });
  assert.equal(selection.busy, true);
  assert.equal(selection.handleBack(), true);
  assert.equal(selection.cancel(), false);
  await act(async () => { pending.reject(new Error("Clipboard unavailable")); await copying; });
  assert.equal(selection.busy, false);
  assert.equal(selection.ids.size, 1);
  assert.match(selection.notice, /Clipboard unavailable/);
});

test("bounded batch never exceeds three concurrent requests and reports deterministic partial results", async () => {
  const messages = Array.from({ length: 8 }, (_, i) => row(i));
  const gates = messages.map(() => deferred());
  let active = 0, peak = 0;
  const calls = [];
  const work = runMessageBatch(messages, async message => {
    const index = messages.indexOf(message);
    calls.push(index); peak = Math.max(peak, ++active);
    try { await gates[index].promise; } finally { active--; }
  });
  assert.deepEqual(calls, [0, 1, 2]);
  gates[2].resolve(); await settle();
  gates[1].reject(new Error("forbidden")); await settle();
  gates[0].resolve(); await settle();
  for (const gate of gates.slice(3)) gate.resolve();
  const result = await work;
  assert.equal(peak, 3);
  assert.equal(new Set(calls).size, messages.length);
  assert.deepEqual(result.failed.map(item => item.row.id), [messages[1].id]);
  assert.deepEqual(result.succeeded.map(message => message.id), messages.filter((_, i) => i !== 1).map(message => message.id));
});

test("forward uses the real individual endpoint in input order, with persisted destination rows and no repeat after partial failure", async () => {
  await mount([row(1), row(2, { type: "IMAGE", mediaUrl: "https://files.test/image.jpg" })]);
  await select(...fixture);
  const forwardedIds = [];
  let rejectSecond = true;
  server.response = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ["messageId", "targetConversationId"]);
    assert.equal(body.targetConversationId, "group-destination");
    assert.ok(server.calls.at(-1).path.endsWith("/messages/messages/forward"));
    if (body.messageId === fixture[1].id && rejectSecond) return response(false, { message: "Not a participant in target conversation" });
    forwardedIds.push(body.messageId);
    const original = fixture.find(message => message.id === body.messageId);
    return response(true, { success: true, data: { ...original, id: `forward-${original.id}`, senderId: "me",
      conversationId: body.targetConversationId, isGroup: true, forwardedFromId: body.messageId,
      createdAt: new Date(1700000000000 + forwardedIds.length).toISOString() } });
  };
  await act(async () => { selection.openForward(); await selection.forward("group-destination"); });
  assert.equal(selection.forwardOpen, true);
  assert.match(selection.forwardError, /1 forwarded; 1 kept selected/);
  assert.deepEqual([...selection.ids], [fixture[1].id]);
  rejectSecond = false;
  await act(async () => { await selection.forward("group-destination"); });
  assert.equal(selection.forwardOpen, false);
  assert.equal(selection.ids.size, 0);
  assert.deepEqual(forwardedIds, fixture.map(message => message.id), "retry only the failed item, not the successful forward");
  const destination = await messageStore.getByRoom("group-destination");
  assert.equal(destination.length, 2);
  assert.equal(destination[1].type, "IMAGE");
  assert.equal(destination[1].forwardedFromId, fixture[1].id);
});

test("unmount stops launching further bounded batch work and does not continue forwarding with a new session", async () => {
  await mount([row(1), row(2)]);
  await select(...fixture);
  const pending = deferred();
  server.response = async () => pending.promise;
  let work;
  await act(async () => { work = selection.forward("target"); await settle(); });
  assert.equal(server.calls.length, 1);
  await act(async () => renderer.unmount()); renderer = null;
  pending.resolve(response(false, { message: "request rejected" }));
  await work;
  assert.equal(server.calls.length, 1);
});

test("account/session reset stops a still-mounted batch before its next message", async () => {
  await mount([row(1), row(2)]);
  await select(...fixture);
  const pending = deferred();
  server.response = async () => pending.promise;
  let work;
  await act(async () => { work = selection.forward("target"); await settle(); });
  assert.equal(server.calls.length, 1);
  mediaService.message.resetSession();
  mediaService.message.setAuthToken("next-account-token");
  await act(async () => { pending.resolve(response(false, { message: "old request failed" })); await work; });
  assert.equal(server.calls.length, 1, "cleanup need not wait for the old screen to unmount");
  await act(async () => { await selection.forward("target"); });
  assert.equal(server.calls.length, 1, "a stale interaction cannot start work with the next account token");
});
