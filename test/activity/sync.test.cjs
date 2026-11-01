const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { deferred, settle } = require("../messaging/harness.cjs");
const { configureStore } = require("@reduxjs/toolkit");
const { raw, event, id, ACCOUNT_A, ACCOUNT_B } = require("./fixtures.cjs");
const { ActivityServer, ActivitySocket, ActivityAppState, response } = require("./server-double.cjs");
const authClient = require("../../src/services/api.ts");
const { notificationApi } = require("../../src/services/NotificationService.ts");
const { NotificationsController } = require("../../src/services/NotificationsController.ts");
const { default: notifications } = require("../../src/store/slices/notificationsSlice.ts");
const { default: auth, setCredentials, setTokens, logout } = require("../../src/store/slices/authSlice.ts");
const originalFetch = global.fetch;
let store, server, socket, app, controller;
const state = () => store.getState().notifications;
function login(accountId = ACCOUNT_A, token = "token-A") {
  authClient.setTokens(token, "refresh-token");
  store.dispatch(setCredentials({ user: { id: accountId, username: accountId === ACCOUNT_A ? "alice" : "bob" }, token }));
}
async function boot(rows = []) {
  server.rows = rows;
  controller.start(ACCOUNT_A);
  await settle();
}
beforeEach(() => {
  server = new ActivityServer(); socket = new ActivitySocket(); app = new ActivityAppState();
  store = configureStore({ reducer: { auth, notifications } });
  login(); global.fetch = server.fetch;
  controller = new NotificationsController(store, notificationApi, socket, app);
});
afterEach(async () => { controller.stop(); await settle(); global.fetch = originalFetch; authClient.setTokens(null, null); authClient.setTokenRefreshCallback(null); });

test("startup is non-blocking and lazy: one real unread-count request, no history or new socket", async () => {
  await boot([raw(1), raw(2, { isRead: true })]);
  assert.deepEqual(server.calls.map(call => call.path), ["/activity/unread-count"]);
  assert.equal(state().unreadCount, 1); assert.equal(state().initialized, false);
  assert.equal(socket.count("notification:new"), 1); assert.equal(socket.count("connect"), 1);
  assert.equal(app.handlers.size, 1);
});

test("history/pagination use exact endpoints and meta, and concurrent load-more is one request", async () => {
  await boot(Array.from({ length: 45 }, (_, i) => raw(i + 1)));
  await controller.open();
  assert.equal(state().items.length, 20); assert.equal(state().unreadCount, 45);
  const gate = deferred(); let snapshot;
  server.interceptor = (call, reply) => { if (call.path === "/activity?page=2&limit=20") { snapshot = reply(); return gate.promise; } };
  const first = controller.loadMore(), second = controller.loadMore();
  assert.equal(first, second); assert.equal(state().paginating, true);
  gate.resolve(snapshot); await first;
  assert.equal(state().items.length, 40); assert.equal(state().page, 2);
  server.interceptor = null;
  await controller.loadMore();
  assert.equal(state().items.length, 45); assert.equal(state().hasMore, false);
  assert.equal(new Set(state().items.map(row => row.id)).size, 45);
  for (const call of server.calls) assert.equal(call.options.headers.Authorization, "Bearer token-A");
});

test("initial history error is not a false empty feed; retry loads real records", async () => {
  await boot([raw(1)]);
  server.interceptor = call => call.route === "/activity" ? response({ message: "Network unavailable" }, 503) : undefined;
  await controller.open();
  assert.equal(state().initialized, false); assert.match(state().error, /Network/); assert.equal(state().loading, false);
  server.interceptor = null; await controller.refresh();
  assert.equal(state().items.length, 1); assert.equal(state().error, null);
});

test("undeployed Activity router is an explicit backend-release error, not a fabricated supported history", async () => {
  server.available = false;
  await boot(); await controller.open();
  assert.match(state().error, /backend release is required/);
  assert.equal(state().initialized, false); assert.equal(state().unreadKnown, false);
});

test("pagination failure retains rows, retries the same page, and does not auto-loop onEndReached", async () => {
  await boot(Array.from({ length: 25 }, (_, i) => raw(i + 1))); await controller.open();
  server.interceptor = call => call.path.includes("page=2") ? response({ message: "Page offline" }, 503) : undefined;
  await controller.loadMore();
  assert.equal(state().items.length, 20); assert.equal(state().page, 1); assert.match(state().paginationError, /Page offline/);
  const before = server.calls.length; await controller.loadMore(); assert.equal(server.calls.length, before);
  server.interceptor = null; await controller.loadMore(true);
  assert.equal(state().items.length, 25); assert.equal(state().paginationError, null);
});

test("refresh queued behind pagination is not lost and overlapping records remain unique", async () => {
  await boot(Array.from({ length: 45 }, (_, i) => raw(i + 1))); await controller.open();
  const gate = deferred(); let snapshot;
  server.interceptor = (call, reply) => { if (call.path === "/activity?page=2&limit=20") { snapshot = reply(); return gate.promise; } };
  const next = controller.loadMore();
  server.rows.push(raw(46));
  const refresh = controller.refresh();
  gate.resolve(snapshot); await next; await refresh;
  assert.equal(state().items[0].id, id(46)); assert.equal(new Set(state().items.map(row => row.id)).size, 41);
  assert.equal(state().page, 2); assert.equal(state().refreshing, false);
  assert.ok(server.calls.some(call => call.path === "/activity?page=1&limit=40"));
});

test("exact socket event inserts a stable-ID row/badge immediately then hydrates actor/post from REST", async () => {
  await boot([raw(1)]); await controller.open();
  const row = raw(2, { type: "COMMENT", content: "replied to your comment" }); server.rows.push(row);
  socket.emit("notification:new", event(row));
  assert.equal(state().items[0].id, row.id); assert.equal(state().unreadCount, 2);
  assert.equal(state().items[0].actor, null);
  await settle();
  assert.equal(state().items[0].actor.username, "mia"); assert.equal(state().items[0].hydrated, true);
  assert.equal(state().items[0].comment.content, "Love this moment!");
});

test("at-least-once duplicate events/pages never duplicate IDs or reset a read row's unread state", async () => {
  const row = raw(1, { isRead: true }); await boot([row]); await controller.open();
  socket.emit("notification:new", event(row)); socket.emit("notification:new", event(row));
  assert.equal(state().items.length, 1); assert.equal(state().unreadCount, 0); assert.equal(state().items[0].isRead, true);
  await settle(); assert.equal(state().unreadCount, 0);
});

test("legacy SHARE event without ID/time recovers the real persisted row by REST, without fake metadata", async () => {
  await boot([raw(1)]); await controller.open();
  const share = raw(2, { type: "SHARE" }); server.rows.push(share);
  socket.emit("notification:new", { type: "SHARE", content: share.content, actorId: share.actorId, resourceId: share.resourceId });
  assert.equal(state().items.length, 1);
  await settle();
  assert.equal(state().items.length, 2); assert.equal(state().items[0].id, share.id); assert.equal(state().items[0].createdAt, share.createdAt);
});

test("individual read is optimistic, single-flight and sends the real UUID in the verified POST shape", async () => {
  await boot([raw(1)]); await controller.open();
  const gate = deferred(); let acknowledgement;
  server.interceptor = (call, reply) => { if (call.route === "/activity/read") { acknowledgement = reply(); return gate.promise; } };
  const first = controller.markRead(id(1)), duplicate = controller.markRead(id(1));
  assert.equal(first, duplicate); assert.equal(state().unreadCount, 0); assert.equal(state().items[0].isRead, true);
  assert.deepEqual(server.calls.at(-1).body, { ids: [id(1)] });
  gate.resolve(acknowledgement); await first; await settle();
  assert.equal(Object.keys(state().pendingReads).length, 0); assert.equal(state().unreadCount, 0);
});

test("failed read rolls back while a concurrent socket arrival survives; authoritative retry can succeed", async () => {
  await boot([raw(1)]); await controller.open();
  const gate = deferred();
  server.interceptor = call => call.route === "/activity/read" ? gate.promise : undefined;
  const pending = controller.markRead(id(1)); const rejected = assert.rejects(pending, /Read failed/);
  server.rows.push(raw(2)); socket.emit("notification:new", event(raw(2)));
  gate.resolve(response({ message: "Read failed" }, 503)); await rejected; await settle();
  assert.equal(state().unreadCount, 2); assert.equal(state().items.find(row => row.id === id(1)).isRead, false);
  server.interceptor = null; await controller.markRead(id(1)); await settle();
  assert.equal(state().unreadCount, 1); assert.equal(state().items.find(row => row.id === id(1)).isRead, true);
});

test("stale in-flight history/count never undo a completed read or optimistic badge", async () => {
  await boot([raw(1), raw(2)]); await controller.open();
  const gate = deferred(); let stale, held = false;
  server.interceptor = (call, reply) => {
    if (call.route === "/activity" && !held) { held = true; stale = reply(); return gate.promise; }
  };
  const refresh = controller.refresh();
  const observed = [];
  await controller.markRead(id(1));
  const unsubscribe = store.subscribe(() => observed.push({ read: state().items.find(row => row.id === id(1))?.isRead, count: state().unreadCount }));
  gate.resolve(stale); await refresh; await settle(); unsubscribe();
  assert.ok(observed.length); assert.ok(observed.every(snapshot => snapshot.read && snapshot.count === 1));
});

test("read-all updates unloaded unread count immediately, preserves arrivals, and uses POST /read-all", async () => {
  await boot(Array.from({ length: 35 }, (_, i) => raw(i + 1))); await controller.open();
  const gate = deferred(); let acknowledgement;
  server.interceptor = (call, reply) => { if (call.route === "/activity/read-all") { acknowledgement = reply(); return gate.promise; } };
  const first = controller.markAllRead(), second = controller.markAllRead();
  assert.equal(first, second); assert.equal(state().unreadCount, 0); assert.equal(state().readAllPending, true);
  server.rows.push(raw(36)); socket.emit("notification:new", event(raw(36)));
  assert.equal(state().unreadCount, 1);
  assert.equal(state().items.find(row => row.id === id(36)).isRead, false);
  gate.resolve(acknowledgement); await first; await settle();
  assert.equal(state().unreadCount, 1); assert.equal(state().readAllPending, false);
  assert.ok(server.calls.some(call => call.route === "/activity/read-all" && JSON.stringify(call.body) === "{}"));
});

test("failed read-all rolls back loaded flags and full-history badge without losing a newer event", async () => {
  await boot(Array.from({ length: 35 }, (_, i) => raw(i + 1))); await controller.open();
  const gate = deferred();
  server.interceptor = call => call.route === "/activity/read-all" ? gate.promise : undefined;
  const pending = controller.markAllRead(), rejected = assert.rejects(pending, /Read all failed/);
  server.rows.push(raw(36)); socket.emit("notification:new", event(raw(36)));
  gate.resolve(response({ message: "Read all failed" }, 503)); await rejected; await settle();
  assert.equal(state().unreadCount, 36); assert.equal(state().items.every(row => !row.isRead), true);
});

test("reconnect recovers missed history plus cross-device reads without another listener/client", async () => {
  await boot([raw(1), raw(2)]); await controller.open();
  socket.emit("disconnect"); server.rows[0].isRead = true; server.rows.push(raw(3));
  assert.equal(state().connected, false);
  socket.emit("connect"); await settle();
  assert.equal(state().items.length, 3); assert.equal(state().unreadCount, 2); assert.equal(state().items.find(row => row.id === id(1)).isRead, true);
  for (const event of ["notification:new", "connect", "disconnect"]) assert.equal(socket.count(event), 1);
});

test("foreground recovery fetches missed data; background socket signals do not do list/network work", async () => {
  await boot([raw(1)]); await controller.open();
  app.change("background"); const before = server.calls.length;
  server.rows.push(raw(2)); socket.emit("notification:new", event(raw(2)));
  await settle(); assert.equal(server.calls.length, before); assert.equal(state().items.length, 1);
  app.change("active"); await settle();
  assert.equal(state().items.length, 2); assert.equal(state().unreadCount, 2); assert.equal(state().foreground, true);
});

test("listener cleanup/restart is exact and old-account requests/events cannot touch a new account", async () => {
  await boot([raw(1)]); await controller.open();
  const gate = deferred(); let stale;
  server.interceptor = (call, reply) => { if (call.route === "/activity") { stale = reply(); return gate.promise; } };
  const oldRefresh = controller.refresh();
  const oldNotification = [...socket.handlers.get("notification:new")][0];
  controller.stop(); assert.equal(socket.handlers.size, 0); assert.equal(app.handlers.size, 0);
  login(ACCOUNT_B, "token-B");
  server.rows.push(raw(2, { userId: ACCOUNT_B })); server.interceptor = null;
  controller.start(ACCOUNT_B); await controller.open();
  oldNotification(event(raw(3)));
  gate.resolve(stale); await oldRefresh; await settle();
  assert.equal(state().accountId, ACCOUNT_B); assert.deepEqual(state().items.map(row => row.id), [id(2)]);
  assert.equal(state().unreadCount, 1); assert.equal(socket.count("notification:new"), 1); assert.equal(app.handlers.size, 1);
});

test("batched logout → same-account login rejects old session work; current token rotation retains history", async () => {
  await boot([raw(1)]); await controller.open();
  const oldHandler = [...socket.handlers.get("notification:new")][0];
  store.dispatch(logout()); login();
  oldHandler(event(raw(2)));
  assert.equal(state().items.length, 0);
  controller.start(ACCOUNT_A); await controller.open();
  authClient.setTokens("token-A-new", "refresh-new"); store.dispatch(setTokens({ token: "token-A-new", refreshToken: "refresh-new" }));
  await controller.refresh();
  assert.equal(state().items.length, 1); assert.equal(socket.count("notification:new"), 1);
  assert.equal(server.calls.at(-1).options.headers.Authorization, "Bearer token-A-new");
});

test("unread snapshot started before a socket arrival cannot double-count it or replace the optimistic count", async () => {
  server.rows = [raw(1)];
  const gate = deferred(); let stale, held = false;
  server.interceptor = (call, reply) => { if (call.route === "/activity/unread-count" && !held) { held = true; stale = reply(); return gate.promise; } };
  controller.start(ACCOUNT_A);
  server.rows.push(raw(2)); socket.emit("notification:new", event(raw(2)));
  assert.equal(state().unreadCount, 1, "tentative new activity before the initial total arrives");
  gate.resolve(stale); await settle();
  assert.equal(state().unreadCount, 2); assert.equal(state().unreadKnown, true);
});

test("revalidation fetch is capped at backend-supported 100 rows, retaining an overlapping deep tail", async () => {
  await boot(Array.from({ length: 180 }, (_, i) => raw(i + 1))); await controller.open();
  for (let i = 0; i < 6; i++) await controller.loadMore();
  assert.equal(state().items.length, 140);
  server.rows.push(raw(181));
  await controller.refresh();
  assert.equal(server.calls.at(-1).path, "/activity?page=1&limit=100");
  assert.equal(state().items.length, 141); assert.equal(state().page, 7);
  await controller.loadMore();
  assert.deepEqual(state().items.map(row => row.id), Array.from({ length: 160 }, (_, i) => id(181 - i)));
});

test("late unseen old envelopes cannot inflate counts or skip the next history page", async () => {
  await boot(Array.from({ length: 100 }, (_, i) => raw(i + 1))); await controller.open();
  for (let number = 1; number <= 20; number++) socket.emit("notification:new", event(raw(number)));
  assert.equal(state().unreadCount, 100); assert.equal(state().items.length, 20);
  await settle(); await controller.loadMore();
  assert.deepEqual(state().items.map(row => row.id), Array.from({ length: 40 }, (_, i) => id(100 - i)));
});

test("native connect_error forwarded by the existing error facade clears stale Live state", async () => {
  await boot(); assert.equal(state().connected, true);
  socket.connected = false; socket.emit("error", "Invalid token");
  assert.equal(state().connected, false);
});

test("stopping/restarting while a read is pending releases optimism and does not leave a permanently busy slice", async () => {
  await boot([raw(1)]); await controller.open();
  const gate = deferred(); let ack;
  server.interceptor = (call, reply) => { if (call.route === "/activity/read") { ack = reply(); return gate.promise; } };
  const pending = controller.markRead(id(1));
  assert.equal(Object.keys(state().pendingReads).length, 1);
  controller.stop();
  assert.equal(Object.keys(state().pendingReads).length, 0); assert.equal(state().items[0].isRead, false);
  server.interceptor = null; controller.start(ACCOUNT_A); await controller.open();
  gate.resolve(ack); await pending; await settle();
  assert.equal(state().items[0].isRead, true); assert.equal(state().unreadCount, 0);
});

test("an ambiguous failed acknowledgement reconciles an already-committed read instead of pretending to know server failure", async () => {
  await boot([raw(1)]); await controller.open();
  server.interceptor = (call, reply) => {
    if (call.route === "/activity/read") { reply(); return response({ message: "Acknowledgement lost" }, 502); }
  };
  await assert.rejects(controller.markRead(id(1)), /Acknowledgement lost/); await settle();
  assert.equal(state().items[0].isRead, true); assert.equal(state().unreadCount, 0);
});

test("specific read validation enforces UUIDs and 1–200 IDs without sending invalid bodies", async () => {
  const before = server.calls.length;
  for (const ids of [[], ["local-id"], Array.from({ length: 201 }, (_, i) => id(i + 1))])
    await assert.rejects(notificationApi.read(ids, "token-A", new AbortController().signal), /Invalid Activity/);
  assert.equal(server.calls.length, before);
});

test("partial cross-device reads discovered during pagination revalidate a deep retained tail", async () => {
  await boot(Array.from({ length: 180 }, (_, i) => raw(i + 1))); await controller.open();
  for (let i = 0; i < 6; i++) await controller.loadMore();
  server.rows.find(row => row.id === id(45)).isRead = true;
  await controller.loadMore(); await settle();
  assert.equal(state().items.length, 100);
  assert.equal(state().page, 5);
  assert.equal(state().unreadCount, 179);
  await controller.loadMore(); await controller.loadMore();
  assert.equal(state().items.find(row => row.id === id(45)).isRead, true);
});
