const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../messaging/harness.cjs");
const { raw, id, event, envelope, ACCOUNT_A, ACCOUNT_B } = require("./fixtures.cjs");
const { ACTIVITY_TYPES, normalizeNotificationEvent, normalizeActivityItem, normalizeActivityPage,
  uniqueActivity, activityDestination, activityTime, withoutLegacyActivity } = require("../../src/services/NotificationService.ts");
const { default: reducer, activityAccountChanged, receiveActivity, activityPageReceived,
  activityReadStarted, activityReadFinished, activityUnreadReceived } = require("../../src/store/slices/notificationsSlice.ts");
const { logout, setCredentials } = require("../../src/store/slices/authSlice.ts");
const scope = state => ({ accountId: state.accountId, session: state.session });
const item = (number, patch) => normalizeActivityItem(raw(number, patch), ACCOUNT_A);
function populated(count = 3, total = count) {
  let state = reducer(undefined, activityAccountChanged(ACCOUNT_A));
  return reducer(state, activityPageReceived({ ...scope(state), kind: "initial", version: 0,
    result: { items: Array.from({ length: count }, (_, i) => item(i + 1)), total, unreadCount: total, page: 1, limit: 20, hasNext: total > 20 } }));
}
const start = (state, operation, ids = [], all = false) => reducer(state, activityReadStarted({ ...scope(state), operation, ids, all }));
const finish = (state, operation, error) => reducer(state, activityReadFinished({ ...scope(state), operation, error }));
const arrive = (state, number) => reducer(state, receiveActivity({ ...scope(state), item: normalizeNotificationEvent(event(raw(number))) }));
const applyPage = (state, items, { version = state.version, kind = "refresh", total = items.length, unreadCount = total, page = 1, limit = 20 } = {}) =>
  reducer(state, activityPageReceived({ ...scope(state), kind, version, result: { items, total, unreadCount, page, limit, hasNext: page * limit < total } }));

test("all six real backend enum types hydrate actual ID/time/read state, actor and nullable previews", () => {
  for (const type of ACTIVITY_TYPES) {
    const value = normalizeActivityItem(raw(1, { type, isRead: true }), ACCOUNT_A);
    assert.equal(value.type, type);
    assert.equal(value.id, id(1));
    assert.equal(value.createdAt, raw(1).createdAt);
    assert.equal(value.isRead, true);
    assert.equal(value.hydrated, true);
    assert.equal(value.actor.username, "mia");
    assert.equal(value.actor.avatarUrl, "https://api.test/uploads/images/mia.jpg");
    assert.equal("clientKey" in value, false);
    assert.equal("receivedAt" in value, false);
  }
});

test("reply remains the backend COMMENT type with real server wording and quoted comment", () => {
  const value = item(1, { type: "COMMENT", content: "replied to your comment" });
  assert.equal(value.type, "COMMENT");
  assert.equal(value.content, "replied to your comment");
  assert.equal(value.comment.content, "Love this moment!");
});

test("sparse socket creation has no invented actor/profile; legacy SHARE is a reconciliation hint, not a fabricated row", () => {
  const value = normalizeNotificationEvent(event(raw(1)));
  assert.equal(value.id, id(1));
  assert.equal(value.createdAt, raw(1).createdAt);
  assert.equal(value.hydrated, false);
  assert.equal(value.actor, null);
  assert.equal(normalizeNotificationEvent({ type: "SHARE", content: "shared your post", actorId: "actor", resourceId: "post" }), null);
});

test("malformed events, non-server IDs/times, unsupported types and cross-account REST records are rejected", () => {
  for (const payload of [null, {}, { ...event(raw(1)), id: "client-id" }, { ...event(raw(1)), type: "SYSTEM" },
    { ...event(raw(1)), createdAt: "invalid" }, { ...event(raw(1)), content: 123 }])
    assert.equal(normalizeNotificationEvent(payload), null);
  assert.equal(normalizeActivityItem(raw(1), ACCOUNT_B), null);
  assert.equal(normalizeActivityItem({ ...raw(1), isRead: undefined }, ACCOUNT_A), null);
});

test("real list data plus meta is required; valid empty history is distinguished from a failed/malformed response", () => {
  assert.equal(normalizeActivityPage(envelope([]), ACCOUNT_A, 1, 20).items.length, 0);
  const result = normalizeActivityPage(envelope([raw(1)], { total: 25, unreadCount: 7 }), ACCOUNT_A, 1, 20);
  assert.equal(result.total, 25); assert.equal(result.unreadCount, 7); assert.equal(result.hasNext, true);
  for (const value of [{ data: [] }, { ...envelope([]), success: false }, { ...envelope([]), meta: undefined },
    envelope([raw(1, { userId: ACCOUNT_B })]), envelope([], { unreadCount: -1 }), envelope([], { limit: 100 })])
    assert.throws(() => normalizeActivityPage(value, ACCOUNT_A, 1, 20), /Activity/);
});

test("stable-ID dedupe preserves distinct identical actions and deterministic descending UUID ties", () => {
  const first = item(1), second = item(2, { createdAt: first.createdAt });
  assert.deepEqual(uniqueActivity([first, second, first]).map(row => row.id), [id(2), id(1)]);
  let state = populated(1);
  state = arrive(state, 1);
  assert.equal(state.unreadCount, 1);
  state = arrive(state, 2);
  state = arrive(state, 2);
  assert.equal(state.items.length, 2);
  assert.equal(state.unreadCount, 2);
});

test("navigation uses real usernames/post previews, never actor UUIDs or unknown mention resource kinds", () => {
  for (const type of ["LIKE", "COMMENT", "SHARE"]) assert.deepEqual(activityDestination(item(1, { type })), { kind: "post", postId: raw(1).post.id });
  assert.deepEqual(activityDestination(item(1, { type: "FOLLOW" })), { kind: "profile", username: "mia" });
  assert.deepEqual(activityDestination(item(1, { type: "MESSAGE" })), { kind: "messages" });
  assert.equal(activityDestination(item(1, { type: "MENTION", resourceId: id(500) })), null);
  assert.equal(activityDestination(item(1, { type: "FOLLOW", actor: null })), null);
  assert.equal(activityDestination(item(1, { post: null })), null);
  assert.deepEqual(activityDestination(item(1, { type: "MENTION", postId: raw(1).postId, post: raw(1).post })), { kind: "post", postId: raw(1).postId });
});

test("deleted/dangling actor, post and comment references stay nullable without manufactured previews", () => {
  const value = item(1, { type: "COMMENT", actor: null, post: null, comment: null });
  assert.equal(value.actor, null); assert.equal(value.post, null); assert.equal(value.comment, null);
  assert.equal(value.id, id(1));
});

test("relative time uses server creation time with explicit current clock, not socket receipt time", () => {
  const created = "2026-10-31T12:00:00Z", start = Date.parse(created);
  assert.equal(activityTime(created, start - 5000), "Just now");
  assert.equal(activityTime(created, start + 120_000), "2m");
  assert.equal(activityTime(created, start + 7_200_000), "2h");
  assert.equal(activityTime(created, start + 172_800_000), "2d");
  assert.equal(typeof activityTime(created, start + 20 * 86_400_000), "string");
});

test("single reads and unread count update optimistically and independent failures roll back only their own delta", () => {
  let state = populated();
  state = start(state, "first", [id(1)]);
  state = start(state, "second", [id(2)]);
  assert.equal(state.unreadCount, 1);
  state = arrive(state, 4);
  state = finish(state, "second");
  state = finish(state, "first", "Offline");
  assert.equal(state.unreadCount, 3);
  assert.equal(state.items.find(row => row.id === id(1)).isRead, false);
  assert.equal(state.items.find(row => row.id === id(2)).isRead, true);
  assert.equal(state.items.find(row => row.id === id(4)).isRead, false);
  assert.equal(Object.keys(state.pendingReads).length, 0);
});

test("read-all covers unloaded unread history; rollback preserves new arrivals and their independent read", () => {
  let state = populated(20, 60);
  state = start(state, "all", [], true);
  assert.equal(state.unreadCount, 0);
  assert.equal(state.items.every(row => row.isRead), true);
  state = arrive(state, 100);
  state = arrive(state, 101);
  state = start(state, "new", [id(100)]);
  state = finish(state, "new");
  state = finish(state, "all", "Offline");
  assert.equal(state.unreadCount, 61);
  assert.equal(state.items.find(row => row.id === id(100)).isRead, true);
  assert.equal(state.items.find(row => row.id === id(101)).isRead, false);
  assert.equal(state.items.filter(row => !row.isRead).length, 21);
});

test("a pending optimistic read is not undone by a GET started during that write", () => {
  let state = populated();
  state = start(state, "read", [id(1)]);
  state = applyPage(state, [item(1), item(2), item(3)]);
  assert.equal(state.items.find(row => row.id === id(1)).isRead, true);
  assert.equal(state.unreadCount, 2);
});

test("a GET captured before a completed read cannot restore stale unread flags/count", () => {
  let state = populated(), version = state.version;
  state = start(state, "read", [id(1)]);
  state = finish(state, "read");
  state = applyPage(state, [item(1), item(2), item(3)], { version });
  assert.equal(state.items.find(row => row.id === id(1)).isRead, true);
  assert.equal(state.unreadCount, 2);
  state = reducer(state, activityUnreadReceived({ ...scope(state), version, count: 3 }));
  assert.equal(state.unreadCount, 2);
});

test("read socket redelivery never turns a confirmed read item unread", () => {
  let state = populated();
  state = start(state, "read", [id(1)]); state = finish(state, "read");
  state = arrive(state, 1);
  assert.equal(state.unreadCount, 2);
  assert.equal(state.items.find(row => row.id === id(1)).isRead, true);
});

test("refresh overlap retains a contiguous paginated tail, recalculating partial boundary without skips", () => {
  let state = populated(40, 140);
  state = applyPage(state, Array.from({ length: 40 }, (_, i) => item(140 - i)), { total: 140, limit: 40 });
  state = applyPage(state, Array.from({ length: 40 }, (_, i) => item(143 - i)), { total: 143, unreadCount: 143, limit: 40 });
  assert.equal(state.items.length, 43);
  assert.equal(state.page, 2, "page 3 will overlap three rows, rather than skip 17");
  state = applyPage(state, Array.from({ length: 20 }, (_, i) => item(103 - i)), { kind: "next", total: 143, page: 3 });
  assert.deepEqual(state.items.map(row => row.id), Array.from({ length: 60 }, (_, i) => id(143 - i)));
});

test("a missed burst larger than the refresh window resets the prefix instead of silently leaving a history gap", () => {
  let state = populated(40, 100);
  state = applyPage(state, Array.from({ length: 40 }, (_, i) => item(200 - i)), { total: 260, unreadCount: 260, limit: 40 });
  assert.equal(state.items.length, 40);
  assert.equal(state.items.some(row => row.id === id(1)), false);
  assert.equal(state.page, 2);
  assert.equal(state.hasMore, true);
});

test("socket creations during a stale refresh survive the replacement and count snapshot", () => {
  let state = populated(), version = state.version;
  state = arrive(state, 4);
  state = applyPage(state, [item(1), item(2), item(3)], { version });
  assert.equal(state.items.length, 4);
  assert.equal(state.unreadCount, 4);
});

test("credentials/logout clear Activity immediately, and even same-account ABA rejects old-session actions", () => {
  let state = populated(), oldScope = scope(state);
  state = reducer(state, logout());
  assert.equal(state.accountId, null); assert.equal(state.items.length, 0); assert.equal(state.unreadCount, 0);
  state = reducer(state, setCredentials({ user: { id: ACCOUNT_B }, token: "B" }));
  state = reducer(state, { ...receiveActivity({ ...oldScope, item: normalizeNotificationEvent(event(raw(4))) }) });
  assert.equal(state.items.length, 0);
  state = reducer(state, setCredentials({ user: { id: ACCOUNT_A }, token: "A-new" }));
  state = reducer(state, receiveActivity({ ...oldScope, item: normalizeNotificationEvent(event(raw(4))) }));
  assert.equal(state.accountId, ACCOUNT_A); assert.equal(state.items.length, 0); assert.notEqual(state.session, oldScope.session);
});

test("persist migration still drops unscoped private history without mutating auth, theme or migration metadata", () => {
  const original = { auth: { token: "secret" }, app: { theme: "light" }, notifications: { items: [raw(1)] }, _persist: { version: -1, rehydrated: true } };
  const migrated = withoutLegacyActivity(original);
  assert.deepEqual(Object.keys(migrated), ["auth", "app", "_persist"]);
  assert.equal(migrated.auth, original.auth); assert.equal(migrated.app, original.app);
  assert.equal(original.notifications.items.length, 1); assert.equal(withoutLegacyActivity(undefined), undefined);
});

test("unopened session keeps only 20 live preview rows, but dedupes all observed creation IDs", () => {
  let state = reducer(undefined, activityAccountChanged(ACCOUNT_A));
  for (let number = 1; number <= 130; number++) state = arrive(state, number);
  assert.equal(state.items.length, 20); assert.equal(state.unreadCount, 130);
  state = arrive(state, 1);
  assert.equal(state.items.length, 20); assert.equal(state.unreadCount, 130);
});

test("an old unseen envelope outside the loaded prefix cannot create a gap or advance its pagination", () => {
  let state = populated(20, 100);
  state = applyPage(state, Array.from({ length: 20 }, (_, i) => item(100 - i)), { total: 100 });
  for (let number = 21; number <= 40; number++) state = arrive(state, number);
  assert.equal(state.items.length, 20); assert.equal(state.unreadCount, 100); assert.equal(state.page, 1);
  state = applyPage(state, Array.from({ length: 20 }, (_, i) => item(100 - i)), { total: 100 });
  assert.equal(state.page, 1);
  state = applyPage(state, Array.from({ length: 20 }, (_, i) => item(80 - i)), { total: 100, kind: "next", page: 2 });
  assert.deepEqual(state.items.map(row => row.id), Array.from({ length: 40 }, (_, i) => id(100 - i)));
});

test("authoritative zero unread marks a retained deep tail read after another device's read-all", () => {
  let state = populated(140, 180);
  state = applyPage(state, Array.from({ length: 100 }, (_, i) => item(140 - i, { isRead: true })), { total: 180, unreadCount: 0, limit: 100 });
  assert.equal(state.items.length, 140);
  assert.equal(state.items.every(row => row.isRead), true);
  assert.equal(state.unreadCount, 0);
});

test("unexpected nonzero unread changes rebuild a deep prefix rather than retain stale older read flags", () => {
  let state = populated(140, 180);
  state = applyPage(state, Array.from({ length: 100 }, (_, i) => item(140 - i)), { total: 180, unreadCount: 179, limit: 100 });
  assert.equal(state.items.length, 100);
  assert.equal(state.page, 5);
  assert.equal(state.hasMore, true);
});
