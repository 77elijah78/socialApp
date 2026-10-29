const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { deferred, settle, storage } = require("./harness.cjs");
const {
  api,
  setTokens,
  getAccessToken,
  setTokenRefreshCallback,
} = require("../../src/services/api.ts");
const response = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  json: async () => body,
});
beforeEach(() => {
  setTokens("old-access", "old-refresh");
  setTokenRefreshCallback(null);
  storage.clear();
});
test("late refresh cannot authenticate after logout or resurrect a stored token", async () => {
  const refresh = deferred();
  let calls = 0,
    callbacks = 0;
  storage.set("refreshToken", "old-refresh");
  setTokenRefreshCallback(() => callbacks++);
  global.fetch = async (url) => {
    calls++;
    return url.endsWith("/auth/refresh") ? refresh.promise : response(401);
  };
  const request = api.post("/test", {});
  const rejection = assert.rejects(request, /Authentication/);
  await settle();
  setTokens(null, null);
  refresh.resolve(
    response(200, {
      data: { accessToken: "late-access", refreshToken: "late-refresh" },
    }),
  );
  await rejection;
  assert.equal(getAccessToken(), null);
  assert.equal(callbacks, 0);
  await assert.rejects(api.post("/test", {}, "old-access"));
  assert.equal(calls, 3);
  assert.equal(getAccessToken(), null);
});
test("an old 401 does not refresh with the next account credentials", async () => {
  const pending = deferred();
  let refreshes = 0;
  global.fetch = async (url) => {
    if (url.endsWith("/auth/refresh")) refreshes++;
    return pending.promise;
  };
  const request = api.post("/test", {});
  const rejection = assert.rejects(request, /Authentication/);
  setTokens("account-b", "account-b-refresh");
  pending.resolve(response(401));
  await rejection;
  assert.equal(refreshes, 0);
  assert.equal(getAccessToken(), "account-b");
});
test("concurrent 401s share one refresh and both retry with the fresh token", async () => {
  const pending = deferred();
  let refreshes = 0,
    callbacks = 0;
  setTokenRefreshCallback((token, refresh) => {
    callbacks++;
    setTokens(token, refresh);
  });
  global.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/refresh")) {
      refreshes++;
      return pending.promise;
    }
    return options.headers.Authorization === "Bearer fresh-access"
      ? response(200, { success: true })
      : response(401);
  };
  const requests = Promise.all([api.post("/one", {}), api.post("/two", {})]);
  await settle();
  pending.resolve(
    response(200, {
      data: { accessToken: "fresh-access", refreshToken: "fresh-refresh" },
    }),
  );
  assert.deepEqual(await requests, [{ success: true }, { success: true }]);
  assert.equal(refreshes, 1);
  assert.equal(callbacks, 1);
});
test("GET flights are coalesced but not reused across an account switch", async () => {
  const pending = deferred();
  let calls = 0;
  global.fetch = () => {
    calls++;
    return pending.promise;
  };
  const first = api.get("/same");
  const duplicate = api.get("/same");
  setTokens("account-b", "refresh-b");
  const nextAccount = api.get("/same");
  pending.resolve(response(200, { value: 1 }));
  await Promise.all([first, duplicate, nextAccount]);
  assert.equal(calls, 2);
});
