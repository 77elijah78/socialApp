const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../messaging/harness.cjs");
const {
  normalizeLiveActivity,
  activityTarget,
  withoutLegacyActivity,
  ACTIVITY_CAPABILITIES,
} = require("../../src/services/NotificationService.ts");
const {
  default: reducer,
  activityAccountChanged,
  receiveActivity,
} = require("../../src/store/slices/notificationsSlice.ts");
const {
  setCredentials,
  logout,
} = require("../../src/store/slices/authSlice.ts");
const raw = {
  type: "SHARE",
  content: "shared your post",
  actorId: "actor-uuid",
  resourceId: "post-uuid",
};
const receive = (accountId, payload = raw, receivedAt = 12345) =>
  receiveActivity({ accountId, payload, receivedAt });

test("actual sparse live payload has explicit client metadata, no fabricated ID/time/actor/read fields", () => {
  const item = normalizeLiveActivity(raw, 12345);
  assert.equal(item.content, "shared your post");
  assert.equal(item.receivedAt, 12345);
  assert.equal(item.actorId, "actor-uuid");
  for (const key of ["id", "createdAt", "isRead", "user", "actor"])
    assert.equal(key in item, false, key);
  assert.deepEqual(ACTIVITY_CAPABILITIES, {
    history: false,
    pagination: false,
    serverReadState: false,
    actorProfiles: false,
  });
});

test("invalid and unsupported events are rejected rather than rendered as invented activity", () => {
  for (const payload of [
    null,
    {},
    { type: "SYSTEM", content: "mock" },
    { type: "SHARE", content: "" },
    { type: "SHARE", content: 42 },
  ])
    assert.equal(normalizeLiveActivity(payload, 1), null);
});

test("matching deliveries coalesce honestly without pretending to dedupe durable events", () => {
  let state = reducer(undefined, activityAccountChanged("alice"));
  state = reducer(state, receive("alice"));
  state = reducer(state, receive("alice", raw, 23456));
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].occurrences, 2);
  assert.equal(state.items[0].receivedAt, 23456);
});

test("credential change/logout clear activity immediately and late old-account events are ignored", () => {
  let state = reducer(undefined, activityAccountChanged("alice"));
  state = reducer(state, receive("alice"));
  state = reducer(
    state,
    setCredentials({ user: { id: "bob" }, token: "bob-token" }),
  );
  assert.equal(state.accountId, "bob");
  assert.equal(state.items.length, 0);
  state = reducer(state, receive("alice"));
  assert.equal(state.items.length, 0);
  state = reducer(state, receive("bob"));
  assert.equal(state.items.length, 1);
  state = reducer(state, logout());
  assert.deepEqual(state, { accountId: null, items: [] });
});

test("live session stays bounded at 100 groups and targets only verified resource routes", () => {
  let state = reducer(undefined, activityAccountChanged("alice"));
  for (let i = 0; i < 130; i++)
    state = reducer(state, receive("alice", { ...raw, resourceId: String(i) }));
  assert.equal(state.items.length, 100);
  assert.equal(
    activityTarget(normalizeLiveActivity(raw, 1)),
    "/posts/post-uuid/comments",
  );
  assert.equal(
    activityTarget(normalizeLiveActivity({ ...raw, type: "FOLLOW" }, 1)),
    null,
    "actor UUID is not a username",
  );
  assert.equal(
    activityTarget(normalizeLiveActivity({ ...raw, type: "MENTION" }, 1)),
    null,
    "unverified target type is not guessed",
  );
  assert.equal(
    activityTarget(normalizeLiveActivity({ ...raw, type: "MESSAGE" }, 1)),
    "/(tabs)/messages",
  );
});

test("persist migration discards legacy unscoped activity while preserving auth, app and migration metadata", () => {
  const state = {
    auth: { token: "secret" },
    app: { theme: "light" },
    notifications: { items: [{ userId: "old-account" }] },
    _persist: { version: -1, rehydrated: true },
  };
  const migrated = withoutLegacyActivity(state);
  assert.deepEqual(Object.keys(migrated), ["auth", "app", "_persist"]);
  assert.equal(migrated.auth, state.auth);
  assert.equal(
    state.notifications.items.length,
    1,
    "does not mutate persisted input",
  );
  assert.equal(withoutLegacyActivity(undefined), undefined);
});
