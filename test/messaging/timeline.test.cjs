const { test } = require("node:test");
const assert = require("node:assert/strict");
const { row } = require("./harness.cjs");
const {
  mergeMessageRows,
  mergePersistedMessage,
  compareMessages,
} = require("../../src/utils/messaging/timeline.ts");
const {
  createListItemBuilder,
} = require("../../src/utils/messaging/listItems.ts");
const { LatestViewport } = require("../../src/utils/messaging/viewport.ts");

test("latest positioning waits for both actual measurements; no timeout chain", () => {
  for (const keyboardHeight of [0, 258, 420])
    for (const composerHeight of [59, 116, 180]) {
      const viewport = new LatestViewport();
      assert.equal(viewport.content(2300), false);
      const measuredHeight = 844 - 110 - 34 - keyboardHeight - composerHeight;
      assert.equal(viewport.layout(measuredHeight), true);
      assert.equal(
        viewport.layout(measuredHeight),
        false,
        "no repeated correction for same layout",
      );
      assert.equal(
        viewport.content(2500),
        true,
        "initial network/media size update remains sticky",
      );
      viewport.beginInteraction();
      viewport.userScroll(600);
      viewport.endInteraction(600);
      assert.equal(
        viewport.content(4000),
        false,
        "history is native anchored, not force scrolled",
      );
      assert.equal(
        viewport.layout(measuredHeight + 100),
        false,
        "keyboard closing preserves reading intent",
      );
      assert.equal(
        viewport.requestLatest(),
        true,
        "explicit user jump re-enables sticky layout",
      );
    }
});
test("inverted list keys remain stable after older pages, date headers, and confirmation", () => {
  const build = createListItemBuilder();
  const current = Array.from({ length: 30 }, (_, i) => row(100 + i));
  const before = build(current, "me", current[2].localId);
  assert.equal(before[0].message.localId, current.at(-1).localId);
  const older = Array.from({ length: 30 }, (_, i) => row(70 + i));
  const after = build(
    mergeMessageRows(current, older),
    "me",
    current[2].localId,
  );
  for (const item of before.filter((item) => item.kind === "message"))
    assert.equal(
      after.find((entry) => entry.id === item.id),
      item,
    );
  assert.equal(new Set(after.map((item) => item.id)).size, after.length);
  assert.equal(after.filter((item) => item.kind === "unread").length, 1);
});
test("metadata updates reuse all other rows and reply models; duplicates are no-ops", () => {
  const build = createListItemBuilder();
  const current = Array.from({ length: 5000 }, (_, i) =>
    row(i, { repliedToId: i % 10 === 0 ? row(1).id : null }),
  );
  const before = build(current, "me", null);
  assert.equal(mergeMessageRows(current, [current[10]]), current);
  const next = mergeMessageRows(current, [
    { ...current[20], status: "READ", isRead: true },
  ]);
  const after = build(next, "me", null);
  assert.equal(
    after.filter((item) => item !== before.find((old) => old.id === item.id))
      .length,
    1,
  );
  assert.equal(next.filter((item, i) => item !== current[i]).length, 1);
});
test("stale sync cannot downgrade read state, edits or local deletion", () => {
  const existing = row(1, {
    status: "READ",
    isRead: true,
    content: "new edit",
    editedAt: "2026-10-29T10:00:00.000Z",
    updatedAt: "2026-10-29T10:00:00.000Z",
    deletedAt: "2026-10-29T11:00:00.000Z",
  });
  const next = mergePersistedMessage(
    existing,
    row(1),
    Date.parse("2026-10-29T09:00:00.000Z"),
  );
  assert.equal(next.status, "READ");
  assert.equal(next.content, null, "deleted payloads are scrubbed even on a stale sync");
  assert.equal(next.deletedAt, existing.deletedAt);
  assert.deepEqual(mergeMessageRows([existing], [{ ...existing }]), []);
});
test("ordering ties are deterministic, pagination additions do not reorder existing rows", () => {
  const rows = [
    row(3, { timestamp: 10 }),
    row(1, { timestamp: 10 }),
    row(2, { timestamp: 10 }),
  ].sort(compareMessages);
  assert.deepEqual(
    rows.map((item) => item.id),
    [row(1).id, row(2).id, row(3).id],
  );
  const next = mergeMessageRows(rows, [row(0, { timestamp: 10 })]);
  assert.deepEqual(
    next.map((item) => item.id),
    [row(0).id, ...rows.map((item) => item.id)],
  );
});
test("reply dependencies update only the edited source and its previews, not receipt-only dependents", () => {
  const build = createListItemBuilder();
  const rows = [row(1), row(2, { repliedToId: row(1).id }), row(3)];
  const before = build(rows, "me", null);
  const editedRows = [
    { ...rows[0], content: "updated original" },
    ...rows.slice(1),
  ];
  const edited = build(editedRows, "me", null);
  assert.equal(
    edited.filter(
      (item) => item !== before.find((previous) => previous.id === item.id),
    ).length,
    2,
  );
  assert.equal(
    edited.find(
      (item) => item.kind === "message" && item.message.id === row(2).id,
    ).repliedTo.content,
    "updated original",
  );
  const receipt = build(
    [{ ...editedRows[0], status: "READ" }, ...editedRows.slice(1)],
    "me",
    null,
  );
  assert.equal(
    receipt.find(
      (item) => item.kind === "message" && item.message.id === row(2).id,
    ),
    edited.find(
      (item) => item.kind === "message" && item.message.id === row(2).id,
    ),
  );
});
test("duplicate rows within a page keep the strongest metadata and canonical optimistic key", () => {
  const merged = mergeMessageRows(
    [],
    [row(1), row(1, { status: "READ", isRead: true })],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "READ");
  const optimistic = row(2, {
    localId: "original",
    id: "original",
    status: "SENDING",
  });
  const echo = row(3, { localId: "server", id: "server" });
  const confirmed = { ...optimistic, id: "server", status: "DELIVERED" };
  const reconciled = mergeMessageRows([optimistic, echo], [confirmed]);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].localId, "original");
});
