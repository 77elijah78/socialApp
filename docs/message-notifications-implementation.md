# Global message banners and Android push — frontend checkpoint

**Status: foreground banners implemented; native push client prepared; end-to-end system push BLOCKED on the backend contract.**

Frontend baseline: `a2fd1876ac332a452f232e3202d28faf95bc2624`.
Backend inspected and rechecked: `902e191d807e83d47cba2e66831e024b04db9921`.

The user selected **“Backend session will add push support”** after the audit found no push-token registration/revocation API, device-token storage, notification preference/mute API, or Expo/FCM sender in that backend branch. No endpoint, token DTO, or push payload was invented. The actual HTTP adapter and remote-payload decoder are deliberately **not installed**. This checkpoint is **not a completed end-to-end push implementation or production-device certification**. The next integration step requires the backend session's real source contract.

Backend handoff: [message-push-backend-handoff.md](message-push-backend-handoff.md). Machine evidence: [message-notifications-evidence.json](message-notifications-evidence.json).

## 1. Files modified and new components

34 files in this task, including the separately pushed backend handoff:

| Files | Purpose |
| --- | --- |
| `src/components/notifications/MessageBanner.tsx` | One themed, safe-area-aware, measured-height Reanimated banner with protected avatar, bounded text, count, tap, dismiss and swipe gestures. |
| `src/components/notifications/MessageNotificationsHost.tsx` | One root host; route/auth/preference/AppState integration and native token-change listener. |
| `src/components/notifications/PushNotificationSettings.tsx` | Explicit permission/retry/system-settings UI and honest setup/error/backend-required states. |
| `src/services/notifications/MessageBannerQueue.ts` | Presentation-only ID dedupe, per-conversation burst aggregation, bounded preview and real media labels. |
| `src/services/notifications/MessageNotificationCoordinator.ts` | Display rules, account/async guards, pending destinations and access-checked navigation. |
| `src/services/notifications/ConversationDirectory.ts` | Existing active-membership REST and local metadata/mute reuse; fresh access check on tap. |
| `src/services/notifications/MessagePushBridge.ts` | Native response/receive separation, get-last/listener dedupe and deferred domain destinations; needs real decoder. |
| `src/services/notifications/NativeMessageNotifications.ts` | Conditional native-module loading, foreground handler, channel, permissions, Expo token and system settings. |
| `src/services/notifications/PushTokenCoordinator.ts` | API-neutral token lifecycle, serialized cleanup/registration, rotation/retry/permission/account/StrictMode guards. No fake registration success. |
| `src/services/notifications/MessageNotifications.ts` | Singleton integration with existing socket/store/router and native receive/response listeners; backend adapter installation boundary. |
| `src/services/notifications/PushLogout.ts` | Lightweight auth cleanup hook with a real 5-second I/O deadline; does not load native/router code into AuthService. |
| `src/services/ConversationService.ts` | Moves the existing conversation DTO/mapper out of `useRooms`, without introducing another schema. |
| `src/services/SocketReceiver.ts` | Post-persistence local arrival facade; existing wire listeners, connection, receipts and canonical message flow retained. |
| `src/services/AuthService.ts` | Suspend/revoke push before clearing authenticated identity; existing logout/cache flow remains. |
| `src/db/RoomStore.ts` | Existing local `muted` field update/notification and explicit authoritative-room resync request. No migration or new message store. |
| `src/hooks/useRooms.ts` | Reuses extracted mapper and existing single-flight REST refresh for resync requests. |
| `src/app/_layout.tsx` | Mounts one banner host beside the existing root Stack, inside existing providers. |
| `src/app/(chatRoom)/privateRoom.tsx` | Makes the previous no-op mute menu functional for **in-app banners**, with explicit server-push limitation. |
| `src/app/settings.tsx` | Reuses the existing global Notifications switch; adds system-push settings/status. Named theme imports retain existing values. |
| `app.json`, `app.config.ts`, `.env.example` | SDK plugin/permission/runtime/channel and EAS Firebase file configuration; production Android guard. |
| `src/assets/notification-icon.png` | Tiny 96×96 white-on-transparent Android notification glyph. |
| `package.json`, `package-lock.json` | SDK-compatible `expo-notifications`/`expo-device`, compatible transitive resolutions, focused/default test commands. No Expo/RN framework upgrade. |
| `test/notifications/logic.test.cjs` | 33 display/queue/navigation/account/lifecycle tests. |
| `test/notifications/push-lifecycle.test.cjs` | 21 API-neutral token and native-response lifecycle tests. |
| `test/notifications/socket-and-directory.test.cjs` | 11 real shared SocketReceiver/SQLite/directory/mute regressions with transport/HTTP doubles. |
| `test/notifications/native.test.cjs` | 8 SDK-call/permission/channel/capability tests with native doubles. |
| `test/notifications/banner-ui.test.cjs` | 9 mounted banner/timer/gesture-handler/subscription tests; not native gesture recognition. |
| `test/notifications/config.test.cjs` | 4 native configuration/runtime/FCM build-guard checks. |
| `docs/message-push-backend-handoff.md`, `docs/message-notifications-implementation.md`, `docs/message-notifications-evidence.json` | Backend coordination, this delivery and sealed validation/size/hash evidence. |

Unrelated `backend-delivery/` is untouched. Backend source was inspected read-only. Generated exports/archives are not feature files.

## 2. Banner architecture and behavior

- `SocketReceiver` still owns the **only** Socket.IO connection. Both real message wire events persist through the existing `MessageStore` first. Only genuinely new incoming, non-deleted persisted messages are exposed to presentation; indexed SQLite identity checks prevent old/history/reconnect deliveries becoming fresh banners.
- The root host consumes a single coordinator/queue. `useSyncExternalStore` updates the host rather than putting transient banners into Redux or rerendering the application tree. No banner lives inside the chat screen, and no second message store exists.
- Own, already-read, deleted, muted, globally disabled, background and exact-conversation arrivals are suppressed. Another conversation, Home, Profile, Activity or Settings remains eligible. Route changes remove matching visible/queued banners. Logout/account ABA and late metadata work cannot reopen or reveal old-account presentation.
- Bursts aggregate **per conversation**, preserving their arrival count and latest preview. Other conversations queue FIFO without overlapping banners. All actual messages remain in SQLite; this is not an attempt to show a separate 3.5-second card for every message in a large burst.
- Each visible card has one approximately **3,500 ms** lifetime, not reset by burst updates. Entrance/exit use Reanimated, system reduced-motion support and the measured card height. Upward or horizontal swipe and a close control dismiss; tapping uses only the canonical conversation ID.
- Uses the existing colors/shadows, RNGH, safe-area provider, protected image renderer and native-stack conventions. Text/name/group lines are bounded; width is responsive and capped on tablets. The overlay does not take the entire screen's touches.
- Real backend media types are `TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`, `SHARED_POST`, `SHARED_STORY`; `AUDIO` displays “Voice message.” There is no invented `VOICE` message enum.
- The banner never sends READ or marks a whole conversation read. Existing eligible visible-message logic remains the only read-visibility owner.

## 3. Socket events and existing REST contracts

**Actual backend wire events:** `message:new` and `message:notification`, already handled by `SocketReceiver`. The server can emit both for one message; canonical ID dedupe prevents two banners/unread increments.

**Local facade only:** `message:incoming` is emitted after persistence for presentation. It is **not** a new backend protocol or extra native Socket.IO listener. Existing `message:deleted`, `message:deleted-for-me`, `conversation:deleted` and `connect` facade events support cleanup/recovery; another participant deleting their own copy does not delete ours.

Existing authenticated REST reused:

- `GET /api/v1/messages/conversations` — actual active-membership/participant/group metadata and authoritative unread counts.
- `GET /api/v1/messages/conversations/:conversationId/messages` — existing `MessageService.syncLatest` history/cursor flow for a canonical foreground-push fallback once a decoder is available.
- Existing pending-delivery recovery through `SocketReceiver.syncPendingDelivery` on foreground/reconnect. History is not replaced by push.

The inspected backend has **no** `GET /messages/conversations/:id` route. No such route is called. No Activity endpoint, Activity state, protected media path or upload/message/receipt semantics were redesigned.

## 4. Push-token integration: implemented lifecycle and explicit blocker

Installed versions: `expo-notifications` **56.0.26**, `expo-device` **56.0.4**, using Expo SDK 56's compatibility ranges; Expo remains **56.0.11**, React Native **0.85.3**. `expo-constants` resolves compatibly to 56.0.27 along with the lockfile's compatible Expo utility updates.

The native client supports:

- Quiet permission status checks after authentication; an OS permission prompt only from the explicit Settings action.
- Channel creation before Android 13 permission acquisition; physical-device/EAS/Expo-Go capability reporting.
- Expo token acquisition with existing EAS project ID, and reacquisition after native FCM/APNs token changes. A raw native FCM token is not passed as an Expo push token.
- Single-flight work, transient-error retry on foreground/reconnect/user action, serialized native cleanup/token acquisition/registration, permission revocation, account switches and stale-response protection.
- Immediate presentation/token-refresh suspension on logout, native unregister and removal of presented notification/last-response state. The I/O deadline preserves the existing offline logout path; provider delivery/privacy guarantees still require the real server and device checks.
- `ready` is possible only after a supplied real registration adapter succeeds. Getting an Expo token by itself is **not** treated as backend registration.

**Not implemented against a real server yet:** the register/revoke HTTP calls, authoritative global/conversation server preferences, actual remote push payload decoder, and backend Expo/FCM sender. The runtime uses no guessed endpoints; native data without an installed verified decoder is ignored for navigation. Settings explicitly reports `backend-required` when token acquisition succeeds without that adapter.

The local mute menu currently says **“Mute/Unmute in-app banners.”** It must not be mistaken for background-system-push mute synchronization. The real backend contract is needed to finish that behavior.

## 5. Expo and Android configuration

- `expo-notifications` plugin with default channel `messages-v1`, existing primary tint and a monochrome small icon.
- Adds `android.permission.POST_NOTIFICATIONS`, retaining existing recording/media permissions.
- Retains package `com.elijah77.social`, scheme `yoursocialapp`, and EAS project `fa49de58-e64b-450a-9401-1f29da85af02`.
- Native dependencies require **new EAS development/production binaries**. Runtime version changes from `1.0.0` to **`1.1.0`**, so incompatible native-module JavaScript is not shipped as an OTA update to old production binaries. Conditional loading keeps foreground chat/banner use separate from unsupported native push where possible.
- `GOOGLE_SERVICES_JSON` is consumed as an **EAS file environment variable** for the Firebase Android client configuration. A production Android EAS profile rejects a missing file path. This check does not prove that the Firebase project/package/FCM credentials match.
- Configure matching **FCM V1 credentials in EAS** for development and production. Service-account keys belong in credential management, never `EXPO_PUBLIC_*`, source control or chat. The existing production public-HTTPS API-origin requirement remains.

Channel:

| Setting | Value |
| --- | --- |
| ID | `messages-v1` — backend pushes must target this exact channel |
| Name | Messages |
| Importance | HIGH |
| Sound | default |
| Vibration | `[0, 180, 100, 180]` |
| Lockscreen visibility | PRIVATE |
| Accent | `#6C5CE7` |

Foreground native banner/list/sound/badge display is suppressed in favor of in-app presentation. The client never schedules a socket-driven local notification to simulate background/terminated delivery. Real background delivery requires a server-sent native notification message; it does not assume a JS task or a live socket.

## 6. Navigation and cold-start handling

Audit finding: the application has **one** `/(chatRoom)/privateRoom` route for private and group conversations, with `isGroup`; there is no separate ChatRoom screen to invent.

- A banner tap freshly checks the active-membership list, then uses the existing route and `conversationId`, `roomId`, real receiver/group name/avatar/username and `isGroup` parameters.
- If already viewing that exact conversation, no duplicate screen or fetch is needed. A navigation change while membership is resolving is rechecked before pushing.
- Missing/deleted/removed-membership targets show the shared unavailable dialog. A network failure retains the destination for deliberate retry, not a timeout or retry loop.
- The native bridge registers the response listener before reading the last native response, deduplicates those paths and clears only a consumed matching response. Domain destinations wait for authenticated account, root navigation, a non-auth/non-index route and active AppState; no arbitrary startup delay is used.
- Another account's target cannot cause navigation or a metadata fetch. Arbitrary pushed URLs are never opened.

**Important:** that native lifecycle is implemented/tested at the domain/SDK boundary, but actual push taps are **not wired to a real payload** until the backend publishes the schema and the decoder is installed. Do not report native warm/cold-start push navigation as completed or device-verified at this checkpoint.

## 7. Validation and performance evidence

| Check | Result |
| --- | --- |
| Before-feature suite | 453/453 passed |
| Focused new suite | **86/86 passed**, 4,902.961107 ms |
| Full regression suite | **539/539 passed**, 65,933.761011 ms; 0 failures/cancelled/skipped |
| TypeScript | passed |
| Scoped ESLint | **26 files, 0 errors, 0 warnings** |
| Android/iOS production-mode Expo/Hermes JS exports | both passed |

Tests use actual SQLite/store/socket/coordinator code where applicable and mounted React/native/HTTP/transport doubles. They are not live backend, FCM, native layout/gesture, EAS binary or physical-device tests.

Controlled exports compare baseline source `a2fd187` with this checkpoint using the **same currently installed compatible dependencies**, `CI=1 EXPO_OFFLINE=1 NODE_ENV=production EXPO_PUBLIC_API_URL=https://api.test`, two Metro workers. That test URL is only an export fixture, not a production API.

| Platform | Baseline Hermes bytes | Checkpoint bytes | Change | Assets |
| --- | ---: | ---: | ---: | --- |
| Android | 6,628,958 | 6,784,454 | +155,496 (**+2.345708%**) | 46 byte-identical |
| iOS | 6,444,820 | 6,599,617 | +154,797 (**+2.401882%**) | 43 byte-identical |

Only the two requested/necessary SDK-compatible native libraries were added; no Expo/React Native upgrade. The tiny native notification icon is separate from the Metro asset comparison. These are **JavaScript bytecode** measurements, not APK/AAB size or startup/FPS proof. The approximately 128 MB APK and <1-second startup targets remain unmeasured native release gates.

### Requested two-device Android matrix

**Every physical-device row below remains unperformed.** Automated coverage is not a substitute.

| Scenario | Automated coverage / remaining gate |
| --- | --- |
| 1. Private message on Home | display-rule test; physical pending |
| 2. Private message on Profile | display-rule test; physical pending |
| 3. Message while in another chat | display/navigation tests; physical pending |
| 4. Message in exact active chat | suppression and route-race tests; physical pending |
| 5. Group on another screen | actual socket/SQLite + real group-metadata fixture; physical pending |
| 6. Image/video/voice | actual enum preview tests; physical media delivery pending |
| 7. Rapid messages | 1,000-message aggregation/count test; physical stress pending |
| 8. Swipe/dismiss/tap | mounted UI, installed RNGH builder callbacks and timer tests; native recognition pending |
| 9. Background system delivery | **blocked: backend sender/registration + FCM credentials/device** |
| 10. Terminated system delivery | **blocked: same prerequisites; not socket based** |
| 11. Push tap navigation | domain/SDK-boundary tests; actual payload/native warm/cold tests pending |
| 12. Reconnect duplicates | real SocketReceiver/SQLite with mocked native transport; two-device replay pending |
| 13. EAS production build | **not built or installed here** |

Android Settings “Force stop” is not equivalent to normal process termination; Android/OEM policy may block pushes until the app is opened. Do not promise force-stop delivery.

## 8. Required next work / release limitations

1. Backend session publishes the source SHA and **real** token register/revoke, global/conversation preference and push `data` contracts. Current recheck still finds backend head `902e191` and older main `eb79c440ae38f0f120b8301c59ff64904b67c7bc`.
2. Finish the frontend HTTP adapter/strict payload decoder and server preference integration against that source; then rerun regression, export and negative account/permission tests. Until then, real push registration/delivery/tap handling remains **incomplete**, not merely “untested.”
3. Backend implements/deploys durable sender, token ownership/revocation, mute/preference checks, active membership, provider ticket/receipt cleanup and retry semantics. No backend code, migrations, merge, deployment or live DB mutations were made here.
4. Configure EAS Firebase client file and matching FCM V1 credentials, build fresh development/production native binaries with the real public HTTPS API origin, and run the full two-account/two-device matrix above.
5. Measure release APK/AAB size, cold/warm startup, FPS/memory, OEM background/doze behavior and logout/rotation/reinstall privacy before claiming production readiness.
