# Expo token rejection — HTTP details and runtime project check

The user ran `npx eas-cli@latest project:info` and reported `@elijah77/social`, ID `fa49de58-e64b-450a-9401-1f29da85af02`. This matches the frontend configuration. **Do not replace that ID or regenerate Firebase credentials based only on `EXPO_TOKEN_REJECTED`.** The phone's actual Expo response remains unverified.

## Why another diagnostic is needed

The previous error correctly identified the Expo token-exchange stage but grouped HTTP rejection and malformed responses together. The installed SDK embeds status text and potentially sensitive response bodies inside its exception. Showing that raw message could leak a device token or identifiers.

This JavaScript-only follow-up preserves safe response facts and shows the project actually chosen by the app's SDK lookup. It does not claim to fix an unknown provider failure or automatically relink the app.

## Changes

- `PushSetupDiagnostics.ts` extracts a numeric HTTP status from the known SDK error format. A bounded JSON parser accepts only allowlisted provider codes and known request **field names** mentioned in errors/validation paths. Unknown codes, rejected values, HTML, arbitrary status text, raw bodies and oversized data are never displayed or logged.
- Status text such as Bad Request/Forbidden is normalized to HTTP 400/403. HTTP 429 remains rate-limited. Malformed successful responses have `EXPO_RESPONSE_INVALID`, rather than being mistaken for a status inside their body. Server errors are not presented as evidence that Firebase keys need replacing.
- `NativeMessageNotifications.ts` exposes only UUID-validated public project identifiers. It compares `Constants.easConfig.projectId` (SDK runtime metadata) with the configured source `extra.eas.projectId`. That comparison is evidence of different reported IDs, not proof of a specific native build history.
- Token acquisition, capability and backend registration now share the same project getter and match the SDK's truthy fallback when native/runtime metadata is empty. A valid differing runtime ID is not silently replaced.
- `PushNotificationSettings.tsx` displays **EAS project used** during errors and warns about SDK/source mismatch. Diagnostic text is selectable for copying. No arbitrary config value is echoed as a project UUID.
- No new requests, retries, dependencies, native methods/configuration/runtime changes, credentials, backend changes or data reset.

An example safe diagnostic might include `HTTP 400`, `Provider code: VALIDATION_ERROR`, `Fields mentioned: deviceId`. These are examples, **not a claim about the user's actual response**.

## Validation

The initial regression reproduced the previous loss of HTTP status/validation hints. It failed before the change and now passes.

- Notification suite: **186/186** passed.
- Full suite: **639/639** passed, zero failures/cancelled/skipped.
- TypeScript passed; scoped ESLint **6 files, 0 errors, 0 warnings**.
- Android and iOS production-mode Expo/Hermes JS exports passed.
- Dependency and native configuration manifests unchanged from `0bc75e4`.
- Tests cover status normalization, provider field/code redaction, unknown/HTML/oversized responses, misleading body status text, runtime/source project mismatch, invalid config-value secrecy, SDK fallback alignment and mounted Settings display/copy support.

Tests use simulated errors/native transports; they do not contact the user's phone or Expo token service. Evidence: `expo-token-rejection-diagnostics-evidence.json`.

## Next local step

Update the frontend source, run `npx expo start --dev-client --clear`, **reload the app**, and tap retry once. Copy the **full safe error line**, including HTTP number/provider code/field hints, plus the **EAS project used** line. Do not send raw request/response bodies, native device/Expo tokens, access tokens or service-account keys.

This diagnostic itself does not require another native build. Whether a rebuild, project/build correction, connectivity fix or provider retry is needed depends on those facts. The existing local backend URL and the verified source project ID are left unchanged. No actual handset root cause, FCM delivery, native build/install, deployment or live DB success is certified here.
