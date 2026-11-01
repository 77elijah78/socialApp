# Android message push — real backend integration

> **Setup-error follow-up:** [safe stage/code diagnostics](android-push-setup-diagnostics.md) replaces the catch-all connection/FCM message without exposing tokens or changing credentials. The actual handset cause still needs the resulting diagnostic.

> **Token-refresh follow-up:** [SDK token-event feedback-loop fix](android-push-token-loop-fix.md) reuses the event payload, stops duplicate registration cycles and adds stage-specific status messages.

> **SDK 56 sound follow-up:** [default-channel sound correction](android-notification-sound-fix.md) removes an invalid explicit channel sound argument without muting notifications or adding assets. The validation below remains the original `6e3a79b` integration evidence.

**Current status: the frontend is now connected to the actual push APIs in backend `54d68dfd61efbd25da3afdeab033e7e060ef2d95`. Native token registration, revocation, preferences, visibility and supported push navigation are implemented and locally validated. Real handset/FCM/EAS delivery is NOT certified.**

This supersedes the disconnected-client checkpoint at frontend `3b8d75f54eae570b4fe60652cacb867a370661c7`. The user reports uploading the Firebase client file and FCM V1 credential to EAS, and already has the local API URL configured. Neither credentials nor the live device/backend environment were accessed or verified here. The user's actual API URL was not changed.

Two backend contract limits remain: no recipient account ID in push data, and no per-conversation system-push mute API. See section 7; the client does not guess ownership or fabricate an endpoint.

## 1. What was fixed

The previous client instantiated `PushTokenCoordinator` with a null HTTP adapter and ignored remote data without a decoder. Adding backend Expo credentials could not register a phone. This implementation installs the actual authenticated backend adapter and parses the real published data schema.

- Real `POST /push/devices` with the phone's Expo token, an installation UUID, Android platform and existing EAS project ID.
- Real, idempotent device DELETE before logout/account transfer, including restoration of registration metadata after an app restart.
- Account-wide message-push and preview preferences, authoritative GET/PATCH, optimistic changes with rollback, account/ABA guards and an opt-in privacy default.
- Android channel **`messages`**, matching the backend sender, rather than the previous mismatched `messages-v1`.
- Actual native warm/cold tap bridge, stable provider-job dedupe, auth/navigation readiness, exact-conversation checks and fresh membership REST validation.
- Actual backend `conversation:visibility` lease updates and `messages:sync` recovery through the existing shared socket, not a new connection.

## 2. Architecture and files

| File(s) | Change |
| --- | --- |
| `src/services/notifications/PushBackendService.ts` (new) | Source-verified token/preference HTTP contracts, safe setup errors, payload validation and registration ownership checks. |
| `src/services/notifications/PushInstallation.ts` (new) | Encrypted, durable installation/ownership journal. Does not persist JWTs, raw Expo tokens or messages. |
| `src/services/notifications/PushPreferencesController.ts` (new) | Scoped preference GET/PATCH, single-flight reads and optimistic rollback without stale account results. |
| `src/services/notifications/PushVisibilityCoordinator.ts` (new) | Focused-device viewing lease, 15-second foreground-chat heartbeat and immediate clear/cleanup. |
| `src/services/notifications/MessageNotifications.ts` | Installs the real adapter, joins runtime/Redux/native/REST recovery and lifecycle cleanup. |
| `src/services/notifications/PushTokenCoordinator.ts` | Pre-token ownership checks, durable registration cleanup, actionable server errors and existing serialized native lifecycle. |
| `src/services/notifications/MessagePushBridge.ts` | Async encrypted-owner decoding, provider notification ID dedupe, cancellation and safe ambiguity handling. |
| `src/services/notifications/MessageNotificationCoordinator.ts` | Defers generic unsafe-link notices until authenticated navigation is ready. Existing banner/navigation/read rules retained. |
| `src/services/notifications/NativeMessageNotifications.ts` | Matching channel, Android-only backend capability, existing Expo Core UUID generator, lazy existing SecureStore and EAS project lookup. |
| `src/services/notifications/PushLogout.ts`, `src/services/AuthService.ts` | Online cleanup before account changes while the old HTTP identity is still available; preserve the bounded offline logout flow. |
| `src/services/SocketReceiver.ts` | One forwarded `messages:sync` listener and an owner-checked `conversation:visibility` emitter on the existing socket. |
| `src/components/notifications/MessageNotificationsHost.tsx` | One root scope/lifecycle owner; excludes covered/non-focused chats from the server viewing lease. |
| `src/components/notifications/PushNotificationSettings.tsx` | Device status, permission/retry, real account-wide switches, preview disclosure and account-link limitation. |
| `app.json`, `app.config.ts` | Matching default channel; runtime **1.1.1**; EAS Firebase file support plus local `google-services.json` detection. |
| `.env.example`, `.gitignore` | Local native-build instructions and ignored local Firebase client file. No actual API URL or credentials added. |
| `test/notifications/backend-integration.test.cjs` (new) | Real HTTP client/adapter + backend-shaped registration/preferences/payload/ownership regressions. |
| `test/notifications/preferences-and-visibility.test.cjs` (new) | Optimistic preference and exact 15-second visibility lifecycle tests. |
| `test/notifications/runtime.test.cjs` (new) | Actual singleton/runtime + shared socket/Redux/SQLite/bridge + mounted Settings; native/network doubles. |
| `test/notifications/{config,logic,native,push-lifecycle}.test.cjs` | Updated channel/config and new async tap/dedupe/notice/native-identity regressions. |
| This report, its evidence JSON, and checkpoint/handoff supersession notes | Current state and honest release gates; original evidence retained. |

No new dependency, Expo/React Native upgrade, SQLite migration, competing message store or socket was added. `package.json` and `package-lock.json` are unchanged from `3b8d75f`. Existing Activity, protected media, composer, message receipts/history and native-stack transitions retain their regression coverage. Unrelated `backend-delivery/` remains untouched.

## 3. Exact HTTP, payload and socket contracts

All HTTP paths use the existing API/auth client and `/api/v1` prefix:

- `POST /push/devices`: `{ deviceId: UUID, platform: "android", projectId: UUID, token: ExpoPushToken-or-ExponentPushToken }`.
- `DELETE /push/devices/:deviceId`: owner-scoped, requires `data.unregistered === true`.
- `GET /push/preferences`: `{ messagePushEnabled: boolean, pushPreviewsEnabled: boolean }`.
- `PATCH /push/preferences`: one/both of those booleans; accepts authoritative returned values.
- Existing `GET /messages/conversations` supplies active membership/private-group metadata. No nonexistent single-conversation endpoint is called.
- Existing message-history and pending-delivery APIs reconcile bodies/unread counts; push does not invent a message row or mark the room READ.

The actual push data fields are:

```text
messageId, conversationId, senderId, notificationId: UUID
notificationType: "MESSAGE"
conversationType: "private" | "group"
```

The decoder validates all fields and ignores arbitrary URL/group/receiver hints. It does not pretend a recipient ID exists. Provider `notificationId` deduplicates multiple native request identifiers for the same job; failed lookup can be deliberately retried.

Existing native socket events `message:new` / `message:notification` still persist/dedupe through `SocketReceiver`; its local post-persistence `message:incoming` drives the single foreground banner. Existing incoming/deletion/receipt paths remain.

New integration uses actual backend events:

- Server → client **`messages:sync`**: request authoritative inbox/pending/active-history recovery.
- Client → server **`conversation:visibility`**: `{ deviceId, state: "foreground" | "background", conversationId: UUID | null }`.
- Refresh every **15 seconds only while a registered, focused chat is actually visible and AppState is active**. This renews the backend's 45-second lease; it is not READ or an online-user flag.
- Navigating away, covering the chat with an overlay, backgrounding, logout, disconnect and cleanup stop/clear the lease. Reconnect renews the current exact scope. The emitter checks the current socket JWT owner before sending.

## 4. Account and privacy behavior

The installation UUID uses the native generator already supplied by Expo SDK 56 Core; no extra native package or weak random fallback. The small ownership journal uses the already installed SecureStore, survives process restarts/logout, and contains IDs/status only.

Registration/revocation is serialized with native token acquisition/unregister. A previous account's unresolved binding blocks a new Expo token acquisition rather than reactivating its provider address under the wrong login. Expo automatic server token registration is disabled during native unregister. The real backend refuses cross-account ownership transfer until the old account unregisters; the client exposes that restriction instead of silently stealing a device binding.

Explicit logout/account transfer suspends presentation and refresh immediately, attempts the authenticated DELETE while the old identity is active, unregisters native push and clears displayed/last-response state. The existing 5-second cleanup deadline avoids stranding offline logout; an uncertain/failed revocation journal is retained for online cleanup by the original account. No client can recall an already in-flight provider request/banner. Offline privacy/provider behavior remains a physical-device release gate.

Server preview opt-in is separate from device permission. The Settings UI does not report account-disabled push as effective merely because a token registered successfully. The main existing switch controls this device's banners/registration; the new server switch explicitly controls system message push on all registered devices.

## 5. Local Android test setup — no public backend hosting needed

Keep the working local `EXPO_PUBLIC_API_URL` in `.env.local`. It must be the computer's reachable LAN address/port, without `/api/v1`, not the phone's `localhost`. Phone and computer need network connectivity; backend and phone also need internet access to Expo/FCM. The production public-HTTPS guard is unchanged; local development may use HTTP.

**Option A — EAS development build (uses the Firebase files already uploaded):**

```sh
npm ci
npx eas-cli@latest build -p android --profile development
```

Install that APK on the physical Android phone, then run:

```sh
npx expo start --dev-client --clear
```

**Option B — local native build:** with Android Studio/SDK/JDK and a connected phone with USB debugging, put the downloaded Firebase Android **client** `google-services.json` beside `package.json` (now auto-detected/ignored), or set `GOOGLE_SERVICES_JSON` to its path. Then run `npx expo run:android --device`. The private service-account key must never be placed in the app; it stays in EAS credentials.

Use the same Firebase project/package `com.elijah77.social`, matching FCM V1 EAS credentials and existing EAS project ID. **Expo Go is unsupported for this remote Android push flow.** A fresh native build with Firebase configuration is required; Metro reload cannot add it to an old binary.

After installing: Settings → Notifications → **Enable / retry system notifications**. Grant Android permission and wait for device registration to succeed. Then background the app and send a **new** message from another account. The backend targets devices registered when a message is created, not old history.

Backend must actually run `54d68df` or a compatible newer release, have migration `20261101000000_message_push_delivery` applied and `PUSH_ENABLED=true`, `EXPO_PROJECT_ID` matching the app, `EXPO_ACCESS_TOKEN`, worker and outbound Expo access configured. This work does not establish the user's deployed/local server version or run its migration.

## 6. Validation

- Fresh baseline: **539/539** passed.
- Focused notification suite: **133/133** passed (47 new cases over the 86-case checkpoint), **5,217.236855 ms**.
- Full suite: **586/586** passed, **66,885.041832 ms**, zero failures/cancelled/skipped.
- TypeScript passed; scoped ESLint **26 files, 0 errors, 0 warnings**.
- Both Android and iOS production-mode Expo/Hermes JS exports passed. Native system push is supported only for Android by this backend; iOS foreground banners remain.

Tests include the actual installed runtime, Redux, SQLite, SocketReceiver, HTTP client, API adapter, cold-start bridge and mounted Settings with mocked HTTP/native transports. They are not real Firebase/EAS/device or PostgreSQL/provider tests.

Controlled fresh exports compare `3b8d75f` against this implementation with identical installed dependencies, production mode, `EXPO_PUBLIC_API_URL=https://api.test` as an export-only fixture, two Metro workers:

| Platform | Baseline Hermes bytes | Updated bytes | Delta | Assets |
| --- | ---: | ---: | ---: | --- |
| Android | 6,784,461 | 6,822,364 | +37,903 (**+0.558674%**) | 46 byte-identical |
| iOS | 6,599,621 | 6,633,151 | +33,530 (**+0.508059%**) | 43 byte-identical |

No additional runtime/native dependency was introduced. Bytecode is not APK/AAB size or startup/FPS evidence. Asset/source/test/config hashes and explicit unperformed checks are in `android-push-backend-integration-evidence.json`.

## 7. Remaining backend limits and native release gates

1. **Recipient account missing from actual payload.** Single-owner installations resolve taps from persisted server-confirmed ownership, never the current login. After an account or API-origin change, legacy payloads cannot prove which account received them—even if both accounts belong to the same group. The client fails closed with a generic notice instead of opening the wrong account. Add a recipient account ID/version to the backend's published push contract to support those links fully. Background delivery/registration itself is not disabled by this navigation limitation.
2. **No per-conversation push-mute API.** Existing in-app mute remains accurately labeled and affects banners only. Real account-wide server opt-out is integrated; per-chat system mute still requires backend support. No guessed route or fake system mute was added.
3. **Offline account transfer.** Server ownership protection can require signing back into the original account to unregister online after uncertain cleanup. Native unregister and journal fencing reduce risk but cannot prove provider revocation or recall accepted messages. Device verification is mandatory.
4. **All 13 requested physical two-account/two-Android scenarios remain unperformed here:** Home/Profile/different/same/group chat, attachments, bursts, gestures, background/termination, warm/cold taps, reconnect duplicates and production build. Local doubles/exports do not count as those tests.
5. No EAS native APK/AAB build/install, real Expo token acquisition/provider send, Firebase credential verification, deployed backend/database check, native APK size/startup/FPS/memory/OEM/doze or force-stop certification was performed. Android force-stop is not normal process termination and may suppress delivery until reopening.
6. No backend edits, merge, deployment or live DB mutation. The frontend PR remains open. Approximately 128 MB APK and <1-second startup targets require actual release measurements.
