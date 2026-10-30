# Messaging system synchronization and UX repair — frontend

- **Date:** 2026-10-30
- **Frontend baseline:** `9c93b7dcfa66fb3fa644a7b333882981e0a95128`
- **Working branch / review:** `arena/e4dfc24a-socialapp`, [frontend PR #2](https://github.com/77elijah78/socialApp/pull/2)
- **Backend inspected read-only:** `77elijah78/nodejs-socialapp` main, [`eb79c440ae38f0f120b8301c59ff64904b67c7bc`](https://github.com/77elijah78/nodejs-socialapp/commit/eb79c440ae38f0f120b8301c59ff64904b67c7bc).

**Status:** frontend implementation and automated verification completed. **Not full native/two-account acceptance sign-off:** backend limitations below prevent some requested behavior, and no devices, live accounts, or production services were exercised. No backend files, backend schema, production database, deployment, or merge were changed.

This audit describes the actual backend commit above. Backend findings in the earlier `messaging-upgrade-audit.md` and `read-receipts-integration.md` are historical, not the current contract. In particular, current main **does** have individual `MessageReceipt` records, read ACKs, transactional read/outbox persistence, sender/reader read events, group recipient handling, and deterministic history cursors. These were reused, not replaced.

## 1. Root causes and repairs

| Reported issue | Inspected/reproduced cause | Frontend repair and evidence boundary |
| --- | --- | --- |
| Incoming messages/replies do not immediately appear | `useChat` applied the loaded history's oldest timestamp floor to every store update. A legitimate live message older than an optimistic/client-clock row was persisted but excluded from the open list. | Store changes distinguish live, history and mutation provenance. Live incoming/recovered rows merge into the correct room without the history floor; older backfill stays bounded. Actual SQLite + hook regression covers immediate paint and duplicate suppression, including an older live reply. |
| Missing/wrong reply relationships and authors | Kafka nests the original ID under `repliedTo.id` and its name under `senderUsername`; normalization expected top-level `repliedToId` and nested `sender`. Sparse duplicate payloads could also erase richer metadata. | Normalize both inspected shapes, retain the relationship and actual author, and preserve richer cached media/author snapshots on sparse merges. |
| Generic, broken or stale quotes | Shared-message JSON was truncated before parsing. Sparse parent merges and server-ID confirmation could lose or fail to persist richer child quotes; thumbnail failures had no useful fallback. | Parse shared data before bounding compact text; render text/image/video/audio/document/post/story/deleted variants. Hydrate from scoped cached originals and retain enriched fields supplied by the server. Persist child snapshots transactionally, including after optimistic-ID confirmation; use a type icon if an image fails. Unavailable server metadata is not invented. |
| Reads require touching/scrolling the stationary chat | The installed RN 0.85.3 `VirtualizedList` increments `pendingScrollUpdateCount` when MVCP adjusts the first visible key, then suppresses viewability until a native scroll update. `recordInteraction()` does not bypass this gate. | Enable native MVCP while browsing/prepending history, not at stationary latest; request normal viewability reconsideration after data/content commits. Tests execute the installed list/viewability algorithms and reproduce the gate and latest-mode fix. This is not a physical-device reproduction. |
| Receipt work keeps replaying despite successful reads | The current backend's callback is `{success:true}` without IDs. The client did not consume this actual persistence ACK. | Bind exact IDs and socket/account/attempt generation to each callback. Only success retires durable work; failure/malformed/stale callbacks do not. Self-echo and fresh recipient-specific history can also confirm reads. Group aggregate READ never substitutes for `readByMe`. |
| Swipe-left reply absent/inconsistent across media | There was no common horizontal-intent reply gesture on the row. | Use the existing RNGH/Reanimated stack on every supported message type, with direction/vertical/one-finger/completion guards and a subtle themed indicator. Reuse the same composer reply/cancel path. Native gesture arbitration still needs Android/iOS testing. |
| Only single-message actions; unsafe mixed bulk behavior | Existing long-press actions did not provide immutable multi-selection, partial-result handling or a selection-first Back path. | Add local-ID selection, highlights/checkboxes/count/toolbar, applicable text copy, existing-endpoint forwarding, confirmation and bounded per-message deletion. Keep failures selected; consume Back before navigation, including while a batch is busy. |
| Deletion fails or appears to succeed incorrectly | Client DELETE used `/messages/:id?deleteFor=...`; the mounted backend route is `/messages/messages/:id` with a JSON body. Success shape/identity/mode were not validated. | Match the actual endpoint/body and require `{success:true,data:{messageId,deleteFor}}`. Do not remove persisted messages optimistically. A real, persisted scoped notification may confirm a lost HTTP response; the client's own emission never does. |
| Deleted content returns after history/reopen | Row-only tombstones did not cover originals outside the body cache or survive physical cache eviction. Delayed history/echo/confirmation and unscoped notifications could restore or misapply data. | Add an account-owned, conversation-scoped SQLite invalidation ledger, apply it to insert/upsert/confirmation, scrub body/media/child quotes and pending receipts, and reject cross-conversation identity collisions. Genuine everyone evidence can upgrade a personal/legacy hide, never vice versa. |
| History stalls or becomes empty around deletions | Visible-row growth was confused with server-cursor progress. A full deleted page could repeat forever; a deleted cached oldest row could continue excluding the next visible head rows. | Retain confirmed raw server cursors across deleted-only older pages and failed retries. Initial sync traverses deleted-only heads; a removed oldest row no longer constrains the visible floor. Only actual server exhaustion ends remote traversal. |
| Gesture/composer/selection lifecycle races | New interaction state can otherwise recreate gestures on receipts, lose drafts on selection, reply to a queued stale row, or continue a batch using the next account. | Stable row callbacks read the latest committed row; a read-only `useChat` session lookup validates queued replies. Validate the original across the composer-subscription gap. Keep the composer mounted/disabled, gate modal reads, and stop batch continuation when the service session changes, without waiting for unmount. |

## 2. Files changed

### Synchronization, identity, persistence and summaries

- `src/services/SocketReceiver.ts` — exact read ACK handling; scoped edit/delete notifications without unrelated upload barriers; suppress receipt/notification work for deleted echoes.
- `src/services/MessageService.ts` — mounted delete/edit/individual-forward routes, validated results and session guards, notification-confirmed deletion/idempotence, raw page-cursor access, deleted-only head progression, personal history receipt confirmation.
- `src/hooks/useChat.ts` — live/history provenance, removed-floor handling, compact unloaded-original invalidation, retryable deleted-page traversal and read-only current session lookup.
- `src/hooks/useRooms.ts` — sanitize REST room previews using server tombstones/local scoped invalidations; authoritatively refresh unknown-body deletions instead of guessing unread deltas.
- `src/db/MessageStore.ts` — committed change provenance/invalidation, scoped deletion, ledger lookup and confirmed-forward integration.
- `src/db/deletionState.ts` — apply scoped invalidations, clear deleted payloads, record authoritative history tombstones and monotonically upgrade deletion proof.
- `src/db/schema.ts`, `src/db/migrations.ts` — additive SQLite v4 ledger, indexes, legacy backfill and quote/body/receipt cleanup.
- `src/db/getQueries.ts` — chunked, indexed ledger ID lookup.
- `src/db/insertQueries.ts` — raw tombstone recording, ledger application and transactional scoped quote hydration.
- `src/db/updateQueries.ts` — scoped persisted deletion/edit, receipt cleanup, invalidation-safe identity confirmation and child-snapshot synchronization.
- `src/db/deleteQueries.ts` — clear account-owned invalidations on full account/cache reset, not ordinary body-cache reclamation.
- `src/db/replySnapshots.ts` — indexed compact hydration/JSON merge and quote redaction, including uncached originals.
- `src/utils/messaging/{serialization,presentation,timeline,listItems}.ts` — actual Kafka/REST shape normalization, rich compact previews, safe sparse merges, identity scoping and immutable dependent-row models.

### Interaction and rendering

- `src/app/(chatRoom)/privateRoom.tsx` — conditional history anchoring, selection/swipe/toolbar/forward integration, Back handling, read occlusion, canonical reply validation, selection-safe history release and reply-source invalidation.
- `src/hooks/useMessageSelection.ts` — interaction-only immutable selection and guarded copy/delete/forward orchestration; not another message store.
- `src/utils/messaging/{actions,swipeReply}.ts` — eligibility/copy text, bounded ordered results and horizontal gesture thresholds.
- `src/components/chat/{SwipeToReply,MessageSelectionBar,ForwardMessagePicker}.tsx` — existing themed gesture/action UI and existing conversation destinations.
- `src/components/chat/ChatMessageRow.tsx` — common all-type gesture, selection overlay and stable latest-row callbacks.
- `src/components/chat/ChatComposer.tsx` — retain text draft/layout while disabled; guard late picker/record/send callbacks and use existing reply focus/cancel.
- `src/components/messages/ReplyPreview.tsx` — thumbnail-error fallback, video indication and type/deleted icons.
- `src/components/messages/VoiceMessage.tsx` — propagate long-press through the waveform without replacing playback/seek behavior.
- `src/providers/OverlayProvider.tsx` — separate modal visibility signal for read occlusion without changing stable overlay action callbacks.

### Tests and documentation

- New test files: `current-contract.test.cjs`, `deleted-pagination.test.cjs`, `deletion-reply-contract.test.cjs`, `interaction-ui.test.cjs`, `receipt-ack.test.cjs`, `selection.test.cjs`, `visibility-native.test.cjs`.
- New helper: `test/messaging/native-list.cjs` executes the installed RN list/viewability implementation with adapted geometry/native boundaries.
- Updated `test/messaging/harness.cjs`, `migration-v2.test.cjs`, `migrations.test.cjs`, `receipt-integration.test.cjs`, `timeline.test.cjs` for the actual transport ACK/DELETE contracts, UI boundaries, v4 upgrade and explicit source provenance.
- This audit: `docs/messaging-system-fix-audit.md`.

No dependency/lockfile, auth screen/session implementation, post implementation, SDK, list library or backend source changes were made for this task. Historical `backend-delivery/` artifacts are not part of this patch.

## 3. Frontend architecture and behavioral decisions

```text
existing SocketProvider / Socket.IO connection
  message:new / pending delivery / scoped edits, deletes, receipts
    → actual payload normalization
    → existing async SQLite MessageStore transaction + invalidation ledger
    → one committed scoped change notification
    → useChat canonical session/index + existing recent conversation cache
    → immutable, deduplicated chronological models / compact reply dependencies
    → inverted FlatList → memoized common message row → existing media controls

FlatList genuine visibility + focus + AppState + occlusion eligibility
    → eligible incoming server IDs only
    → local READ + existing durable receipt outbox transaction
    → existing socket message:read → durable backend commit / success ACK
```

### Incoming identity, quotes and pagination

- Preserve the optimistic `localId` and insertion key through REST/server-ID confirmation and duplicate echoes. No timestamp offsets, guessed content matching, alternate ordering schema or automatic ambiguous resend.
- Source provenance is local store-notification metadata, not a new server field. A live incoming/recovered row is not discarded just because its server timestamp precedes a locally inserted row. This proves inclusion, **not** perfect canonical ordering under arbitrary client/server clock skew.
- Reply snapshots are bounded presentation metadata, not canonical parent rows. A partial quote never inserts/reorders/duplicates the original in the timeline. Original/reply navigation and the existing five-preview context remain intact.
- Sparse events preserve known relationship, author, media and attachment details. Deleted flags are monotonic; body URLs/content and quote media/shared content are removed rather than rendered from stale snapshots.
- Older network pagination can cross multiple deleted/hidden pages using the existing raw cursor. Successfully confirmed progress survives a subsequent failed request; the failed position is retried. Cancellation/blur stops further traversal and non-advancing cursors surface a retryable error.
- The cached older-page branch still serves local data without remote revalidation. See the explicit missed-old-mutation limitation below.

### Visibility reads

- Keep native eligibility: whole small rows or at least 50% of the viewport for oversized rows, with the existing 300 ms minimum view time and `waitForInteraction:false`. There is no additional synchronization delay.
- Exclude date/unread/context summaries, deleted rows, outgoing rows, failed/unsent rows, missing server IDs, inactive/unfocused screens and covered viewers/sheets. Opening the room or fetching history does **not** authorize a whole-conversation read.
- Keep existing focus, foreground, visibility replay, independent delivery/read drains, durable claims and reconnect recovery. ACKs bind the exact emitted IDs and current connection/account/attempt. A malformed/negative/lost ACK keeps work durable; explicit recovery starts a new attempt rather than spamming identical online reads.
- Incoming group `readByMe` is individual. Outgoing group **READ means any other recipient**, as explicitly requested, not all recipients.
- MVCP is the sole normal history anchor. Disable it at stationary latest to avoid RN's pending-scroll viewability gate; re-enable for history interactions/prepends. No native private-state manipulation or manual history-offset compensation was added.

### Swipe, selection and actions

- Left pan activation: 18 px; completion: 56 px; visual translation capped at 72 px. Fail on rightward/vertical intent, restrict to one pointer and reject failed/non-finite/short/mostly vertical completions. Existing zoom routes/fullscreen native media remain separate touch surfaces.
- All seven supported types share the common gesture and same reply composer/cancel path. A queued UI-thread completion checks current canonical identity and current selection state.
- Long-press enters selection; taps toggle immutable local IDs. Selection overlays intercept media controls; copy uses human-authored text/captions, never raw serialized shares. Non-copyable attachments remain selected.
- Destructive confirmation precedes deletion. Everyone eligibility is own sent/available messages; mixed ineligible rows remain selected. Server failures remain authoritative. Deletes run at concurrency 3; forwards run sequentially through the existing individual endpoint to preserve order.
- Successful items are removed from selection; partial failures keep their identities and useful errors for retry. Session reset/unmount stops further batch operations. Back closes the picker/selection first and blocks navigation during an active batch.
- The composer stays mounted to preserve the text draft and measured layout. Disabled/late sends, media-picker completions and recording callbacks cannot send through selection. Native IME/recording interruption ergonomics are not device-certified.

### Deletion and local migration

- No optimistic removal of persisted messages. Require validated HTTP success or actual matching persisted deletion evidence. An everyone request cannot be confirmed by a me-only/unknown legacy ledger entry.
- Apply scoped notifications immediately even when another upload is pending. Original IDs outside the loaded/body cache still invalidate child quotes; later history, direct insert, sparse echo or REST confirmation cannot revive known deleted content.
- SQLite **v4** adds `message_invalidations`, keyed by `(conversation_id,message_id)`, plus an ID lookup index. Existing tombstones are backfilled with unknown `legacy` scope, never assumed to prove an everyone deletion. Actual everyone notification/history can upgrade personal/legacy proof; me cannot downgrade everyone.
- Record authoritative incoming tombstones **before** applying local hides. A stale undeleted body must not turn a personal hide into global deletion evidence.
- Retain the same `app.db`, existing account ownership, queue and history. Clear body/media data, redact persisted child quotes and clear obsolete pending receipts in the appropriate transactions. Physical body-cache reclamation retains invalidations; full account/cache reset clears them.
- Test an upgrade copy and consistently back up SQLite plus live WAL sidecars before a real rollout. No existing installed/native database was migrated here.

## 4. Actual backend API and socket contracts

The app base is `/api/v1`; the Express message router is mounted at `/messages`. Full paths below include both. Source references are pinned, not deployment claims:

- [Routes](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/routes/message.routes.ts)
- [Controller/envelopes](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/controllers/message.controller.ts)
- [Message service/permissions/history/receipts](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/services/message.service.ts)
- [Socket handlers/ACK](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/socket/chat.handler.ts)
- [Kafka → Socket.IO payloads](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/kafka/consumer.ts)
- [Existing durable receipt publisher](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/services/receipt-outbox.service.ts)

| Operation | Inspected contract |
| --- | --- |
| History | `GET /api/v1/messages/conversations/:conversationId/messages?limit=...&cursorId=...` (also existing `before` and `page`). Response `{success:true,data:Message[],meta:pagination}` — **data is the array**, not `data.messages`. Deterministic `createdAt/id`; includes tombstones. History does not mark read. |
| Send/reply | POST `/api/v1/messages/conversations/:conversationId/messages` or `/reply`; existing content/type/media/thumbnail/duration/repliedToId fields. Reply endpoint validates the target's conversation. Reuse existing membership checks and relationships. |
| Delete | `DELETE /api/v1/messages/messages/:messageId`, JSON `{deleteFor:'me'|'everyone'}`. Success `{success:true,data:{messageId,deleteFor}}`. Server checks sender ownership **for both modes**. Everyone persists a tombstone; me publishes a personal event without a durable per-user hide. |
| Edit | `POST /api/v1/messages/messages/:messageId/edit`, JSON `{content}`. |
| Forward | `POST /api/v1/messages/messages/forward`, JSON `{messageId,targetConversationId}`; success/data message. Individual, membership-validated endpoint; preserves existing type/media/thumbnail/duration/forwardedFromId. No bulk-forward API is assumed. |
| Delivery | `POST /api/v1/messages/delivered`, JSON `{messageIds}`. Delivery is not read. Existing pending-delivery endpoint is retained. |
| Outgoing receipt recovery | `POST /api/v1/messages/receipts/sync`, JSON `{messageIds}` → data rows `{messageId,conversationId,status}` for eligible own undeleted messages. Missing entries are **not deletion proof**. |
| Read command | Socket `message:read` `{conversationId,messageId}`. Optional callback after durable commit: `{success:true}` or `{success:false,error}`. IDs are not echoed in this callback; bind them in the frontend closure. |
| Read event | Socket `message:read` `{conversationId,messageId,userId,readAt}`, routed to both sender and reader user rooms through Kafka/outbox. Duplicates are safe; an incoming group message is not this user's read merely because another member read it. |
| New message | `message:new` to each recipient's user room: `id/messageId`, `conversationId`, sender/receiver, `isGroup`, `readByMe:false`, content/type/media/thumbnail, createdAt/timestamp, sender, and sparse nested `repliedTo`. Companion `message:notification` is not a second canonical row. |
| Everyone deletion | `message:deleted` in `conversation:<id>`: `{messageId,conversationId,deletedAt,deletedBy}`. |
| Personal deletion | `message:deleted-for-me` in `user:<id>`: `{messageId,conversationId}`. |
| Edit event | `message:edited` in the conversation room: `{messageId,conversationId,content,editedAt}`. |

The durable read transaction/`MessageReceipt`/receipt outbox, Kafka consumer routing and Socket.IO provider remain the existing backend/frontend architecture. No new read command, whole-room read workaround, deletion schema on the server, or replacement publication mechanism was introduced.

## 5. Backend gaps and unresolved contract boundaries

1. **Received delete-for-me is rejected.** `deleteMessage` checks `message.senderId === userId` before branching on mode. The frontend surfaces the real error and retains failed rows/selection; it does not fake success or bypass ownership. The request to delete received messages for me therefore remains blocked by this backend contract.
2. **Personal hides are not server-durable.** Me mode only publishes Kafka; it creates no per-user deletion record. A confirmed hide survives navigation/body eviction on this device through v4, but not app-data clearing/account-cache reset or an unsynchronized second device. The confirmation UI states this limitation. The frontend cannot truthfully guarantee cross-device/reinstall persistence.
3. **Nested original metadata is sparse.** REST `repliedTo` selects ID/content/sender/type, and Kafka also omits original media URL/thumbnail/duration/deletedAt/attachment details. Ordinary Kafka message payloads also omit duration. Cached originals/enriched compatible payloads produce rich previews; an uncached original cannot always show its thumbnail, duration, document size or authoritative deleted state immediately. There is no routed single-original/around-message endpoint to safely invent/use. Explicit existing history navigation can find/cache the original; the UI does not auto-scan large histories on every quote/render.
4. **No verified durable edit/delete publication/change feed.** Everyone deletion commits the row then publishes Kafka separately; me publication has no persisted hide. The transactional receipt outbox does **not** establish transactional deletion/edit publication. Kafka/HTTP failure can leave an ambiguous result. The frontend requires actual success/evidence and does not turn emission into persistence proof.
5. **Missed old mutations remain incomplete.** Reconnect head catchup and exact outgoing receipt sync are not a deletion/edit feed. Cached older pages still bypass remote revalidation, and mutations outside the synced head can remain stale until the relevant server history is fetched. A missing receipt-sync result cannot authorize deletion. This patch does not claim complete offline deletion/edit recovery.
6. **Deleted reply-target validation is incomplete.** The current reply service checks target ID/conversation, but its selected target fields do not include `deletedAt`. The client prevents known-deleted replies and closes an invalidated composer source; an authoritative server-side deleted-target race check is still needed. No backend validation was redesigned here.
7. **Create/forward retry idempotency is not verified.** Explicit retry after a lost response can duplicate a remotely committed send/forward. No invented request-ID contract or automatic failed/ambiguous replay was added.

## 6. Executed verification and results

All results below are from the final changed frontend tree, not earlier 208/220-test checkpoints. The backend archive was read only: no backend install, test execution, migration or live request was performed.

| Check | Actual result |
| --- | --- |
| `npm test` | **269/269 pass**, 0 failed/cancelled/skipped; includes messaging, auth and posts. Baseline was 208 tests; this task adds 61. Final run about 51.7 s while exports/checks ran concurrently. |
| ESLint on all 42 changed/new TS/TSX/CJS source/test files, `--max-warnings=0` | **0 errors / 0 warnings**. This is scoped changed-tree lint, not a claim of clean repository-wide lint. |
| `npm run typecheck` | **Not clean:** same two unchanged baseline diagnostics: `src/hooks/useScreenState.ts(2,21)` missing `@react-native-community/netinfo`; `(108,56)` implicit-any `state`. No other diagnostics. No dependency was added merely to mask them. |
| `CI=1 EXPO_OFFLINE=1 npx expo export --platform android ...` | **Passed**, Hermes `.hbc`, 2,375 modules, roughly 6.5 MB bundle. |
| Same Expo export for iOS | **Passed**, Hermes `.hbc`, 2,296 modules, roughly 6.4 MB bundle. Neither export is a native binary build or device run. |
| `git diff --check` | **Passed**. |
| Existing `npm run benchmark:messaging` | **Passed**, adapted Node/React benchmark against original `c0b7d994...`, not a new before/after comparison against `9c93b7d`. 50 receipt updates render 50 vs 1,500 representative cards; typing renders 0 current cards. 5,000-row model: 1 changed row/receipt; median 0.038 ms / p95 0.179 ms in this run. These are not native FPS, latency, memory or Hermes timings; timing samples ran alongside other checks. |

### New regression coverage (61 tests)

- **10 current-contract tests:** actual Kafka reply shape, live timestamp-floor inclusion/dedupe, bounded backfill, exact DELETE contract, unloaded/scoped deletion, shared caption parsing, current canonical lookup and foreign-room identity collision rejection.
- **6 deleted-pagination tests:** deleted-only older page traversal, retry at last confirmed cursor, actual EOF, entirely deleted initial head, and full/partial deletion of the only cached head/floor.
- **17 deletion/reply tests:** sparse rich metadata, media/document/shared bounds, broken-thumbnail fallback, uncached original redaction, physical body eviction/new-store reads, deletion while upload pending, identity-confirmation races and persisted child previews, history receipt cleanup, v4 legacy migration/account clear, room-head privacy, lost HTTP response confirmation, me-vs-everyone/legacy proof and indexed ledger lookup.
- **8 adapted UI tests:** left thresholds, all seven types, selection/media interception, unchanged composer/draft identity, affected-card rerender count, Back/listener cleanup, common reply/cancel path, stable gesture callbacks/current row and stale/deleted reply-source guards.
- **10 selection tests:** immutable IDs/stable callbacks/pruning, confirmation, mixed permissions, partial and malformed results, applicable clipboard contents, bounded deletion concurrency, ordered actual forward endpoint, failed-only retry, unmount and still-mounted account reset.
- **6 read-ACK tests:** exact-ID success-only ACK retirement, malformed/negative ACK retention and explicit recovery, stale account ACK isolation, delivery-not-read, and group `readByMe` true/false history confirmation.
- **4 installed-RN visibility tests:** reproduce MVCP gate, stationary latest qualification without interaction, conditional native history anchoring and actual threshold exclusion.

The tests use real Drizzle queries and in-memory **Node SQLite**, actual application hooks/services/models and React test rendering. Network/socket/native gestures, views, audio and geometry are adapted. The RN list tests execute installed JS algorithms, not native scroll/layout implementations. New-store/cache reload tests are not OS kill/restart or native Expo SQLite certification.

Reproduction commands:

```sh
npm ci
npm test
npm run typecheck  # known two baseline NetInfo diagnostics above
# ESLint: run on the changed TS/TSX/CJS inventory in section 2 with --max-warnings=0.
CI=1 EXPO_OFFLINE=1 npx expo export --platform android --output-dir /tmp/messaging-android
CI=1 EXPO_OFFLINE=1 npx expo export --platform ios --output-dir /tmp/messaging-ios
npm run benchmark:messaging -- --output=/tmp/messaging-benchmark.json
```

## 7. Limitations and required acceptance checks

**No live two-account, group, simulator, physical Android/iOS, production PostgreSQL/Kafka/Socket.IO, offline-network, OS restart, native memory or FPS acceptance run was available.** Export success and adapted tests are not those results. Existing auth/posts were regression-tested, not redesigned. Do not merge/deploy or describe this as release-certified on these results alone.

Run the following with two real accounts on independent clients (and a third recipient for group distinctions), on both Android and iOS. Every row is **NOT RUN here**:

| Manual scenario | Required observation |
| --- | --- |
| Normal and reply arrival in an already open room | Immediate one canonical row in the correct room; correct original author/content/type; no reload/navigation; sender transitions sent → delivered → read only on genuine recipient visibility. |
| Initial unread opening, stationary incoming, scrolling | Visible eligible IDs qualify without touch; offscreen/date/context/quoted summaries do not. Check whole small rows, oversized rows, dwell and duplicate receipt suppression. |
| Blur/background/foreground/reconnect and modal coverage | No hidden/covered reads; replay eligible visibility on return; delayed ACK/offline recovery remains durable without duplicate bodies or whole-room reads. Include several rapid data commits while reading history. |
| Swipe on text/image/video/audio/document/shared post/story | Left intent/completion only; short/right/vertical/multi-touch does not reply; vertical scrolling, image zoom/fullscreen, video controls and audio seek remain usable. |
| Long-press/multi-select/actions | Accurate highlight/count; multiple taps; copy applicable text; forward to a real DM/group; cancel/Back first; draft/keyboard/composer height retained; no accidental media action. |
| Own and received delete-for-me, mixed selection | Own server-confirmed hides persist locally; current backend rejection for received messages is visible and retained, not a fake success. Validate behavior after ordinary reopen and explicitly after app-data clearing/second-device use. |
| Authorized everyone deletion and rejection/partial failure | Both online participants update; no stale media/quotes; unrelated users are not authorized; rejected/failed rows remain selected and retryable; lost response is not assumed successful. |
| Persistence/history | Reopen, offline reopen and real process kill/restart after confirmed deletion; paginate through multiple deleted-only pages and original-outside-cache replies without resurrection or scroll jumps. Upgrade a copied v3 database to v4. |
| Group receipts/permissions | Another recipient's read makes the sender READ (any-recipient decision), but does not mark this user's incoming message seen. Check per-member reads, member changes, forwarding and sender-only everyone deletion. |
| Large variable media history | Native MVCP anchoring during prepends/deletions, keyboard/multiline/IME/recording interactions, rapid arrivals, navigation cleanup and native memory/FPS under sustained history/recovery load. |

History release still trims only above **300 loaded rows**, retaining **90**, and does not run during pagination/selection. Sustained history reading or inactive navigation stacks are not proven to have a hard RAM bound. The same measured composer/viewport strategy and existing theme remain; native scroll/keyboard/gesture ergonomics require the checklist above.
