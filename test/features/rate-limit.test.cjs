const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
require("../messaging/harness.cjs");
const {
  scopeForPath,
  retryAfterMsFromHeaders,
  friendlyRateLimitMessage,
  formatCooldown,
  rateLimitStore,
} = require("../../src/services/RateLimitService.ts");

beforeEach(() => rateLimitStore.clear());

const headers = (values) => (name) => values[name.toLowerCase()] ?? values[name] ?? null;

test("request paths map to the server's actual limiter scopes", () => {
  assert.equal(scopeForPath("/auth/login"), "auth");
  assert.equal(scopeForPath("/media/upload?x=1"), "media");
  assert.equal(scopeForPath("/messages/conversations/room/messages"), "messaging");
  assert.equal(scopeForPath("/users/search?q=a"), "social");
  assert.equal(scopeForPath("/channels/c1/posts"), "social");
  assert.equal(scopeForPath("/stickers/packs"), "social");
  assert.equal(scopeForPath("/unknown"), "global");
});

test("Retry-After seconds, HTTP dates and RateLimit-Reset all produce bounded cooldowns", () => {
  assert.equal(retryAfterMsFromHeaders(headers({ "retry-after": "12" })), 12_000);
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  assert.equal(
    retryAfterMsFromHeaders(headers({ "retry-after": new Date(now + 8_000).toUTCString() }), now),
    8_000,
  );
  assert.equal(retryAfterMsFromHeaders(headers({ "ratelimit-reset": "30" })), 30_000);
  assert.equal(retryAfterMsFromHeaders(headers({ "retry-after": "0" })), 1_000);
  assert.equal(retryAfterMsFromHeaders(headers({ "retry-after": "999999" })), 900_000);
  assert.equal(retryAfterMsFromHeaders(headers({})), 60_000);
});

test("friendly countdown copy never exposes a raw HTTP error", () => {
  assert.equal(friendlyRateLimitMessage(4_000), "Too many requests. Try again in 4s.");
  assert.equal(friendlyRateLimitMessage(61_000), "Too many requests. Try again in about 2 min.");
  assert.equal(formatCooldown(65_000), "1:05");
  assert.equal(formatCooldown(0), "0s");
});

test("a global cooldown blocks every scope while an endpoint cooldown stays scoped", () => {
  rateLimitStore.apply("media", 5_000);
  assert.ok(rateLimitStore.blockedFor("media") > 0);
  assert.equal(rateLimitStore.isBlocked("messaging"), false);
  assert.equal(rateLimitStore.get("global"), null);
  assert.equal(rateLimitStore.current().scope, "media");
  rateLimitStore.apply("global", 2_000);
  assert.ok(rateLimitStore.blockedFor("messaging") > 0);
  assert.ok(rateLimitStore.blockedFor("global") > 0);
  assert.match(rateLimitStore.current().message, /Too many|wait|try again/i);
});

test("api never retries a 429, stores the cooldown and fails fast on the next attempt", async () => {
  const { api, setTokens, RateLimitError } = require("../../src/services/api.ts");
  setTokens("token", null);
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "3" }),
      json: async () => ({ message: "Too many requests" }),
    };
  };

  await assert.rejects(api.get("/messages/conversations", "token"), (error) => {
    assert.ok(error instanceof RateLimitError);
    assert.equal(error.status, 429);
    assert.equal(error.scope, "messaging");
    assert.ok(error.retryAfterMs >= 2_000 && error.retryAfterMs <= 3_000);
    assert.match(error.message, /Try again in/);
    return true;
  });
  assert.equal(calls, 1, "429 is not retried automatically");
  assert.ok(rateLimitStore.blockedFor("messaging") > 0);
  assert.equal(rateLimitStore.current().scope, "messaging");

  await assert.rejects(api.get("/messages/conversations", "token"), (error) => {
    assert.ok(error instanceof RateLimitError);
    return true;
  });
  assert.equal(calls, 1, "a request inside the cooldown never reaches the network");
  rateLimitStore.clear();
});
