# Android push token-refresh loop fix

## Confirmed cause

The Settings status appeared stuck at “Checking notification permissions…” and the user also reported missing notifications. A real frontend feedback loop was identified in the installed Expo SDK 56.0.26 path:

```text
root addPushTokenListener → coordinator.refresh()
→ getExpoPushTokenAsync() without devicePushToken
→ getDevicePushTokenAsync()
→ native promise.resolve(token); onNewToken(token)
→ root listener starts/queues refresh again
```

The native getter emits even when the token is unchanged. This was not proof that Android permission was denied, nor proof that the backend had never registered the device: earlier iterations could succeed before the loop started again. Background provider delivery still requires separate verification.

## Fix

- `MessageNotificationsHost.tsx` forwards the native event payload to `deviceTokenChanged` instead of starting another unqualified lookup.
- `PushTokenCoordinator.ts` validates Android string tokens, deduplicates identical events and coalesces genuine rotations to the latest pending payload. Bootstrap explicitly obtains a native token only when needed; its own echo is consumed instead of starting another cycle.
- `NativeMessageNotifications.ts` separates native lookup from Expo exchange and supplies the native payload through the SDK's supported `devicePushToken` option. The server still receives an **Expo token**, never a raw FCM token.
- `MessageNotifications.ts` wires those helpers into the existing singleton coordinator. No additional listener, socket, provider, SDK patch or store was created.
- Pending/observed token values are memory-only and cleared on logout, account changes, disable/unregister and cleanup. Existing authenticated ownership preflight, mutation ordering and stale-account guards remain. Native acquisition is marked active even if a later Expo request fails, so cleanup does not mistakenly skip unregister.
- An explicit permission request queued behind a quiet check is retained for one follow-up; native events never initiate an unsolicited permission prompt.

Status now identifies the actual stage:

1. Checking notification permissions
2. Preparing notification registration
3. Getting Android push token
4. Registering token with Expo
5. Registering this device with the server
6. Enabled or an honest error/permission state

This removes the confirmed client loop. It does not pretend that a slow/unavailable native, Expo or backend service succeeded, and does not add fake delays, unbounded retry polling or a socket-based substitute for push.

## Regression evidence

A new test mounts the **actual root host** with the real coordinator/helpers and installed Expo SDK native-token reader, token emitter and Expo exchange. Native token events and HTTP are doubles; the SDK automatic-registration control is stubbed to isolate the app's own loop.

Before the fix, the test failed: **four native lookups**, with a guard stopping the runaway old implementation. After the fix:

- One app-triggered native lookup, one Expo exchange and one backend registration for the bootstrap path.
- A genuine rollover exchanges the listener's new token without another native lookup and registers once.
- Duplicate events do not restart work; the status settles at ready; listener cleanup is verified.

Additional tests cover rapid/coalesced rotations, logout/account-switch invalidation, ignored malformed/iOS/disabled/stopped events, failures without retry spinning, permanent ownership-preflight failure, queued explicit permission, stage-specific progress and native cleanup after an unsuccessful Expo exchange. The installed SDK source also pins its lookup-emits-event behavior and its supplied-token bypass.

Validation:

- Focused notification suite: **148/148 passed**.
- Full regression suite: **601/601 passed**, zero failures/cancelled/skipped.
- TypeScript passed; scoped ESLint: **8 files, 0 errors, 0 warnings**.
- Android and iOS production-mode Expo/Hermes JS exports passed.
- `package.json`, `package-lock.json`, `app.json`, `app.config.ts` unchanged from `458a473`.
- Exact test/log/source/SDK/config and export hashes are in `android-push-token-loop-fix-evidence.json`.

## Applying it locally

Update to the fixed frontend code. Stop the old Metro process, then run:

```sh
npx expo start --dev-client --clear
```

**Reload the app too**, so the old running JavaScript loop is replaced. Leave the working local API URL and Firebase credentials unchanged.

This fix is JavaScript-only and uses native methods already in the installed notification SDK. It does not require another native development build if the existing APK already contains the notification module and correct Firebase Android client configuration. An APK built before those native/Firebase changes still needs that separate setup build; uploading EAS files does not retrofit an installed APK.

Open Settings → System message notifications and let registration complete. Then background the recipient app and send a **new message from another account**. Foreground Android system alerts remain intentionally suppressed in favor of the existing floating banner.

No physical handset, real Expo/FCM send, EAS/native build/install, live backend/database, APK size/startup/FPS or two-device success was verified here. Existing backend limitations—recipient-scoped data for safe post-account-change legacy links and per-conversation system-push mute—remain documented in the integration report. No backend code, merge, deployment or live DB mutation was performed.
