const httpLabels: Record<string, number> = {
  "bad request": 400, unauthorized: 401, "payment required": 402, forbidden: 403, "not found": 404,
  "request timeout": 408, conflict: 409, gone: 410, "payload too large": 413, "unsupported media type": 415,
  "unprocessable entity": 422, "too many requests": 429, "internal server error": 500,
  "bad gateway": 502, "service unavailable": 503, "gateway timeout": 504,
};
const providerCodes = new Set(["VALIDATION_ERROR", "BAD_REQUEST", "PROJECT_NOT_FOUND", "EXPERIENCE_NOT_FOUND",
  "UNAUTHORIZED", "FORBIDDEN", "RATE_LIMITED", "INTERNAL_SERVER_ERROR", "SERVICE_UNAVAILABLE", "PUSH_TOKEN_GENERATION_ERROR"]);
const requestFields = ["projectId", "appId", "deviceId", "deviceToken", "type", "development"];
function expoResponseFacts(message: string) {
  // SDK embeds statusText plus a possibly sensitive response body in its error.
  // Only expose a status number, known provider codes and known FIELD NAMES.
  const prefix = message.slice(0, 8192);
  const match = /received:\s*([^()\r\n]{1,64}?)(?:\s*\(body:|$)/i.exec(prefix);
  const label = match?.[1].trim().toLowerCase() ?? "";
  const status = /^[1-5]\d{2}$/.test(label) ? Number(label) : httpLabels[label] ?? null;
  const codes = new Set<string>(), fields = new Set<string>();
  const start = message.indexOf('(body: "'), end = message.lastIndexOf('").');
  if (start >= 0 && end > start && end - start <= 8192) {
    try {
      const body = JSON.parse(message.slice(start + '(body: "'.length, end));
      const errors = Array.isArray(body?.errors) ? body.errors.slice(0, 8) : [body?.error ?? body];
      for (const item of errors) {
        if (!item || typeof item !== "object") continue;
        if (typeof item.code === "string" && providerCodes.has(item.code)) codes.add(item.code);
        const text = typeof item.message === "string" ? item.message.slice(0, 2048) : "";
        for (const field of requestFields) if (new RegExp(`\\b${field}\\b`, "i").test(text)) fields.add(field);
        const details = Array.isArray(item.details) ? item.details.slice(0, 8) : [item.details];
        for (const detail of details) if (Array.isArray(detail?.path))
          for (const field of requestFields) if (detail.path.includes(field)) fields.add(field);
      }
    } catch { /* Never fall back to echoing malformed/untrusted response text. */ }
  }
  const safe = [status ? `HTTP ${status}.` : "HTTP status unavailable.",
    codes.size ? `Provider code: ${[...codes].join(", ")}.` : "",
    fields.size ? `Fields mentioned: ${[...fields].join(", ")}.` : ""].filter(Boolean).join(" ");
  return { status, safe };
}

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
    const facts = expoResponseFacts(message);
    if (/Malformed response from server|Expected a JSON response from server/i.test(message))
      return "[EXPO_RESPONSE_INVALID] Expo returned an invalid token response. Check its service availability and whether a VPN, proxy or captive portal is intercepting the phone’s connection. No response contents are displayed.";
    if (facts.status === 429)
      return "[EXPO_RATE_LIMITED] HTTP 429. Expo rate-limited token registration. Stop repeated retries and retry after its restriction clears.";
    if (facts.status && facts.status >= 500)
      return `[EXPO_TOKEN_REJECTED] ${facts.safe} Expo’s token service returned a server error. Retry when the service is available; this is not evidence that Firebase keys need replacing.`;
    return `[EXPO_TOKEN_REJECTED] ${facts.safe} Expo rejected token registration before the app backend was contacted. Compare the app’s displayed EAS project with project:info; do not change IDs or credentials without the response evidence.`;
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
