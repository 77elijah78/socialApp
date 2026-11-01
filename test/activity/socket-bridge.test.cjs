// Actual shared SocketReceiver + Activity coordinator; native Socket.IO/HTTP/SQLite
// test harness only. This is NOT two physical devices or a deployed Kafka test.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sockets, settle } = require("../messaging/harness.cjs");
const { configureStore } = require("@reduxjs/toolkit");
const { raw, event, id, ACCOUNT_A } = require("./fixtures.cjs");
const { ActivityServer, ActivityAppState, response } = require("./server-double.cjs");
const { default: notifications } = require("../../src/store/slices/notificationsSlice.ts");
const { default: auth, setCredentials } = require("../../src/store/slices/authSlice.ts");
const { runMigrations } = require("../../src/db/migrations.ts");
const { SocketReceiver } = require("../../src/services/SocketReceiver.ts");
const { NotificationsController } = require("../../src/services/NotificationsController.ts");
const { notificationApi } = require("../../src/services/NotificationService.ts");
const { setTokens } = require("../../src/services/api.ts");

test("Activity consumes the actual notification:new bridge, survives token reconnect and never owns/disconnects chat's socket", async () => {
  await runMigrations();
  const originalFetch = global.fetch;
  const server = new ActivityServer(), app = new ActivityAppState();
  server.rows = [raw(1)];
  server.interceptor = call => call.route.startsWith("/messages/") ? response({ success: true, data: [] }) : undefined;
  global.fetch = server.fetch;
  setTokens("token-A", "refresh-A");
  const store = configureStore({ reducer: { auth, notifications } });
  store.dispatch(setCredentials({ user: { id: ACCOUNT_A }, token: "token-A" }));
  const receiver = new SocketReceiver("https://api.test");
  const controller = new NotificationsController(store, notificationApi, {
    on: (name, callback) => receiver.on(name, callback), isConnected: () => receiver.isConnected,
  }, app);
  const syncErrors = [], releaseErrors = receiver.on("sync:error", error => syncErrors.push(error));
  const releaseChat = receiver.on("message:new", () => {});
  const createdBefore = sockets.length;
  try {
    controller.start(ACCOUNT_A);
    assert.equal(sockets.length, createdBefore, "Activity did not construct a Socket.IO client");
    receiver.connect(ACCOUNT_A, "token-A");
    const first = sockets.at(-1); first.receive("connect");
    await controller.open(); await settle();
    assert.equal(first.handlers.get("notification:new").length, 1);
    const oldCallback = first.handlers.get("notification:new")[0];
    server.rows.push(raw(2)); first.receive("notification:new", event(raw(2)));
    assert.equal(store.getState().notifications.unreadCount, 2);
    await settle();
    assert.equal(store.getState().notifications.items[0].actor.username, "mia");
    receiver.connect(ACCOUNT_A, "token-A-fresh");
    assert.equal(first.connected, false); assert.equal(first.handlers.size, 0);
    const next = sockets.at(-1); next.receive("connect");
    await settle();
    oldCallback(event(raw(999)));
    server.rows.push(raw(3)); next.receive("notification:new", event(raw(3))); await settle();
    assert.deepEqual(store.getState().notifications.items.map(row => row.id), [id(3), id(2), id(1)]);
    assert.equal(receiver.listeners.get("notification:new").size, 1);
    assert.equal(next.handlers.get("notification:new").length, 1);
    assert.equal(sockets.length, createdBefore + 2, "only the existing owner performed a legitimate reconnect");
    assert.deepEqual(syncErrors, []);
    controller.stop();
    assert.equal(receiver.listeners.has("notification:new"), false);
    assert.equal(receiver.listeners.get("message:new").size, 1);
    assert.equal(next.connected, true, "unmounting Activity did not disconnect messaging");
  } finally {
    controller.stop(); releaseChat(); releaseErrors(); receiver.disconnect();
    await settle(); global.fetch = originalFetch; setTokens(null, null);
  }
});
