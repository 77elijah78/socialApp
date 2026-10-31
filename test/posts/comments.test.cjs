/* eslint-disable react-hooks/globals -- Test probes intentionally expose mounted hook results to assertions. */
// Confirmed-state and contract tests with an in-memory API double, not a live DB.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, deferred } = require("../messaging/harness.cjs");
let auth, server, calls, postHandler, getHandler;
mock("@/store/hooks", { useAppSelector: (select) => select({ auth }) });
mock("@/services/api", {
  api: {
    get: (path, token, options) => {
      calls.push({ method: "GET", path, token, options });
      return getHandler(path);
    },
    post: (path, body, token) => {
      calls.push({ method: "POST", path, body, token });
      return postHandler(path, body);
    },
  },
});
const {
  usePostComments,
  normalizeComment,
} = require("../../src/hooks/usePostComments.ts");
const { subscribePostUpdates } = require("../../src/utils/postUpdates.ts");
const own = (id = "saved") => ({
  id,
  content: "Real comment",
  author: { id: "me", username: "alice" },
  createdAt: "2026-10-31T10:00:00Z",
  repliedToId: null,
});
let renderer, hook;
function Probe({ postId = "post-1", openSequence = 0 }) {
  hook = usePostComments(postId, openSequence);
  return null;
}
const mount = async (props) => {
  await act(async () => {
    renderer = create(React.createElement(Probe, props));
  });
};
beforeEach(() => {
  auth = { token: "token", user: { id: "me", username: "alice" } };
  server = [];
  calls = [];
  getHandler = async () => ({
    success: true,
    data: { comments: [...server], _count: { comments: server.length } },
  });
  postHandler = async (_path, body) => {
    const saved = { ...own(`saved-${server.length}`), ...body };
    server.push(saved);
    return { success: true, data: saved };
  };
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("real nested author normalizes ownership and correct post without fabricated author/post response fields", () => {
  const saved = normalizeComment(own(), "post-1");
  assert.equal(saved.authorId, "me");
  assert.equal(saved.postId, "post-1");
  assert.throws(
    () => normalizeComment({ ...own(), postId: "another-post" }, "post-1"),
    /Invalid/,
  );
  assert.throws(
    () => normalizeComment({ id: "x", content: "x" }, "post-1"),
    /Invalid/,
  );
});

test("server total is retained when the first comment page contains only 20 of 35 comments", async () => {
  getHandler = async () => ({
    success: true,
    data: {
      comments: Array.from({ length: 20 }, (_, i) => own(String(i))),
      _count: { comments: 35 },
    },
  });
  await mount();
  assert.equal(hook.comments.length, 20);
  assert.equal(hook.total, 35);
});

test("comment is absent until confirmed, posts exact reply contract, increments count once and reopens from server", async () => {
  server = [own("parent")];
  await mount();
  const pending = deferred();
  postHandler = () => pending.promise;
  let sending;
  await act(async () => {
    sending = hook.send("  Actual reply  ", "parent");
  });
  assert.equal(hook.comments.length, 1);
  assert.equal(hook.total, 1);
  assert.deepEqual(calls.find((call) => call.method === "POST").body, {
    content: "Actual reply",
    repliedToId: "parent",
  });
  const saved = {
    ...own("new"),
    content: "Actual reply",
    repliedToId: "parent",
  };
  server.push(saved);
  await act(async () => pending.resolve({ success: true, data: saved }));
  await sending;
  assert.equal(hook.comments[1].id, "new");
  assert.equal(hook.comments[1].authorId, "me");
  assert.equal(hook.total, 2);
  await act(async () => renderer.unmount());
  renderer = null;
  await mount();
  assert.equal(hook.comments[1].id, "new");
  assert.equal(calls.filter((call) => call.method === "GET").length, 2);
});

test("failed POST never appears as saved and never publishes a count update; retry can succeed", async () => {
  await mount();
  const updates = [];
  const unsubscribe = subscribePostUpdates((value) => updates.push(value));
  try {
    postHandler = async () => {
      throw new Error("Offline");
    };
    await act(async () =>
      assert.rejects(hook.send("Comment", null), /Offline/),
    );
    assert.deepEqual(hook.comments, []);
    assert.equal(hook.total, 0);
    assert.equal(updates.length, 0);
    postHandler = async () => ({ success: true, data: own() });
    await act(async () => hook.send("Comment", null));
    assert.equal(hook.comments.length, 1);
    assert.equal(hook.total, 1);
    assert.equal(updates.length, 1);
  } finally {
    unsubscribe();
  }
});

test("rapid duplicate submit has one POST, and a duplicate confirmed ID never double-counts", async () => {
  await mount();
  const pending = deferred();
  postHandler = () => pending.promise;
  let first;
  await act(async () => {
    first = hook.send("Comment", null);
    await assert.rejects(hook.send("Comment", null), /already being sent/);
  });
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  await act(async () => pending.resolve({ success: true, data: own() }));
  await first;
  postHandler = async () => ({ success: true, data: own() });
  await act(async () => hook.send("Comment", null));
  assert.equal(hook.total, 1);
  assert.equal(hook.comments.length, 1);
});

test("late fetch/send cannot contaminate a different post/account or resurrect an old sheet session", async () => {
  await mount();
  const pending = deferred();
  postHandler = () => pending.promise;
  let sending;
  await act(async () => {
    sending = hook.send("Old", null);
  });
  auth = { token: "next-token", user: { id: "next-account" } };
  await act(async () =>
    renderer.update(
      React.createElement(Probe, { postId: "post-2", openSequence: 1 }),
    ),
  );
  await act(async () => pending.resolve({ success: true, data: own("late") }));
  await sending;
  assert.deepEqual(hook.comments, []);
  assert.equal(hook.total, 0);
});

test("GET failure is a retryable error, not an empty-success state; old in-flight GET cannot undo a send", async () => {
  getHandler = async () => {
    throw new Error("API unavailable");
  };
  await mount();
  assert.equal(hook.error, "API unavailable");
  getHandler = async () => ({
    success: true,
    data: { comments: [], _count: { comments: 0 } },
  });
  await act(async () => hook.refresh());
  assert.equal(hook.error, null);
  const pending = deferred();
  getHandler = () => pending.promise;
  let refreshing;
  await act(async () => {
    refreshing = hook.refresh();
  });
  await act(async () => hook.send("New", null));
  await act(async () =>
    pending.resolve({
      success: true,
      data: { comments: [], _count: { comments: 0 } },
    }),
  );
  await refreshing;
  assert.equal(hook.comments.length, 1);
  assert.equal(hook.total, 1);
});

test("same-account token refresh during POST neither resets the comment session nor discards the confirmation", async () => {
  await mount();
  const pending = deferred();
  postHandler = () => pending.promise;
  let sending;
  await act(async () => {
    sending = hook.send("Actual persisted comment", null);
  });
  auth = { ...auth, token: "fresh-token" };
  await act(async () => renderer.update(React.createElement(Probe)));
  assert.equal(calls.filter((call) => call.method === "GET").length, 1);
  await act(async () =>
    pending.resolve({ success: true, data: own("confirmed-after-refresh") }),
  );
  await sending;
  assert.equal(hook.comments[0].id, "confirmed-after-refresh");
  assert.equal(hook.total, 1);
});
