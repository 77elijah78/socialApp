# Chat media upgrade — implementation report

Status: feature-complete for the JS/client scope, with the native verification
items listed at the end still outstanding on physical devices.

Verification at the time of writing:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm test` | **698 tests, 698 pass, 0 fail** |
| `npm run lint` | 0 new errors; the 7 pre-existing `react-hooks/refs` errors in `src/hooks/useVoiceRecorder.ts` are untouched |
| `npx expo config --type public` | resolves `circle`, runtime `1.2.0`, all plugins |
| `npx expo prebuild --platform android --no-install` (scratch copy) | succeeds; manifest and `MainApplication` patches are present |

---

## 1. One download lifecycle for photos, video, voice/audio and documents

### What changed

`DocumentDownloads` is now the single download engine for every chat attachment,
not just documents. `src/services/ChatMediaDownloads.ts` is the adapter that
turns a message/attachment into a `DocumentSpec` and exposes it to React through
`useChatMediaDownload(spec)`.

The engine already provided the hard parts, so photos and media inherit them
instead of growing a second cache:

- explicit state machine: `idle → queued → downloading → ready | error`;
- bounded concurrency (two transfers) and single-flight per file;
- progress in bytes with an optional total;
- authenticated downloads through `mediaRequestSource`, never a token-bearing
  URL in the UI or logs;
- one credential refresh after a 401/403, or after an opaque Expo “Source
  error” when the JWT is known to be expired;
- downloaded files in app-private `documentDirectory/chat-downloads/<owner>/`;
  existence is re-checked on mount, so state survives virtualization and JS
  restarts without a second metadata store;
- partial files are deleted on failure and a completion size check prevents an
  interrupted transfer from being shown as ready.

`useChatMediaDownload` adds the local-source shortcut (a message you just sent
uses its own `file://` URI directly) and a per-category automatic size cap.

### Behaviour by attachment type

| Type | Before download | Downloading | Ready |
| --- | --- | --- | --- |
| Photo (`ImageMessage`) | thumbnail preview or placeholder + **Download photo** | spinner, percent label | local file shown in the frame; tap opens the local file in the image viewer |
| Video (`Videoplayer`) | poster frame + **Download video** | progress rail | **Play video** opens the full-screen player from the local file |
| Voice / audio (`VoiceMessage`) | waveform/rail + **Download voice message** | progress bar | playback is delegated to the app audio session; **Play/Pause** and seek |
| Document (`DocumentMessage`) | existing card + download control | existing byte progress | existing open/share flow |

Failure is a first-class state, not a silent retry loop: the control becomes a
refresh icon with “Download failed · Retry” / “Retry voice message download”,
and the error text is surfaced. Manual downloads always bypass auto-download
settings and byte caps. The automatic transfer cap is enforced both from message
metadata and during transfer (`DocumentSpec.maxBytes`), so a missing size field
cannot silently pull an oversized file.

Accessibility labels were kept stable and explicit (`Download photo`,
`Download voice message`, `Download video`, `Play video`, etc.) so the same
actions remain discoverable by assistive tech and by tests.

**Files:** `src/services/DocumentDownloads.ts`,
`src/services/ChatMediaDownloads.ts`, `src/components/messages/ImageMessage.tsx`,
`src/components/messages/Videoplayer.tsx`,
`src/components/messages/VoiceMessage.tsx`,
`src/components/messages/DocumentMessage.tsx` (unchanged reference contract).

---

## 2. Auto Download settings with real connectivity awareness

### Settings model

`src/services/AutoDownloadSettings.ts` is a framework-free external store backed
by AsyncStorage under `circle.autoDownload.v1`, consumed by
`useAutoDownloadSettings` and rendered in `AutoDownloadSettingsPanel` inside the
Settings screen.

Defaults are deliberately conservative and independently toggleable:

- networks: Wi-Fi **on**, mobile data **on**, roaming **off**;
- media: photos **on**, voice **on**, video/music/documents **off**;
- size caps: photos 10 MB, video 100 MB, voice 5 MB, music 20 MB, documents
  25 MB.

Changes are applied immediately, persisted synchronously in memory and written
to storage without blocking the UI. “Reset to defaults” restores the table above.
The panel also shows the live connection type and explains that manual downloads
are always available.

### Connectivity

`src/services/NetworkConditions.ts` is a new app-wide network store used only by
auto-download/settings. The pre-existing polled `useNetworkStatus` remains the
app-wide status hook and was not re-pointed at the new store.

On Android, a small local native module (`plugins/native/NetworkConditionsPackage.kt`,
installed by `plugins/withNetworkConditions.cjs`) reports the active transport
**and roaming**, which `expo-network` cannot provide. It uses
`ConnectivityManager.registerDefaultNetworkCallback` and
`NET_CAPABILITY_NOT_ROAMING`; it never asks for phone-state permissions. On iOS,
Expo Go, web, or any build without the native module, the store falls back to
`expo-network` and roaming is reported as unavailable (mobile is used instead).

Classification:

- `WIFI` / `ETHERNET` → `wifi`;
- `CELLULAR` + roaming → `roaming`, otherwise `mobile`;
- `NONE` / disconnected / **unknown** → `offline` (blocks automatic work);
- `VPN` / other transports → `other` (follows the Wi-Fi toggle).

Roaming is independent of the mobile toggle: enabling roaming permits downloads
on a roaming cell network even if ordinary mobile data auto-download is off.

### Receive path

`src/services/AutoDownloadRunner.ts` receives message upserts from
`ChatAutoDownloadHost` (mounted at the root) and also considers the rows already
loaded by `privateRoom`, covering SQLite history restored before the live socket
subscription exists. It:

1. ignores own, deleted and still-sending rows;
2. classifies the row into `photos | videos | voice | music | documents`;
3. asks `shouldAutoDownload` (network + media toggle + metadata size);
4. starts the normal `DocumentDownloads` transfer with a per-category
   `maxBytes` cap;
5. remembers attempts and clears that memory only when the network/settings
   signature changes, so a failed attempt is not retried in a loop but a new
   connection or setting can retry it.

Music and voice are distinguished by whether the audio attachment has a
filename: a recorded voice note does not, a picked/shared audio file does.

**Files:** `src/services/AutoDownloadSettings.ts`,
`src/services/AutoDownloadRunner.ts`, `src/services/NetworkConditions.ts`,
`src/hooks/useAutoDownloadSettings.ts`, `src/hooks/useNetworkConditions.ts`,
`src/components/settings/AutoDownloadSettingsPanel.tsx`,
`src/components/chat/ChatAutoDownloadHost.tsx`,
`plugins/withNetworkConditions.cjs`,
`plugins/native/NetworkConditionsPackage.kt`, `src/app/settings.tsx`,
`src/app/(chatRoom)/privateRoom.tsx`.

---

## 3. Persistent app-level audio session and mini player

Component-owned playback is gone. `src/services/ChatAudioPlayer.ts` owns one
native player for the whole app; `useChatAudio(key)` exposes a per-row snapshot
without re-rendering every bubble on each progress tick.

Contract:

- identity is `playbackId || uri`; tapping the same row toggles it, tapping a
  different row releases the previous player and replaces it;
- audio mode is configured once: media playback, silent-switch playback,
  `doNotMix`, `shouldPlayInBackground: true`, earpiece routing off;
- the lock screen is activated for the active track and released with the
  player;
- `didJustFinish` releases native resources but keeps the final position and
  `ended` snapshot, so the bubble can start a fresh playback;
- `close()` releases and hides the session; `reset()` on logout also resets the
  audio mode and notifies both global and per-row subscribers;
- a failed start/current player surfaces an error and the bubble shows
  **Retry voice message**.

`ChatAudioMiniPlayer` is mounted once at the root. It appears outside the chat
room, floats above the custom tab bar on tab screens, shows title/progress,
toggles play/pause, and closes the session. Inside a room the bubble itself is
the transport. Audio keeps playing while navigating, while the list virtualizes,
and while the app is backgrounded (subject to Expo’s native foreground service /
background-audio support configured below).

`app.json` now enables the `expo-audio` config plugin with
`enableBackgroundPlayback: true`; the generated Android manifest includes
`FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.

**Files:** `src/services/ChatAudioPlayer.ts`, `src/hooks/useChatAudio.ts`,
`src/components/chat/ChatAudioMiniPlayer.tsx`,
`src/components/messages/VoiceMessage.tsx`, `src/app/_layout.tsx`, `app.json`.

---

## 4. Receiving files shared from other apps (Android)

### Native intake

`app.json` registers `expo-share-intent` (v7, Android only) with both single and
multiple filters for `text/plain` (single), `image/*`, `video/*`, `audio/*` and
`application/*`. A scratch `expo prebuild` confirms the generated
`MainActivity` contains both `ACTION_SEND` and `ACTION_SEND_MULTIPLE` intent
filters while keeping the existing `yoursocialapp` scheme and package.

### JS intake

- `src/components/chat/ShareIntentHost.tsx` is mounted under
  `ShareIntentProvider`; once authenticated it turns incoming files into a
  draft, navigates to `/share`, and **immediately stages each grant** into
  `cache/shared-intent/` before the temporary content URI can expire.
- `src/services/ShareIntentInbox.ts` holds the draft, preserves order,
  filenames, MIME type, size, dimensions and duration, and supports removal.
- `src/services/SharedMedia.ts` sanitizes names, preserves extensions, copies
  content/file URIs into app cache, and exposes `discardStagedFile` so only the
  app’s cache copy is deleted after upload (never the provider’s original).
- `src/app/share.tsx` is the recipient picker: preview strip, searchable room
  list, per-file upload progress, and a send action. It reuses
  `mediaFileForUpload` validation and then the existing
  `mediaService.message.sendMediaRecord` upload path — no separate protocol.
- Partial failures are reported per file and successful files are removed from
  the draft, so retry cannot upload the same attachment twice. Full success
  clears the draft and replaces the modal with the target conversation.

**Files:** `app.json`, `src/app/_layout.tsx`, `src/app/share.tsx`,
`src/components/chat/ShareIntentHost.tsx`,
`src/services/ShareIntentInbox.ts`, `src/services/SharedMedia.ts`.

---

## 5. Light, centralized bottom-sheet styling

`src/constants/sheets.ts` is the single framework-free token source:

- backdrop: `transparent`, opacity 0, `pressBehavior: "close"` (the full-screen
  press target still dismisses);
- surface: app white, large symmetric top radii, no `shadow*` / `elevation`;
- handle: 38 × 4, `#D9D7E3`, centered.

Consumers updated: `CommentBottomSheet` (the styling reference), the chat
`MediaPickerModal`, `ActionMenu`’s sheet mode, `ShareModal`, and
`ForwardMessagePicker`. The dark scrims and heavy sheet shadows were removed;
the anchored `ActionMenu` popover and unrelated dialogs keep their own
treatment. No sheet engine was changed — only appearance and a shared token
import. `CommentBottomSheet` keeps its light footer divider shadow because it is
an in-sheet separator, not a screen backdrop.

---

## 6. Tests

New suites:

- `test/messaging/auto-download.test.cjs` — defaults, network classification
  (Wi-Fi/ethernet/mobile/roaming/VPN/unknown/offline), roaming independence,
  per-category limits, voice-vs-music classification, persistence, receive
  runner single-flight/skips, and auto-limit stop → manual retry.
- `test/messaging/share-intent.test.cjs` — single/multiple intake, empty and
  pathless rejection, filename sanitizing/extension, cache staging,
  `stagePending`/reuse, missing-grant failure, and cache-only cleanup.
- `test/messaging/audio-session.test.cjs` — audio-mode configuration, same-key
  toggle vs replace/release, progress/seek snapshots, stable inactive identity,
  completion release + replay, `close()`/`reset()`.
- `test/messaging/sheets.test.cjs` — token values, every consumer imports them,
  and no dark scrim regex remains in those sheets.
- `test/messaging/share-config.test.cjs` — share filters, background-audio
  permissions, native network plugin/prebuild contract (including the SDK 56
  `"kt"` language value), and runtime version.

Updated suites cover the download-gated photo/video/voice/bubble flows and the
authenticated-media retry path. `test/messaging/harness.cjs` now exposes
`cacheDirectory` for staging tests.

Commands run:

```bash
npx tsc --noEmit          # clean
npm test                  # 698/698
npm run lint              # 0 new errors; 7 pre-existing useVoiceRecorder refs errors
npx expo config --type public --json
npx expo prebuild --platform android --no-install   # scratch copy; succeeds
```

---

## Known limitations and device verification still required

1. **No background download service.** Auto Download runs while the JS app is
   open (including backgrounded JS while the OS keeps it alive). It does not add
   a native WorkManager/background-fetch queue; queued transfers resume when the
   app returns.
2. **iOS roaming is not observable** through `expo-network`; the roaming toggle
   only changes behaviour on the Android native module. VPN/other transports
   follow the Wi-Fi toggle because the underlying transport is not exposed.
3. **Share intake is Android-only** (`disableIOS: true`), matching the request.
   The recipient picker only sends file types the existing uploader accepts;
   unsupported MIME types fail with the uploader’s validation message.
4. **Native builds were not compiled here.** Prebuild was validated in a scratch
   copy, but these must be checked on a real Android build/device:
   - Gradle compile of `NetworkConditionsPackage.kt` and package registration;
   - `ACTION_SEND` from a gallery/file manager, both single and multiple;
   - content-URI staging under a slow/large share;
   - roaming and Wi-Fi↔cellular transitions while messages arrive;
   - background/lock-screen audio, interruption by a call, and notification
     controls on Android 13+;
   - authenticated download refresh and file playback after process death.
5. **Audio interruption UX** relies on Expo’s native audio-focus handling; there
   is no custom “resume after call” prompt. Playback state reflects the native
   status, and the row/mini player can retry.
6. Downloads remain app-private (not exported to the gallery). Sharing a
   downloaded file uses the existing document share flow; chat media does not
   add a separate “save to Downloads” action.
