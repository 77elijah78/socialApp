/* eslint-disable react-hooks/globals -- Test probes intentionally expose mounted hook results to assertions. */
// Comment-like contract tests: optimistic apply, server reconciliation, rollback,
// single-flight de-duplication and account-scope guards. In-memory API double.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, deferred, storage } = require("../messaging/harness.cjs");

let auth = { user: { id: "me", username: "me" }, token: "token" };
const calls = [];
let getHandler;
let postHandler;
let deleteHandler;
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
    delete: (path, token) => {
      calls.push({ method: "DELETE", path, token });
      return deleteHandler(path);
    },
  },
});
const {
  usePostComments,
  normalizeComment,
} = require("../../src/hooks/usePostComments.ts");

const rawComment = (id, patch = {}) => ({
  id,
  content: `Comment ${id}`,
  createdAt: "2026-11-16T12:00:00Z",
  author: { id: "writer", username: "writer", displayName: "Writer" },
  likesCount: 2,
  isLikedByCurrentUser: false,
  repliesCount: 0,
  ...patch,
});
const detail = (comments) => ({
  success: true,
  data: { comments, _count: { comments: comments.length } },
});
const engagement = (id, likesCount, isLikedByCurrentUser) => ({
  success: true,
  data: { commentId: id, likesCount, isLikedByCurrentUser },
});

let hook;
function Probe(props) {
  hook = usePostComments(props.postId, props.openSequence ?? 0);
  return null;
}
let renderer;
const mount = async (props = { postId: "p1" }) => {
  await act(async () => {
    renderer = create(React.createElement(Probe, props));
  });
};
beforeEach(() => {
  calls.length = 0;
  storage.clear();
  auth = { user: { id: "me", username: "me" }, token: "token" };
  getHandler = async () =>
    detail([
      rawComment("c1"),
      rawComment("c2", { likesCount: 7, isLikedByCurrentUser: true }),
    ]);
  postHandler = async () => engagement("c1", 5, true);
  deleteHandler = async () => engagement("c2", 6, false);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

test("normalizeComment prefers canonical engagement fields, never invents them", () => {
  const normalized = normalizeComment(
    rawComment("c1", { likesCount: 4, isLikedByCurrentUser: true, repliesCount: 3 }),
    "p1",
  );
  assert.equal(normalized.likesCount, 4);
  assert.equal(normalized.isLikedByCurrentUser, true);
  assert.equal(normalized.repliesCount, 3);
  const legacy = normalizeComment(
    { ...rawComment("legacy"), likesCount: undefined, isLikedByCurrentUser: undefined, _count: { likes: 9 } },
    "p1",
  );
  assert.equal(legacy.likesCount, 9);
});

test("a like applies optimistically, reconciles the server count and prevents duplicate calls", async () => {
  await mount();
  const pending = deferred();
  postHandler = () => pending.promise;
  let work;
  await act(async () => {
    work = hook.toggleLike("c1");
  });
  assert.equal(hook.comments[0].isLikedByCurrentUser, true);
  assert.equal(hook.comments[0].likesCount, 3);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(hook.toggleLike("c1"), work, "same in-flight promise");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  await act(async () => {
    pending.resolve(engagement("c1", 5, true));
    await work;
  });
  assert.equal(
    calls.find((call) => call.method === "POST").path,
    "/posts/p1/comments/c1/like",
  );
  assert.equal(hook.comments[0].likesCount, 5, "server count wins");
  assert.equal(hook.comments[0].isLikedByCurrentUser, true);
});

test("a failed like rolls back only that comment and can be retried", async () => {
  await mount();
  postHandler = async () => {
    throw new Error("Network unavailable");
  };
  await act(async () => {
    await assert.rejects(hook.toggleLike("c1"), /Network unavailable/);
  });
  assert.equal(hook.comments[0].isLikedByCurrentUser, false);
  assert.equal(hook.comments[0].likesCount, 2);
  assert.equal(hook.comments[1].likesCount, 7, "other comments untouched");
  postHandler = async () => engagement("c1", 3, true);
  await act(async () => {
    await hook.toggleLike("c1");
  });
  assert.equal(hook.comments[0].likesCount, 3);
  assert.equal(hook.comments[0].isLikedByCurrentUser, true);
});

test("unliking uses DELETE and confirms the server's remaining count", async () => {
  await mount();
  await act(async () => {
    await hook.toggleLike("c2");
  });
  assert.equal(calls.at(-1).method, "DELETE");
  assert.equal(calls.at(-1).path, "/posts/p1/comments/c2/like");
  assert.equal(hook.comments[1].isLikedByCurrentUser, false);
  assert.equal(hook.comments[1].likesCount, 6);
});

test("a late like response cannot mutate the next account's comment list", async () => {
  await mount();
  const pending = deferred();
  postHandler = () => pending.promise;
  let work;
  await act(async () => {
    work = hook.toggleLike("c1");
  });
  auth = { user: { id: "account-b", username: "b" }, token: "token-b" };
  getHandler = async () => detail([rawComment("b-comment")]);
  await act(async () => {
    renderer.update(
      React.createElement(Probe, { postId: "p1", openSequence: 1 }),
    );
  });
  assert.deepEqual(
    hook.comments.map((comment) => comment.id),
    ["b-comment"],
  );
  await act(async () => {
    pending.resolve(engagement("c1", 99, true));
    await work;
  });
  assert.equal(hook.comments.length, 1);
  assert.equal(hook.comments[0].id, "b-comment");
  assert.equal(hook.comments[0].likesCount, 2);
});
