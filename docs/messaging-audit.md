# Messaging audit and implementation

**Date:** 2026-10-29 · **Baseline:** `c0b7d994b274a9aa7bf06274edae3ddd9c402a1b` · **Branch:** `arena/e4dfc24a-socialapp`

## Status and scope

The messaging flow has been audited across its real entry points, auth/providers, screen, hooks, services, socket receiver, query layer, database, caches and active media renderers, and fixes are implemented in the existing architecture. **This is not device/release sign-off or a claim of Telegram-equivalent performance.** Local evidence consists of 65 passing automated tests, a reproducible Node/React benchmark and successful Android/iOS production JavaScript exports. Native keyboard/scroll anchoring, real backend interoperability, OS process restart and release-device performance remain unverified.

Preserved: Expo SDK 56 (lock resolves 56.0.11), React 19.2.3, React Native 0.85.3, Expo Router, the existing FlatList, SQLite `app.db`, Drizzle query builders, existing REST/socket/auth contracts, permissions and message types. No FlashList, chat backend replacement, Redux message store, new runtime storage dependency or SDK upgrade was introduced. The only added dependency is **dev-only, exact `react-test-renderer@19.2.3`**. Unused direct React Navigation packages were removed after Expo Doctor identified their incompatibility with SDK 56's router-owned navigation dependencies; no source imports used them.

Actual message persistence is Expo SQLite, not AsyncStorage. AsyncStorage holds auth/Redux/generic cache data and the new cache-owner identifier. `recentMessageCache` is only a bounded RAM prefetch (20 rooms × 30 messages). Media bytes are not a managed, durable offline attachment store.

There is no group-chat-specific screen in this repository. Group summaries can reach `useRooms`, but use the existing private-room route. No group permissions or participant UI were invented. Reactions have no verified existing endpoint/event implementation; they were not added. `ImageMessage`, `MessageBubble`, `ChatInput` and `useVoiceRecorder` are not the active private-room rendering/composer path; unrelated existing errors there were not disguised as messaging validation successes.

## 1. Dependency map and ownership

### Before

```text
Messages tab / user profile -> SQLite/RAM prefetch -> Router privateRoom
privateRoom -> useChat -> MediaService.message -> MessageService -> REST
SocketProvider -> MediaService.socket / SocketReceiver -> Socket.IO
REST + socket writers -> MessageStore -> query classes -> Drizzle Expo driver -> app.db
useChat -> reload latest 30 / parallel socket state updates
        -> screen-wide date/reply transformation -> FlatList -> MessageCard
useRooms -> competing REST / SQLite / notification loads -> inbox
```

### Implemented flow

```text
Root PersistGate
  -> runMigrations -> prepareMessagingAccount -> recover interrupted SENDING
  -> API token initialization -> allow authenticated children/socket to mount

Messages tab / user profile
  -> coalesced syncLatest in background
  -> bounded recent-message prefetch / indexed SQLite latest page
  -> Router -> account + conversation keyed Conversation

Conversation -> useChat (room-scoped lifecycle, loaded chronological rows)
  -> MessageStore subscription (committed canonical rows, not raw socket payloads)
  -> timeline merge (stable identity/order, monotonic receipts, tombstones)
  -> cached list-item builder (reply dependencies + date/unread/message models)
  -> inverted FlatList (native MVCP history anchor)
  -> memoized ChatMessageRow -> MessageCard -> image / video / voice / shared cards

ChatComposer (independent input state)
  -> useChat -> MediaService.message -> MessageService
  -> SQLite optimistic insert FIRST -> HTTP/upload -> confirm or FAILED on same row
  -> MessageStore publication -> same hook/list path as incoming updates

SocketProvider -> one SocketReceiver + room reference counts
  -> normalize -> canonical persisted receive / mutation -> MessageStore publication
  -> durable receipt queue -> existing read event / delivered REST acknowledgement
  -> pending-delivery drain + reconnect/focus catch-up

MessageStore / query classes
  -> installed Drizzle sqlite-proxy query adapter
  -> serialized async Expo SQLite prepared statements / explicit transactions
  -> existing app.db, WAL, indexed local tuple pages

useRooms
  -> SQLite summaries first -> guarded background REST summaries
  -> committed message changes refresh affected preview only
  -> server whole-conversation unread baseline + atomic local receive/read/delete deltas
```

Redux remains the authentication/other application store, not a second source of message-body truth. `RoomStore.ts` and `deleteQueries.ts` retain their existing query-facade roles. Global socket connection ownership stays in the root provider; screens own their subscriptions, read/typing timers and room references.

### Existing contracts retained

| Purpose | Existing contract used |
| --- | --- |
| History | `GET /messages/conversations/:id/messages`, `limit`, `cursorId`; `before` only when no confirmed server ID is available |
| Text/media/shared send | `POST /messages/conversations/:id/messages`, existing `content`, `receiverId`, `type`, optional `mediaUrl` |
| Text reply | `POST /messages/conversations/:id/reply`, existing `repliedToId` payload |
| Edit/delete | `POST /messages/:id/edit`; `DELETE /messages/:id?deleteFor=me\|everyone` |
| Conversation read/delete | Existing `/messages/conversations/:id/read` and delete routes retained |
| Delivery | `POST /messages/delivered` with `messageIds`; `GET /messages/pending/delivery?limit=200` |
| Media upload | Existing `/media/upload`, FormData `file`; MIME selected from the actual URI extension/type |
| Socket | Existing personal/conversation joins, `message:new`, notification, read/delivered, edited/deleted, typing, presence and conversation-deleted events |
| Shared stories | Existing `GET /posts/stories`; select the requested loaded `storyId`, or show unavailable instead of opening an unrelated story |

Only the frontend is present. No client nonce/idempotency key, new backend pagination envelope, tombstone/change feed, reactions API or single-story endpoint was invented.

## 2. Root causes identified before implementation

### Composer overlap and unstable room opening

`privateRoom.tsx` positioned its composer absolutely outside the list's keyboard-avoiding layout, then independently animated composer translation and keyboard/list padding, including a clamped keyboard-height interpolation. It hid initial content while nested animation-frame scroll corrections attempted to reach the end. Actual composer/viewport readiness was not the basis for positioning.

**Correction:** one enabled keyboard-controller `KeyboardAvoidingView` with padding/`automaticOffset` wraps both the flex list and the in-flow composer. FlatList's measured `onLayout` and `onContentSizeChange` drive latest-position intent. Inversion makes newest offset exactly zero; there is no estimated initial end-scroll, hidden first paint, arbitrary delay, manual composer translation or frame retry chain.

Important Android finding: the installed keyboard-controller's `EdgeToEdgeReactViewGroup.setupWindowInsets` suppresses native IME resizing while its KeyboardProvider is active. Consequently, relying only on `softwareKeyboardLayoutMode: resize` with a disabled Android KAV would be incorrect. The final screen uses the same **single enabled controller KAV on both platforms**. This was checked against installed native source and structure-tested, **not exercised with a physical keyboard/device**.

### Pagination jumps and history loss

`useChat.ts` reloaded the newest 30 after sends/mutations, discarding older loaded rows. Initial sync and pagination shared loading state. Timestamp-only local cursors omitted tied rows. Screen date/reply models and callbacks were recreated broadly. Loading indicators participated in list geometry, and unconditional corrective scrolling could pull a history reader to latest.

**Correction:** indexed `(timestamp, local_id)` local pages, a synchronous single-flight page lock, deterministic ordering and ID deduplication, committed incremental updates, retryable errors, pagination feedback outside list content, and one native `maintainVisibleContentPosition` history-anchoring strategy. A history reader is never manually offset-compensated. Latest corrections apply only after real measurements while latest intent is active and no drag/momentum interaction is in progress. An explicit send/jump requests latest; background events/focus do not.

### Slow row work and idle media work

The screen rebuilt date/reply/list-item objects for every metadata update; mounted message cards received unstable callbacks. Reply lookup and formatting work repeated across the conversation. Video timers polled even while idle; voice equalizer updates drove JS layout. Image geometry could change after decode.

**Correction:** independent composer state; memoized representative rows with stable callbacks; cached reply/date/unread/message models; reference-scan metadata fast path and indexed reply dependents; reserved media geometry/caching; lazy source loading; native waveform transforms; focused viewability/AppState pause and async-play guards. No fixed-height `getItemLayout`, blanket application memoization or replacement list library was introduced.

### Storage/sync inconsistencies

Sync could assign the server ID as a new local ID after an optimistic send. Own socket echoes could arrive before the POST response established identity. Receipts could downgrade READ; failed retries could recreate rows/lose payload; edits/deletes could be overwritten by late history. Drizzle's installed Expo driver performed synchronous SQLite work despite awaited calls. Receipt replay and interrupted-gap tracking were not durable. Old room/account work and duplicate notification handling were insufficiently isolated.

**Correction:** async serialized database adapter, canonical immutable local keys, monotonic status merge, guarded content freshness, persistent tombstones, same-row retry, committed subscriptions, startup interrupted-send recovery, durable receipt/checkpoint metadata and account/room generations. Source inspection also exposed an inbox edge case during implementation: counting unread rows in a **partial message cache is not the server's whole-conversation unread count**. The final implementation retains authoritative room counts and applies atomic local deltas instead of replacing 100 unread with the one cached row.

## 3. Implemented invariants and tradeoffs

### Layout and scrolling

- Account/conversation keys reset composer/layout state when Router reuses a screen.
- Composer participates in layout; safe-area padding is separate from keyboard ownership, not a blind list inset.
- `LatestViewport` waits for nonzero content and viewport measurements and deduplicates identical corrections.
- FlatList is inverted with stable `message:<localId>`, `date:<local-day>` and frozen initial unread-boundary keys.
- Native MVCP alone anchors pagination/history. Latest offset-zero corrections are gated by explicit/latest reading intent, not applied as a competing history compensation.
- Keyboard/viewport/content changes while history-reading do not request latest. Native visual pixel preservation is still a device acceptance check.
- Variable rows retain measured layout; unread-index fallback is bounded and retries on real viewability progress, not on timeout/RAF chains.
- Cached pages remain available while latest network catch-up is pending. Initial background sync and older-page loading have separate state/errors.

### Persistence, identity and retry

- `app.db` remains the storage source. Each native prepared statement is finalized in `finally`; database operations and explicit transactions share one serialization queue so unrelated writes cannot enter a transaction accidentally.
- Optimistic insertion commits before HTTP. Confirmation preserves the local row key and first local timestamp; no fuzzy text/time matching or invented nonce is used.
- Own echoes/early mutation receipts wait for outgoing REST identity mapping. Session reset releases old barriers without allowing an old completion to release a new account/session's barrier.
- Failed sends remain `FAILED`; retry reuses row, reply/shared/media payload and retry count. Concurrent retries coalesce. The composer can submit another draft while an earlier acknowledgement is pending; synchronous draft clearing prevents duplicate taps.
- Startup recovers interrupted `SENDING` rows to `FAILED`, **not automatic resend**. Deleting a still-sending message is rejected rather than silently losing confirmation tracking.
- Monotonic READ/DELIVERED merge, protected edited content and local tombstones prevent stale saved pages from undoing committed mutations. Duplicate entries inside one batch merge rather than last-write downgrade.
- Incoming read/delete transitions and read-outbox insertion update the durable global room unread delta transactionally. Duplicate events do not apply that delta twice. Inbox previews can move back to the previous message or empty after deleting the last cached message.

### Reconnect and account isolation

- Latest catch-up walks from head to a persisted cached **ID boundary**, not timestamp equality; equal-timestamp pages and local optimistic clock differences are tested.
- Server page cursors are kept separately from immutable optimistic display ordering. Interrupted sync records its boundary before saving the new head; safe retry resumes the gap. An invalid/removed saved cursor falls back to a fresh head walk rather than silently declaring the sparse cache complete.
- Pending deliveries drain acknowledged batches beyond 200, with a non-advancing-batch guard and no arbitrary 4,000-message cutoff.
- READ receipts remain queued until an own-user server echo; emitting on a socket is not an acknowledgement. DELIVERED receipts clear only after successful REST acknowledgement. Follow-up work queued during a flush triggers another pass.
- API GET flights are actually registered/coalesced and scoped by auth generation/token/options; abortable callers do not share cancellation. Auth refresh is coalesced and generation-guarded so a late refresh/401 cannot restore an old account after logout. HTTP retry attempts/uploads/refresh have bounded network waits.
- Account preparation clears message rows, rooms, RAM prefetch, receipt outbox and sync checkpoints on logout/account change. Tokens are cleared before asynchronous logout cleanup. Old account/room network completions and post-delete notification follow-up work are guarded.
- Hook subscriptions/read/typing timers clean up on room changes/unmount. Room references support overlapping mounted screens and token reconnect without rejoining a previous account's rooms. Background-room deletion does not navigate the active screen away.

### Rendering, media and memory

- Metadata updates scan row references and patch only changed models/reply dependents. New pages rebuild indexes but reuse unaffected models. Content edits invalidate dependent reply previews; receipt-only changes do not.
- Input edits do not update the message-list parent state. The benchmark measures representative row rendering separately from the native card/media implementation.
- Images reserve width/height before decoding, use Expo Image memory/disk cache and recycling keys, and avoid transition-driven geometry changes. This is stable letterboxed geometry, not a claim of server-provided aspect ratios.
- Audio/video sources load on play, not for every mounted row. Expo owns native disposal. Visibility/background changes pause playback; async completion cannot start playback after blur/unmount. Video load failures are caught with retry feedback; waveform transforms use the native driver. Orientation restoration is guarded.
- RAM prefetch is capped at 20 × 30. At latest, loaded histories over 300 rows reclaim to 90; evicted list-item/reply indexes are discarded and SQLite bodies remain available offline.
- **Memory limitation:** history is intentionally not evicted beneath a reader. Long uninterrupted pagination sessions and navigation stacks retaining inactive screens can still grow RAM; there is no proven hard two-sided history-window bound or measured native heap reduction. This remains part of release profiling/follow-up, not an advertised completed memory guarantee.

## 4. Local schema / migration and setup

### What changes locally

No database engine, database filename, message payload or backend schema changes. The reason for additive local metadata is demonstrated: durable read/delivery replay cannot live only in RAM, and latest-page persistence alone cannot distinguish a completed cache from an interrupted offline gap.

`runMigrations()` now:

1. Uses `PRAGMA table_info` for existing optional columns instead of swallowing every ALTER error. Existing message/room column repairs are retained.
2. Creates local-only `message_receipt_outbox` (`key`, message/conversation ID, kind) and `message_sync_state` (conversation, target and before-ID/timestamp checkpoint).
3. In a serialized transaction repairs historical duplicate server IDs, preserving the original optimistic local key/order when present, strongest receipt/read flag, latest edited content and tombstones; then enforces server-ID uniqueness.
4. Adds `(conversation_id, timestamp, local_id)` ordering and a unique room-conversation index. Duplicate room summary rows collapse to the last stored row; no distinct message server IDs are deleted by the repair.
5. Commits `PRAGMA user_version = 1` after repair/index installation. Calls are coalesced and repeatable. Initialization errors stop the startup gate with an explicit error instead of rendering against a partially initialized cache.

Startup then establishes the account owner and marks interrupted sends failed. This is not a destructive database replacement, but duplicate-row repair is a real data migration: **back up an existing `app.db` (and any live WAL sidecars consistently) before production rollout and test an upgrade copy first.** Never delete the database as a normal fix. Downgrading/reinstalling an old client is not a validated rollback; restore a backup only through your normal supported app-data procedure, or ship a forward fix. `user_version` is now owned by this migration and future schema additions need the next version.

Legacy caches without `messaging-cache-owner` are adopted for the already persisted authenticated account to preserve offline access. Historical ownership cannot be proven for a previously unowned/shared legacy cache. Subsequent account changes are explicitly isolated; logical row deletion is not an encrypted database/forensic secure erase.

### Reproduce

Use Node **22.13+** (tested 22.22.3; Node SQLite is experimental) and the checked-in lockfile:

```sh
npm ci --no-audit --no-fund
npm test
npm run typecheck
npm run lint
npm run benchmark:messaging
# Save a new local benchmark result if desired:
node scripts/benchmark-messaging.cjs --output=docs/messaging-benchmark.json
EXPO_OFFLINE=1 npx expo export --platform android --platform ios --max-workers 2 --output-dir dist
EXPO_OFFLINE=1 npx --yes expo-doctor --verbose
```

The benchmark uses `git show` of the baseline commit, so retain that commit in the clone. React test renderer's deprecation warning and Node SQLite's experimental warning are expected; they are not suppressed as successful native tests. Exports are ignored in Git.

For device/backend validation, set `EXPO_PUBLIC_API_URL` to the **reachable backend origin without `/api/v1`**; existing service clients append that prefix and Socket.IO uses the origin. The default is the repository's private-LAN backend and was not usable as a verified test backend here. Use your normal test accounts and existing auth flow; no credentials are embedded in the tests. Do not execute the ignored live-mutating `test/socket-test-bob.js` against an unknown backend.

Use a development/release native build matching the installed native dependencies, not an assumed Expo Go keyboard-controller binary. On a configured Android workstation use the existing `npm run android` / release variant tooling; on macOS use the existing iOS/Xcode tooling. Build a **true release** variant for profiling, not merely a dev client with minified JS. This Linux workspace has no `adb`, Android emulator or Xcode/device available. Native builds were not run.

## 5. Executed validation

### Commands and exact outcomes

| Check | Before | Final local outcome |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | No test harness installed | Initial install succeeded (925 packages); lockfile updated only for test renderer and unused direct navigation removal |
| `npm test` | No hermetic suite | **65/65 pass**, 0 skipped/failed, approximately 8.52 s in the final run |
| `npm run typecheck` / `tsc --noEmit` | 2 errors | **Same 2 pre-existing errors**, no additional diagnostic |
| `npm run lint` | 27 errors / 2,389 warnings | **16 errors / 2,346 warnings**, command still exits 1 |
| ESLint on all 36 changed/new TS/TSX source files | Not separately measured | **0 errors / 428 warnings** (mostly existing project-style default-theme/named-export warnings; not warning-free) |
| Android + iOS production Expo export | Not baseline-benchmarked | **Pass**; Android ~6.3 MB / iOS ~6.2 MB Hermes bundles. This is JS/bundle validation, not a native binary/device run |
| Expo Doctor | Initial checks partly blocked; later 17/22 before dependency cleanup | **18/22**, 4 outstanding checks below |
| Controlled baseline/current JS benchmark | Actual baseline code loaded from Git | Pass; data and limitations below |
| `git diff --check` | Clean checkout | Pass |
| Native build, simulator/device, live backend, OS kill/restart, release FPS/heap | Not available | **Not run / not claimed** |

Remaining TypeScript diagnostics are unchanged:

```text
src/hooks/useScreenState.ts(2,21): TS2307 missing @react-native-community/netinfo
src/hooks/useScreenState.ts(108,56): TS7006 implicit-any state parameter
```

The remaining lint error files are outside the changed messaging path: `PostCard.tsx`, inactive `ImageMessage.tsx`, `useNetworkStatus.ts`, `useScreenState.ts`, `useStories.ts`, and inactive `useVoiceRecorder.ts`. No unrelated dependency was added just to hide the missing NetInfo baseline.

Final Expo Doctor failures:

- **Existing SDK 56 / RN 0.85.3 Hermes V1 memory-regression warning.** Doctor identifies Hermes `250829098.0.10`; its recommendation is SDK 57 / Expo ≥57.0.9 and RN ≥0.86.2. A disruptive SDK/native upgrade was not undertaken without a separate decision and device regression pass. This is particularly relevant to any memory/performance release claim.
- Existing `react-native-keyboard-controller` **1.21.13 vs SDK-expected 1.21.6**. Not silently downgraded or excluded from validation; requires native compatibility testing/version decision.
- Expo config schema check requires Expo API access and failed TLS/fetch in this network-restricted workspace.
- React Native Directory metadata validation failed with an unexpected server response. Offline mode does not make all Doctor checks local.

### Automated coverage (and its boundary)

| Test file | Tests | What was exercised |
| --- | ---: | --- |
| `timeline.test.cjs` | 7 | Layout readiness/intent combinations, inverted keys, 5,000-row identity, reply dependency edits, stale mutations/receipts, tied ordering, duplicate reconciliation |
| `storage.test.cjs` | 23 | Real SQLite/Drizzle local tuple pages (117 tied rows), prepared-statement finalization, optimistic-before-POST, echo-before-REST, retry payload/single-flight, READ/tombstones, atomic outbox, catch-up/checkpoints/equal timestamps/clock skew/removed cursor, account barriers/reset, startup recovery, transaction isolation, global unread deltas, deleted-receipt cleanup |
| `hooks.test.cjs` | 9 | Cached offline pages/reopen, uncached load, incremental loaded history, retryable single-flight pages, rapid room switch, visible-only reads/blur/timer cleanup, typing/listeners/AppState, reconnect, background-room navigation isolation |
| `rooms.test.cjs` | 4 | Cached inbox before network completion, global unread with partial bodies, read/realtime vs stale REST, account switch, deleted last-message preview |
| `socket.test.cjs` | 8 | Duplicate new/notification, read replay/own echo, 245 pending deliveries, late old-account response, room refcounts/account rejoin, receipt before confirmation, notification vs conversation-delete race |
| `screen.test.cjs` | 6 | Actual screen/composer with mocked native views: single in-flow KAV/inversion/readiness, latest vs history intent, row/input isolation, stable divider/overlay, Android KAV structure, concurrent drafts without double taps |
| `media.test.cjs` | 3 | AppState/blur/unmount play gate, actual MessageCard media/retry/menu wiring and image geometry, loaded/unavailable shared-story selection |
| `api.test.cjs` | 4 | Refresh after logout, old 401 after account switch, coalesced concurrent refresh/retry, account-scoped GET coalescing |
| `migrations.test.cjs` | 1 | Legacy duplicate repair with original local key, READ/edit/tombstone retention, unique index, tuple query plan, idempotence |
| **Total** | **65** | **No network/device-dependent tests skipped and counted as passes** |

The harness uses real **in-memory Node SQLite** and the real Drizzle/query/service/hook code, with Expo/native/HTTP/socket boundaries mocked. “Reopen” means hook/cache reopening in the same test process. It does **not** establish native file durability through force-stop/reboot, native MVCP pixel anchoring, actual IME animation or decoder disposal.

## 6. Measured before/after

<!-- BENCHMARK_START -->
Final isolated Node 22.22.3/Linux run; raw output: [`messaging-benchmark.json`](./messaging-benchmark.json). Script: [`../scripts/benchmark-messaging.cjs`](../scripts/benchmark-messaging.cjs). The final run was not run concurrently with the export/lint/typecheck jobs.

| Scenario | Baseline | Current |
| --- | ---: | ---: |
| 30 representative rows × 50 receipt updates: row renders | 1,500 | 50 |
| Sum of React profiler commit work, same scenario | 133.81 ms | 22.63 ms |
| Harness wall time, same scenario | 179.46 ms | 36.35 ms |
| 5,000-message builder: changed models per receipt | 5,001 | 1 |
| Builder median (50 measured iterations after 10 warmups) | 2.269 ms | 0.036 ms |
| Builder p95 | 4.176 ms | 0.151 ms |

The row-render reduction is **96.67% in this mocked React scenario**. Ten current-composer input updates render zero message cards in the same harness. The JSON's baseline typing count is **not a valid native before/after comparison**, because the mock list does not reproduce native CellRenderer memoization.
<!-- BENCHMARK_END -->

Both original and current screen code are exercised with the same mocked native views/representative cards; the baseline builder is extracted from the actual baseline source, not a hand-written approximation. Receipt toggling is a synthetic invalidation workload, not a legal monotonic receipt event stream. Timing is a single controlled local sample and subject to scheduler/JIT/GC variation. It does not measure full DB merge time, native row cost, Hermes, layout, image decode, network latency, cold-open latency, FPS or dropped frames.

An earlier identity-cache-only implementation **regressed** 5,000-row builder median from 2.463 to 2.958 ms despite reusing models. That adverse result prompted the final metadata fast path. Final measurements above replace, rather than conceal, that intermediate tradeoff. Pagination/full rebuilds still do linear indexing/formatting work; metadata updates still require a reference scan/array copy. No native CPU, heap or “60 FPS” improvement is asserted.

## 7. Changed-file inventory (every changed/new file)

### Configuration and deliverables

| File | Reason |
| --- | --- |
| `.gitignore` | Exclude generated `/dist/` production exports from source/artifact snapshots |
| `package.json` | Add test/typecheck/benchmark scripts and exact dev-only renderer; remove four unused SDK-incompatible direct React Navigation packages |
| `package-lock.json` | Reproducible dependency changes above; no new runtime messaging dependency |
| `docs/messaging-audit.md` | This audit, dependency map, migration/setup, measurements, file inventory and acceptance limitations |
| `docs/messaging-benchmark.json` | Raw final reproducible baseline/current benchmark result with mocked-native caveat |
| `scripts/benchmark-messaging.cjs` | Compare actual Git baseline/current screen invalidation and long-conversation model work |

### Entry points, screen and renderers

| File | Reason |
| --- | --- |
| `src/app/(chatRoom)/privateRoom.tsx` | Keyed in-flow layout, measured latest intent, inverted/MVCP list, stable models/actions, overlays, visible reads/media and history reclamation |
| `src/app/(tabs)/messages.tsx` | Prefetch through coalesced `syncLatest` rather than only a latest page |
| `src/app/user/[username]/index.tsx` | Same compatible conversation-entry catch-up prefetch |
| `src/app/_layout.tsx` | Migration/account/recovery startup gate, explicit storage errors, socket cleanup and existing token/router lifecycle fixes |
| `src/app/stories/viewer.tsx` | Honor shared `storyId` among existing feed results, unavailable UI rather than unrelated story, remove redundant loading-state effect update |
| `src/components/chat/ChatComposer.tsx` | Isolate draft/recording/picker state; in-flow original styling; concurrent optimistic submissions, double-tap guard, recording permission/release race handling |
| `src/components/chat/ChatMessageRow.tsx` | Stable memoized row/date/unread rendering, canonical type mapping, row-specific action/retry callbacks |
| `src/components/messages/MessageCard.tsx` | Cached fixed image geometry, correct shared payload/navigation, playback identity, FAILED/retry UI and working audio/document attachment-menu refs |
| `src/components/messages/Videoplayer.tsx` | Lazy cached source, native events rather than idle polling, measured seek width, visibility/background/late-play guards, caught errors, orientation cleanup |
| `src/components/messages/VoiceMessage.tsx` | Lazy audio source, measured waveform seek, native equalizer transforms, deterministic waveform, visibility/AppState/late-play guard |
| `src/components/ui/OfflineBanner.tsx` | Allow accurate messaging-connection wording without asserting the whole device is offline |
| `src/types/index.ts` | Accurate message timestamp/media/playback/retry props for the retained renderer |

### Storage and synchronization

| File | Reason |
| --- | --- |
| `src/db/db.ts` | Use installed Drizzle async proxy over existing Expo SQLite; serialized queue, WAL/busy timeout, statement finalization, isolated explicit transactions |
| `src/db/schema.ts` | Keep existing rows/types; declare local receipt-outbox and sync-checkpoint metadata tables |
| `src/db/migrations.ts` | Safe column inspection, migration version/gate, duplicate receipt/edit/tombstone repair, ordering/unique indexes, additive metadata tables |
| `src/db/getQueries.ts` | Indexed deterministic tuple pages, tombstone filtering, bounded/targeted ID and latest-per-room reads |
| `src/db/insertQueries.ts` | Canonical transactional upsert/batch deduplication, monotonic merge, atomic realtime unread delta, valid room upsert target |
| `src/db/updateQueries.ts` | Stable confirmation/duplicate repair, atomic retry/recovery/read/outbox/tombstone/unread changes and monotonic receipts |
| `src/db/MessageStore.ts` | Single committed publication boundary, outgoing identity barriers, incremental mutations/cache invalidation, room/account generations and metadata cleanup |
| `src/db/receiptQueue.ts` | Durable bounded read/delivery outbox, acknowledgement, room/account cleanup |
| `src/db/syncStateStore.ts` | Persist interrupted catch-up target/cursor instead of mistaking a sparse cache for complete history |
| `src/services/MessageService.ts` | Local-first sends, same-row retry/payload preservation, history coalescing/catch-up/server cursor ordering, auth/session/room guards and retained mutation contracts |
| `src/services/SocketReceiver.ts` | Central persistence, idempotent events/receipts, early receipt mapping, durable replay/drain, room refs and account/deletion lifetime guards |
| `src/services/BaseUploader.ts` | Native upload timeout/abort errors instead of indefinitely pending sends |
| `src/services/MessagingCache.ts` | Messaging cache-owner preparation and logical account-safe clearing across storage/RAM/queues |
| `src/services/AuthService.ts` | Prepare account before credentials dispatch; clear tokens/session before asynchronous logout cleanup |
| `src/services/api.ts` | Correct token clearing, real auth-scoped GET coalescing, generation-safe shared refresh and bounded retry waits/cancellation cleanup |

### Hook/model/cache helpers

| File | Reason |
| --- | --- |
| `src/hooks/useChat.ts` | Local-first session-scoped rows, committed updates, pagination locks/errors, visibility reads/typing cleanup, reconnect, latest history reclamation and focused-only navigation |
| `src/hooks/useRooms.ts` | Local-first cached summaries, guarded/revision-checked REST/realtime updates, server unread baseline/delta preservation and account-keyed output |
| `src/hooks/useChatMediaPlayback.ts` | Shared focused/background pause lifecycle and safe permission to start after async media loading |
| `src/utils/messaging/timeline.ts` | Deterministic tuple ordering/cursors, canonical identity, monotonic/stale-safe merge and no-op reference preservation |
| `src/utils/messaging/listItems.ts` | Stable inverted row/date/unread/reply models and fast metadata-dependent patches |
| `src/utils/messaging/viewport.ts` | Pure measured latest-vs-history interaction intent; no timing workaround |
| `src/utils/messaging/serialization.ts` | One validated REST/socket normalization with canonical type/status/null fields |
| `src/utils/messaging/mediaVisibility.ts` | Per-row external visibility registry owned by focused screens rather than rerendering every row on scroll |
| `src/utils/recentMessageCache.ts` | Keep existing bound; add committed invalidation/account clear |

### Hermetic tests

| File | Reason |
| --- | --- |
| `test/messaging/harness.cjs` | TypeScript loader, real Node SQLite/Drizzle and explicitly mocked native/HTTP/socket boundaries |
| `test/messaging/timeline.test.cjs` | Ordering, identity/reply/date/unread models and measured intent |
| `test/messaging/storage.test.cjs` | Persistence/query/service/transaction/retry/checkpoint/global-unread/account invariants |
| `test/messaging/hooks.test.cjs` | Actual useChat cached/uncached/pagination/switch/read/typing/reconnect lifecycle |
| `test/messaging/rooms.test.cjs` | Actual useRooms local-first/partial-cache-unread/account/stale-response/delete-preview behavior |
| `test/messaging/socket.test.cjs` | Actual receiver dedup/replay/pending batches/receipt-before-confirmation/room-lifetime races |
| `test/messaging/screen.test.cjs` | Actual screen/composer composition and render/scroll-intent behavior with native mocks |
| `test/messaging/media.test.cjs` | Media play gate/card wiring/shared-story selection, without claiming decoder/device testing |
| `test/messaging/api.test.cjs` | Account-safe request/refresh/coalescing behavior |
| `test/messaging/migrations.test.cjs` | Legacy upgrade repair, tombstones/edits/receipts, query plan and repeatability |

## 8. Remaining constraints and release acceptance checklist

### Explicit limitations

1. **No native/device proof.** Inverted MVCP, keyboard interactive dismiss, bottom safe area/composer resizing, first/last row pixel visibility, rotation, large fonts, media decode/disposal and release-device jank/heap are unverified. Structural/mock tests cannot substitute.
2. **Backend exactly-once boundary.** An ambiguous POST can have succeeded remotely even if the client timed out. With no verified idempotency/client nonce, automatic resend is deliberately disabled, and explicit Retry can still create a remote duplicate. An uncorrelated echo after such a failure cannot be safely matched by text/time.
3. **Missed historical mutations.** Catch-up fills new-message gaps; without a verified change/tombstone feed it cannot discover every edit/delete to old rows while offline. Reactions and unsupported group behavior are not fabricated. Server cursor tie ordering, read echo shapes and pending-delivery acknowledgement semantics require real integration validation.
4. **Unread baselines.** Tests cover global counts with partial local bodies and duplicate/read/delete deltas. A delayed, previously uncached event exactly on an already-counted server timestamp frontier lacks a verified server revision/last-message cursor in the summary; final reconciliation depends on authoritative REST counts. These are not claimed as an offline exact count for every multi-device ordering.
5. **Native restart/media durability.** DB state machines and recovery were exercised in memory, not by force-killing/rebooting a device. Pending attachment URIs may refer to OS/Expo cache files that can be removed; media bytes are not a new durable download store. Shared stories are limited to the existing feed's available IDs.
6. **Bounded-at-latest, not hard-bounded-all-history.** Long uninterrupted history reading/inactive navigation stacks can retain many models. No native heap/FPS or absolute cold-open latency target was measured. Severe device-clock skew can still affect local display/older-page ordering even though catch-up uses server cursors.
7. **Account/migration boundaries.** Automated epoch/notification/refresh tests cover concrete races, not an exhaustive native scheduler proof. Legacy unowned caches have the adoption limitation above. Current SQLite storage remains unencrypted and logical cleanup is not secure erasure.
8. **Build health.** The two baseline TS diagnostics, remaining unrelated lint errors and Doctor's SDK/Hermes/keyboard warnings are still open. SDK/native dependency changes require a separate approved upgrade/regression plan.

### Manual device/backend matrix — all still to run

Use a test backend/account pair and both **a lower-end Android release device and an iPhone release device**. Capture a known visible message local/server ID and its screen Y before each history operation.

- [ ] Upgrade a copied legacy DB with duplicates, READ/edit/tombstone variants; reopen twice; verify message keys, summaries/indexes, no loss of distinct IDs, explicit migration-error behavior and backup/rollback procedure.
- [ ] Cold/warm cached room, RAM-evicted cached room, empty room and uncached room. Disable backend/socket and confirm cached text/pages are usable. Record tap-to-cache-paint and last-row fully-visible time (p50/p95), not just network completion.
- [ ] Short/long text, multiline/reply composer, images, video, audio, documents, shared cards and failed rows at the bottom. Assert newest bubble/status is completely above composer before and after network sync/late media decode.
- [ ] Android gesture/three-button nav, iOS home indicator, real keyboard show/hide, interactive dismissal, emoji/predictive keyboards, rotation, hardware keyboard and large text. Latest stays latest; history anchor does not jump. Check actual keyboard-controller native version matches JS.
- [ ] Load 20+ pages with several pages sharing one timestamp; rapid repeated end-reached/flings, overlapping sync, failed page then retry and remotely removed cursor. Assert no duplicate/skipped IDs and preserve anchor Y through date/unread separators/variable media rows.
- [ ] Incoming burst/own echoes/READ/DELIVERED/edit/delete while at bottom and while reading old history. Background updates must not drag the reader to latest; explicit jump/send must. Verify unread counters with >1 page of uncached unread bodies and delayed multi-device events.
- [ ] Delay POST response behind its socket echo and receipts; send several drafts quickly, retry a failed reply/media/shared message repeatedly, fail upload, expire token, and delete while send is pending. Verify stable local key, one explicit retry flight and correct failed/error feedback. Observe ambiguous-server-success retry behavior separately.
- [ ] Disconnect/reconnect, token refresh, background/foreground, rapid A/B/A rooms and stacked unfocused rooms, logout/login another account while requests/uploads/notifications are paused. Check old bodies/rooms/queues/joins never appear for the next account and background deletion does not navigate the active room.
- [ ] Force-stop/kill/reboot after optimistic insert, HTTP success-before-confirmation and partial catch-up/read queue. Reopen offline; confirm DB bodies/pages, FAILED recovery, checkpoint/read replay and no automatic ambiguous resend. Test missing attachment cache files explicitly.
- [ ] Play/seek/pause media, quickly scroll/blur/background/unmount while loading, fullscreen/orientation changes and expired/bad URLs. Ensure no offscreen playback, unhandled native handle error, idle polling/animation leak or broken attachment menus.
- [ ] Profile the same baseline/current data and device in true release: 30/300/5,000+ messages, media-heavy and text-heavy histories, repeated room switching and long history reading. Record JS/UI frame p50/p95, dropped-frame percentage, long JS tasks, row renders, Hermes/native heap and post-GC memory after leaving rooms. Separate server latency and decode work; investigate the SDK 56 Hermes warning before declaring a memory win.

**Release decision:** implementation and local evidence are ready for review; physical-device/backend/upgrade acceptance is still required. Do not translate the Node benchmark into a native responsiveness guarantee.
