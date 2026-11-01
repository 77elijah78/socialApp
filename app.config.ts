import type { ConfigContext, ExpoConfig } from "expo/config";
import { isPrivateHost, parseApiOrigin } from "./src/config/origin";

export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.EAS_BUILD_PROFILE === "production";
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile;
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
    android: {
      ...config.android,
      // EAS file environment variable; never commit FCM/service-account credentials.
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: (config.plugins ?? []).map((plugin) =>
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
          ]
        : plugin,
    ),
  };
};
