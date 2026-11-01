export type PushSetupStage = "permissions" | "identity" | "native-token" | "expo-token" | "server" | "cleanup";

/** Whitelisted diagnostics only. SDK messages may embed HTTP bodies, tokens or
 * native identifiers: inspect known markers but never echo the raw exception. */
export function describePushSetupFailure(error: unknown, stage: PushSetupStage): string {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; cause?: unknown } : {};
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "";
  const cause = value.cause && typeof value.cause === "object" ? value.cause as { message?: unknown } : {};
  const text = `${message} ${typeof cause.message === "string" ? cause.message : ""}`;
  const nativeStage = stage !== "expo-token" && stage !== "server";

  if (nativeStage && /Unable to get Firebase Messaging instance|Default FirebaseApp is not initialized|googleServicesFile|No Firebase App.*has been created/i.test(text))
    return "[FCM_CONFIG_MISSING] Firebase is missing from this installed Android app. Include the correct google-services.json and install a new development build. Uploading EAS files or reloading JavaScript alone cannot update an old APK.";
  if (code === "ERR_UNAVAILABLE")
    return "[NATIVE_MODULE_UNAVAILABLE] This installed app is missing a required native notification method. Install a compatible Android development build with Firebase configured; Expo Go or a JavaScript reload cannot add native modules.";
  if (code === "ERR_NOTIF_DEVICE_ID")
    return "[NATIVE_INSTALLATION_UNAVAILABLE] Expo could not read this app’s native notification installation ID. Reload the app; if it persists, check the installed development build’s native notification setup.";
  if (code === "ERR_NOTIFICATIONS_NO_EXPERIENCE_ID")
    return "[EAS_PROJECT_ID_MISSING] The build has no EAS project ID. Check extra.eas.projectId in the frontend configuration.";
  if (code === "ERR_NOTIFICATIONS_NO_APPLICATION_ID")
    return "[NATIVE_APP_ID_MISSING] The Android application ID is unavailable. Use the development APK configured for com.elijah77.social, not Expo Go.";

  if (nativeStage && /\bFIS_AUTH_ERROR\b|\bAUTHENTICATION_FAILED\b/.test(text))
    return "[FIREBASE_INSTALLATION_AUTH] Firebase rejected this installation. Check that the Firebase project, Android package and client API-key restrictions match this build.";
  if (nativeStage && /\bMISSING_INSTANCEID_SERVICE\b|Google Play services.*(?:missing|unavailable)/i.test(text))
    return "[GOOGLE_PLAY_SERVICES_UNAVAILABLE] Android cannot access Firebase messaging services. Check that Google Play services is installed, enabled and working on this phone.";
  if (nativeStage && /\bTOO_MANY_REGISTRATIONS\b/.test(text))
    return "[FCM_RATE_LIMITED] Firebase reported too many registrations. Stop repeated retries and retry after the provider restriction clears.";
  if (nativeStage && /\bSERVICE_NOT_AVAILABLE\b|\bFIREBASE_INSTALLATIONS_SERVICE_NOT_AVAILABLE\b/.test(text))
    return "[FCM_SERVICE_UNAVAILABLE] Android could not reach Firebase messaging services. Check the phone’s internet and Google Play services, then reload the app before retrying.";
  if (code === "ERR_NOTIFICATIONS_NETWORK_ERROR")
    return "[EXPO_NETWORK_ERROR] The phone could not reach Expo’s HTTPS token service. Check internet, VPN or private-DNS restrictions. This request does not use your local backend URL.";
  if (code === "ERR_NOTIFICATIONS_SERVER_ERROR") {
    if (/received:\s*(?:429\b|Too Many Requests\b)/i.test(message))
      return "[EXPO_RATE_LIMITED] Expo rate-limited token registration. Stop repeated retries and retry after its restriction clears.";
    return "[EXPO_TOKEN_REJECTED] Expo rejected the token request or returned an invalid response. Check the EAS project/build configuration and Expo service availability. This happened before backend device registration.";
  }
  if (stage === "permissions")
    return "[PERMISSION_CHECK_FAILED] Couldn’t check Android notification permission or prepare the Messages channel. Check the phone’s app notification settings, then reload and retry.";
  if (stage === "identity")
    return "[PUSH_IDENTITY_FAILED] Couldn’t read or prepare this app’s secure notification identity. Unlock and reload the phone app, then retry. Do not clear app data to bypass account ownership.";
  if (stage === "native-token")
    return "[FCM_TOKEN_FAILED] Android could not obtain an FCM token. Check the phone’s internet, Google Play services and Firebase setup in this installed APK, then reload and retry.";
  if (stage === "expo-token")
    return "[EXPO_TOKEN_FAILED] Couldn’t exchange the Android token with Expo. Check the phone’s internet and EAS project configuration, then reload and retry.";
  if (stage === "cleanup")
    return "[PUSH_CLEANUP_FAILED] Couldn’t finish notification cleanup. Check connectivity and the installed native Firebase setup before retrying. Pending device ownership has not been discarded.";
  return "[PUSH_SERVER_FAILED] Couldn’t finish device registration with the app backend. Check that the phone can reach the configured API and that its push routes are enabled.";
}
