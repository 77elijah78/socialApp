const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
require("../messaging/harness.cjs");
const configure = require("../../app.config.ts").default;
const profile = process.env.EAS_BUILD_PROFILE,
  origin = process.env.EXPO_PUBLIC_API_URL;
afterEach(() => {
  if (profile === undefined) delete process.env.EAS_BUILD_PROFILE;
  else process.env.EAS_BUILD_PROFILE = profile;
  process.env.EXPO_PUBLIC_API_URL = origin;
});
const base = {
  name: "social",
  slug: "social",
  plugins: [["expo-build-properties", { android: { enableMultiDex: true } }]],
};

test("production configuration rejects missing, private and cleartext API origins before EAS builds", () => {
  process.env.EAS_BUILD_PROFILE = "production";
  for (const value of [
    "",
    "http://api.example.invalid",
    "https://localhost:3000",
    "https://192.168.1.3:3000",
    "https://[::1]",
  ]) {
    process.env.EXPO_PUBLIC_API_URL = value;
    assert.throws(() => configure({ config: base }), /public HTTPS/);
  }
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.invalid/api/v1";
  const result = configure({ config: base });
  assert.equal(result.plugins[0][1].android.usesCleartextTraffic, false);
  assert.equal(result.plugins[0][1].android.enableMultiDex, true);
});

test("development can explicitly opt into a LAN API without a built-in address", () => {
  process.env.EAS_BUILD_PROFILE = "development";
  process.env.EXPO_PUBLIC_API_URL = "http://192.168.0.2:3000";
  assert.equal(
    configure({ config: base }).plugins[0][1].android.usesCleartextTraffic,
    true,
  );
});

test("missing config is an actionable request error, not an import/startup crash or silent LAN socket", () => {
  const script = `process.env.EXPO_PUBLIC_API_URL=''; require('./test/messaging/harness.cjs'); const c=require('./src/config/api.ts'); if(c.API_ORIGIN!=='')process.exit(1); try{c.apiUrl('/test');process.exit(2)}catch(e){if(!e.message.includes('not configured'))process.exit(3)} const {socketReceiver}=require('./src/services/SocketReceiver.ts');socketReceiver.connect('user','token');if(socketReceiver.socket!==null)process.exit(4);`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});
