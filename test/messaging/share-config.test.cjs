const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { root } = require("./harness.cjs");
const app = require("../../app.json").expo;

const plugin = (name) =>
  app.plugins.find((value) => (Array.isArray(value) ? value[0] : value) === name);

test("Android share sheet receives single and multiple media/file intents", () => {
  const share = plugin("expo-share-intent");
  assert.ok(share, "expo-share-intent config plugin is required");
  assert.equal(share[1].disableIOS, true);
  for (const mime of ["image/*", "video/*", "audio/*", "application/*"]) {
    assert.ok(share[1].androidIntentFilters.includes(mime), `single ${mime}`);
    assert.ok(share[1].androidMultiIntentFilters.includes(mime), `multiple ${mime}`);
  }
  const dependencies = require("../../package.json").dependencies;
  assert.match(dependencies["expo-network"], /^~/);
  assert.equal(
    plugin("./plugins/withNetworkConditions.cjs"),
    "./plugins/withNetworkConditions.cjs",
  );
});

test("persistent audio opts into Android media playback and background audio", () => {
  const audio = plugin("expo-audio");
  assert.ok(audio);
  assert.equal(audio[1].enableBackgroundPlayback, true);
  assert.ok(app.android.permissions.includes("android.permission.ACCESS_NETWORK_STATE"));
});

test("the roaming-capable network module is compiled into the native app", () => {
  const pluginSource = fs.readFileSync(
    path.join(root, "plugins/withNetworkConditions.cjs"),
    "utf8",
  );
  assert.match(pluginSource, /withMainApplication/);
  assert.match(pluginSource, /NetworkConditionsPackage/);
  // Expo SDK 56 names Kotlin "kt"; accepting only "kotlin" breaks prebuild.
  assert.match(pluginSource, /"kt",\s*"kotlin"/);
  const kotlin = fs.readFileSync(
    path.join(root, "plugins/native/NetworkConditionsPackage.kt"),
    "utf8",
  );
  assert.match(kotlin, /getStatus/);
  assert.match(kotlin, /CircleNetworkChange/);
  assert.match(kotlin, /NET_CAPABILITY_NOT_ROAMING/);
  assert.match(kotlin, /registerDefaultNetworkCallback/);
  assert.doesNotMatch(kotlin, /READ_PHONE_STATE/);
});

test("new native capabilities ship under their own OTA runtime", () => {
  assert.equal(app.runtimeVersion, "1.2.0");
});
