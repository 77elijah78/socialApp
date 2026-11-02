# Safe Android push setup diagnostics

> **Expo rejection follow-up:** [safe HTTP status/provider hints and runtime project display](expo-token-rejection-diagnostics.md) narrows `EXPO_TOKEN_REJECTED` after the user confirmed the source EAS project ID. No handset rejection reason has yet been verified.

## Why this change

The user reached the terminal Settings error “Couldn’t synchronize system notifications. Check your connection and native FCM configuration, then retry.” That message was a generic catch-all in `PushTokenCoordinator`, not evidence of a particular handset/configuration problem.

The loop fix remains intact. This follow-up makes unknown setup failures identifiable by stage and safe code without exposing SDK exception text, HTTP response bodies, JWTs, push tokens or private native identifiers. **It does not establish the actual cause on the user's phone until the new diagnostic is observed.**

## Implementation

- New `src/services/notifications/PushSetupDiagnostics.ts`: whitelist known SDK codes/native markers and return static actionable text.
- `src/services/notifications/PushTokenCoordinator.ts`: track the actual awaited permission, secure-identity, native-token, Expo-token, backend or cleanup stage. Feed the error to the safe formatter; keep existing sanitized `PushSetupError` backend/ownership messages.
- No logging of raw errors, additional requests/retries, new dependency, native config/runtime change, credential change, channel deletion or data reset.
- The current Settings view already displays `status.detail`; no screen/navigation rewrite is needed.

### Example diagnostic meanings

| Code | Meaning / next action |
| --- | --- |
| `FCM_CONFIG_MISSING` | The native SDK reports Firebase initialization/configuration missing from the **installed APK**. Include the correct Android `google-services.json` and install a new development build. Uploading EAS files does not change an old APK. |
| `FCM_SERVICE_UNAVAILABLE` | Native Firebase messaging service/network unavailable. Check phone internet/Google Play services, reload, retry. |
| `GOOGLE_PLAY_SERVICES_UNAVAILABLE` | Messaging service missing/unavailable on this Android phone. |
| `FIREBASE_INSTALLATION_AUTH` | Firebase rejected this installation; check project/package/client API-key restrictions. |
| `FCM_RATE_LIMITED` | Firebase registration limit; avoid repeated retries. |
| `EXPO_NETWORK_ERROR` | Phone cannot reach Expo's HTTPS token service. This is not the local backend API request. |
| `EXPO_RATE_LIMITED` | Expo rejected registration with HTTP 429/Too Many Requests. |
| `EXPO_TOKEN_REJECTED` | Expo rejected/malformed token response; check EAS project/build and provider availability. Raw response body is not displayed. |
| `NATIVE_MODULE_UNAVAILABLE`, `NATIVE_INSTALLATION_UNAVAILABLE` | Required installed native method/installation support unavailable. |
| `EAS_PROJECT_ID_MISSING`, `NATIVE_APP_ID_MISSING` | EAS or native application configuration unavailable. |
| `PERMISSION_CHECK_FAILED`, `PUSH_IDENTITY_FAILED`, `FCM_TOKEN_FAILED`, `EXPO_TOKEN_FAILED`, `PUSH_SERVER_FAILED`, `PUSH_CLEANUP_FAILED` | Unrecognized error, narrowed to the actual failing phase; no arbitrary error text exposed. |

No diagnostic is selected just because the user uploaded/did not upload a file: the known code/marker must match the caught SDK error. Generic phase fallbacks do not assert a specific cause. A slow/unavailable request is not reported as successful.

## Validation

The initial regression reproduced the masking bug: a simulated SDK missing-Firebase error still became the generic synchronization message. It failed before the change and passes with the explicit, redacted `FCM_CONFIG_MISSING` diagnostic.

- Notification suite: **172/172 passed**.
- Full suite: **625/625 passed**, zero failures/cancelled/skipped.
- TypeScript passed; scoped ESLint **3 files, 0 errors, 0 warnings**.
- Android and iOS production-mode Expo/Hermes JavaScript exports passed.
- 24 new cases cover known SDK/native errors, all six unknown-stage fallbacks, secret redaction, native cause markers, preserved backend validation and ignored stale-account failures.
- Dependency manifests, app configuration and runtime version unchanged from `8ca0116`.

These are simulated error/SDK-contract and regression tests, **not** live handset/FCM/provider tests. Machine evidence: `android-push-setup-diagnostics-evidence.json`.

## Local next step

Update the frontend source, restart Metro with `npx expo start --dev-client --clear`, and **reload the app**. Retry once in Settings → System message notifications. Report only the bracketed code and safe displayed text; do not send tokens, service-account keys or raw provider response bodies.

This diagnostic update itself is JavaScript-only. A native rebuild is required only if the identified cause needs a native/Firebase binary change—for example, `FCM_CONFIG_MISSING`. Do not regenerate Firebase keys or alter a working local API URL based on the old generic message.

No backend code, deployment, merge, native build/install, live DB action, real device/provider send or production delivery certification was performed. Prior backend recipient-scope/per-conversation mute limitations and native release gates remain.
