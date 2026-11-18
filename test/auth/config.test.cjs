const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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

test("branding: the circle name, icon set and splash screen are wired to real assets", () => {
  const app = require("../../app.json").expo;
  const pngSize = (file) => {
    const header = fs.readFileSync(file).subarray(0, 24);
    return [header.readUInt32BE(16), header.readUInt32BE(20)];
  };
  assert.equal(app.name, "circle");
  assert.equal(configure({ config: app }).name, "circle");
  assert.deepEqual(pngSize(app.icon), [1024, 1024]);
  assert.deepEqual(pngSize(app.android.adaptiveIcon.foregroundImage), [1024, 1024]);
  assert.deepEqual(pngSize(app.android.adaptiveIcon.monochromeImage), [1024, 1024]);
  assert.equal(app.android.adaptiveIcon.backgroundColor, "#14112E");
  assert.deepEqual(pngSize(app.web.favicon), [128, 128]);
  const splash = app.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  );
  assert.equal(splash[1].backgroundColor, "#14112E");
  assert.equal(splash[1].imageWidth, 220);
  assert.deepEqual(pngSize(splash[1].image), [1200, 1200]);
});
