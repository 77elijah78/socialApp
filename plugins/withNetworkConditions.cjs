/* global __dirname */
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE = "com.elijah77.social.network";
const MODULE_CLASS = `${PACKAGE}.NetworkConditionsPackage`;

/**
 * Android's ConnectivityManager is the only source that reports roaming and
 * metered network type changes reliably. expo-network remains the JS fallback
 * for iOS, Expo Go and any build created before this plugin ran.
 */
module.exports = function withNetworkConditions(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] || [];
    const name = "android.permission.ACCESS_NETWORK_STATE";
    if (
      !manifest["uses-permission"].some(
        (permission) => permission.$?.["android:name"] === name,
      )
    )
      manifest["uses-permission"].push({ $: { "android:name": name } });
    return config;
  });

  config = withMainApplication(config, (config) => {
    // Expo SDK 56 reports Kotlin as "kt"; older templates used "kotlin".
    if (!["kt", "kotlin"].includes(config.modResults.language))
      throw new Error("Network conditions require the Kotlin MainApplication");
    const contents = config.modResults.contents;
    if (contents.includes(MODULE_CLASS)) return config;
    const match = contents.match(/PackageList\(this\)\.packages\.apply\s*\{/);
    if (!match) throw new Error("Expo PackageList block not found in MainApplication");
    config.modResults.contents = contents.replace(
      match[0],
      `${match[0]}\n              add(${MODULE_CLASS}())`,
    );
    return config;
  });

  return withDangerousMod(config, [
    "android",
    async (config) => {
      const destination = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java/com/elijah77/social/network/NetworkConditionsPackage.kt",
      );
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.copyFile(
        path.join(__dirname, "native/NetworkConditionsPackage.kt"),
        destination,
      );
      return config;
    },
  ]);
};
