# Android inline reply and conversation stacking

## Scope and rollout

This frontend targets backend `77elijah78/nodejs-socialapp` PR #2, commit `66cf04248f4b29e7476cf61b30297136d33e1b4b`. The backend and the additive `20261102000000_notification_reply_contract` migration (and earlier push migration) must be deployed before a device registers in v2 mode. Neither was deployed or migrated by this frontend change.

The feature is **enabled in the EAS development and preview build profiles for device testing** by `EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS=1`. It is disabled in the production profile pending real Android/FCM validation. Disabled builds keep the original `expo-alert` registration and notification flow. Feature-enabled builds have runtime version `1.1.2-actions-v2`; ordinary builds have `1.1.2`, preventing cross-runtime OTA updates. A development client also needs the flag set in the Metro environment when running the JS bundle. The EAS preview profile builds the matching native receiver and bundles the flag automatically. Existing Firebase/EAS secrets and API URL configuration are unchanged.

Once the backend is ready, install a **new EAS preview Android build** on physical devices and sign in. A server that doesn't acknowledge `android-data-v2` is shown as an error rather than silently claimed to support actions. The feature changes delivery to data-only on that installation; background delivery depends on Expo/FCM, TaskManager and the OS. To return a test device to the old alert path, install a build without the flag and allow it to re-register, or explicitly unregister it before changing builds. Force-stop, Doze, network restrictions and OEM policies can prevent/delay background tasks.

## Implementation

* The early entry point defines an Expo TaskManager task and registers it and a `MESSAGE_REPLY_V2` text-input category before opting into `android-data-v2` on each registration.
* The task strictly validates v2 data, registered recipient, installation, origin, and backend-supplied display. It schedules a local child with stable `notificationId`. A native `NotificationsService` subclass preserves Expo's standard actions/taps and groups these children by the recipient/conversation key, with a generic summary without reply actions or preview content. It uses the existing `messages` channel and keeps the regular foreground banner pipeline.
* The native action receiver generates an action UUID and dispatches the response only to the task. The task persists the complete request before network I/O: SQLite stores identifiers/state and Android SecureStore encrypts reply text. The server's idempotency key is reused on retry. Timeouts, 401 and other ambiguous failures remain pending; permanent 400/403/409/410 failures stop retrying and a generic notification asks the user to open the app. Pending replies retry on resume, initial authenticated readiness or token change. No read receipt is created by replying.
* Logout blocks the account in the action DB, clears pending records and displayed notification identifiers, and dismisses native notifications. The backend independently checks JWT, installation, delivery job and membership. Existing alerts remain legacy-compatible.

## Validation and limits

Automated tests exercise task callbacks with mocked Android/Expo and network boundaries, SQLite-backed action records, simulated timeout/retry, recipient/installation isolation, grouped keys, data decoding, and source/config contracts. Expo Android bundle export and native prebuild generation were run. **No Android native compile, Expo gateway/FCM delivery, physical-device inline reply, process-killed behavior, UI grouping, or APK size/startup measurements have been verified in this environment.** In particular, the Expo gateway's actual FCM data-only envelope and TaskManager/headless behavior must be confirmed on devices before production rollout. Background execution is best effort, not a delivery guarantee. An action can be lost if Android terminates the process before the JS task persists it; no exactly-once UI/action delivery is claimed.

## Device test checklist

1. Confirm the new backend and migrations are deployed to the API used by the app. Build/install the EAS preview profile and verify notification settings show registration enabled. Do not share tokens or credentials.
2. With the recipient app backgrounded, send multiple private messages in one conversation and messages in another. Check distinct stacks, multiple children, generic summary and preview-off privacy. Repeat for a group conversation.
3. Reply from an individual child without opening the app; verify exactly one message appears for both users and no read receipt is inferred. Repeat with the app backgrounded and process killed (not force-stopped).
4. Disconnect networking immediately after sending a reply, then reconnect/open the app. Check the pending notice and that the same reply appears at most once after retry. Test expired auth, logout/account switch, a removed member and a deleted message.
5. Check taps, existing foreground banners, sound/channel settings, permissions denied, mute/preferences, token refresh and old alert-mode devices. Test with Doze and OEM battery restrictions. Only enable the production profile after these checks pass on the actual build.
