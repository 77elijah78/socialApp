const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { mock, root, storage } = require("../messaging/harness.cjs");

const calls = [];
const tokens = [];
const prepared = [];
const actions = [];
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RateLimitError";
    this.status = 429;
  }
}
mock("@/services/api", {
  setTokens: (...args) => tokens.push(args),
  applyRateLimitResponse: () => new RateLimitError("Too many requests. Try again in 5s."),
});
mock(path.join(root, "src/services/MessagingCache"), {
  prepareMessagingAccount: async (id) => prepared.push(id),
});
mock(path.join(root, "src/services/MediaService"), {
  mediaService: {
    message: { resetSession() {} },
    disconnectSocket() {},
  },
});
mock(path.join(root, "src/services/notifications/PushLogout"), {
  revokePushBeforeLogout: async () => {},
});
mock("@/store/slices/authSlice", {
  setCredentials: (payload) => ({ type: "auth/setCredentials", payload }),
});

const { authService } = require("../../src/services/AuthService.ts");

const okUser = {
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  displayName: "Alice",
  bio: null,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
};
const success = {
  success: true,
  message: "Login successful",
  data: { user: okUser, accessToken: "app-access", refreshToken: "app-refresh" },
};
let response = () => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => success,
});

beforeEach(() => {
  calls.length = 0;
  tokens.length = 0;
  prepared.length = 0;
  actions.length = 0;
  storage.clear();
  response = () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => success,
  });
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return response();
  };
});

test("Google sign-in exchanges only the ID token for the existing app JWT session", async () => {
  const dispatch = (action) => actions.push(action);
  await authService.loginWithGoogle("google-id-token", dispatch);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/auth\/google$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { idToken: "google-id-token" });
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(tokens, [["app-access", "app-refresh"]]);
  assert.equal(storage.get("refreshToken"), "app-refresh");
  assert.deepEqual(prepared, ["u1"]);
  assert.equal(actions[0].type, "auth/setCredentials");
  assert.equal(actions[0].payload.user.email, "alice@example.com");
  assert.equal(actions[0].payload.token, "app-access");
});

test("a backend Google rejection is shown as-is and never persists a partial session", async () => {
  response = () => ({
    ok: false,
    status: 401,
    headers: new Headers(),
    json: async () => ({ success: false, message: "Google account could not be verified" }),
  });
  await assert.rejects(
    authService.loginWithGoogle("bad-token", (action) => actions.push(action)),
    /Google account could not be verified/,
  );
  assert.deepEqual(tokens, []);
  assert.deepEqual(prepared, []);
  assert.deepEqual(actions, []);
  assert.equal(storage.get("refreshToken"), undefined);
});

test("Google HTTP 429 goes through the shared cooldown instead of a generic failure", async () => {
  response = () => ({
    ok: false,
    status: 429,
    headers: new Headers({ "Retry-After": "5" }),
    json: async () => ({ message: "Too many requests" }),
  });
  await assert.rejects(
    authService.loginWithGoogle("token", () => {}),
    (error) => error instanceof RateLimitError && /Try again/.test(error.message),
  );
  assert.deepEqual(tokens, []);
});

test("email/password keeps its original contract alongside Google", async () => {
  await authService.login("alice@example.com", "pass", (action) => actions.push(action));
  assert.match(calls[0].url, /\/auth\/login$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "alice@example.com", password: "pass" });

  await authService.register("b@example.com", "pass", "bob", "Bob", (action) => actions.push(action));
  assert.match(calls[1].url, /\/auth\/register$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    email: "b@example.com",
    password: "pass",
    username: "bob",
    displayName: "Bob",
  });
  assert.equal(tokens.length, 2);
});

test("an undeployed Google endpoint is reported as a server capability gap", async () => {
  response = () => ({
    ok: false,
    status: 404,
    headers: new Headers(),
    json: async () => ({ success: false, message: "Route not found" }),
  });
  await assert.rejects(
    authService.loginWithGoogle("token", () => {}),
    /isn’t supported by this server yet/,
  );
  assert.deepEqual(tokens, []);
});
