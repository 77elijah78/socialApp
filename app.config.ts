import type { ConfigContext, ExpoConfig } from "expo/config";
import { isPrivateHost, parseApiOrigin } from "./src/config/origin";

export default ({ config }: ConfigContext): ExpoConfig => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config runs in Node, not the mobile bundle
  const existsSync = require("node:fs").existsSync as (path: string) => boolean;
  const production = process.env.EAS_BUILD_PROFILE === "production";
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile ??
    (existsSync("./google-services.json") ? "./google-services.json" : undefined);
  if (production) {
    const origin = parseApiOrigin(process.env.EXPO_PUBLIC_API_URL);
    if (
      !origin ||
      !origin.startsWith("https://") ||
      isPrivateHost(new URL(origin).hostname)
    )
      throw new Error(
        "Production builds require EXPO_PUBLIC_API_URL to be a public HTTPS API origin (no localhost/LAN fallback).",
      );
  }
  if (production && process.env.EAS_BUILD_PLATFORM === "android" && !googleServicesFile)
    throw new Error("Android production push requires GOOGLE_SERVICES_JSON as an EAS file environment variable and matching FCM V1 credentials in EAS.");
  return {
    ...config,
    name: config.name ?? "social",
    slug: config.slug ?? "social",
    // Opt-in builds contain a different native notification dispatcher and must
    // never receive an OTA bundle intended for the ordinary native runtime.
    runtimeVersion: process.env.EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS === "1" ? "1.1.2-actions-v2" : config.runtimeVersion,
    android: {
      ...config.android,
      // EAS file environment variable; never commit FCM/service-account credentials.
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [...(config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) && plugin[0] === "expo-build-properties"
        ? [
            plugin[0],
            {
              ...plugin[1],
              android: {
                ...plugin[1]?.android,
                usesCleartextTraffic: !production,
              },
            },
          ] as [string, Record<string, unknown>]
        : plugin,
    ), ...(process.env.EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS === "1" ? ["./plugins/withGroupedNotifications.cjs"] : [])],
  };
};
