# Android notification default-sound fix

## Root cause

The user reported repeated native logs: `expo-notifications: Custom sound 'default' not found in native app`.

Our channel configuration explicitly passed `sound: "default"` to `setNotificationChannelAsync`. In the installed **expo-notifications 56.0.26**, the Android channel implementation treats non-null sound strings as bundled custom resource names. Its `customSoundExists` check looks for a raw Android resource named `default`, logs the reported error when absent, then continues channel creation.

This differs from the Expo push **notification payload**: the backend's `sound: "default"` is not changed by this fix.

## Change

- Omit the `sound` key from the frontend channel configuration. The installed Android implementation accepts omission and uses the system default for a new channel; `null` would mean silence.
- Keep channel ID `messages`, HIGH importance, PRIVATE lockscreen visibility, vibration and existing user channel settings unchanged.
- No custom sound file, `sounds` config-plugin entry, dependency upgrade, native patch, channel deletion, Firebase credential change or runtime-version change.
- Correct the previous unit test that incorrectly expected the explicit string. Add regression coverage through the **installed Android JavaScript wrapper** and assertions against the installed Java sound-validation/resolution source.

The original native test was changed first and reproduced the invalid argument: **9 passed / 1 failed** before the source correction.

## Validation

- Targeted native/channel suite: **12/12 passed**.
- All notification tests: **135/135 passed**.
- Full suite: **588/588 passed**, zero failures/cancelled/skipped.
- TypeScript passed; scoped ESLint: **3 files, 0 errors, 0 warnings**.
- Android and iOS production-mode Expo/Hermes JavaScript exports passed.
- `package.json`, `package-lock.json`, `app.json`, `app.config.ts` unchanged from `6e3a79b`.

Tests execute JS/wrapper code and inspect native source; they do **not** execute Android native rendering or prove FCM delivery. Machine evidence is in `android-notification-sound-fix-evidence.json`.

## Applying the fix locally

Update to the fixed source, then restart Metro for the installed development client:

```sh
npx expo start --dev-client --clear
```

Reload SocialApp and check Settings → System message notifications again. This is a JavaScript-only correction; an existing development binary with the notification module/Firebase configuration does not need rebuilding for this sound fix. An APK with embedded JavaScript must receive updated code to include it.

Do not add a fake `default.wav`, silence all notifications, delete/recreate channels, or clear the app's message/account data. Android preserves existing channel settings; if Messages is already muted, select a sound in the phone's system notification settings rather than resetting the channel.

The SDK continued channel creation despite this log, so removing it alone is **not proof that background push delivery is working**. If notifications still do not arrive, use the current registration status and backend provider/device evidence for the next diagnosis. No backend changes, deployments, live DB actions, real-device tests or provider sends were performed here.
