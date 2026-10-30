# Messaging upgrade: replies, receipts, and bubbles

Date: 2026-10-30

Frontend baseline: `fa030d3cddbf625587f06307c3d3aa8efcdca383`

Backend inspected read-only: [`77elijah78/nodejs-socialapp`](https://github.com/77elijah78/nodejs-socialapp), commit `002e3370124dfcb166d79dd709d781551a4edbab`.

## Scope decisions and outcome

The architecture/root-cause audit was delivered **before implementation**. After that audit, the user selected:

1. **Frontend only.** No backend patch, backend code change, deployment, or second-repository push.
2. Group outgoing **READ means any other recipient has read**, not all members.

The frontend now implements reply navigation/context, richer persisted previews/authors, visibility replay and immediate receipt dispatch, safer receipt application, and redesigned bubbles. It retains the existing SQLite message store, HTTP endpoints, single Socket.IO receiver/provider, inverted FlatList/native history anchoring, account isolation, and optimistic identities.

**This is not end-to-end read-receipt sign-off.** The inspected backend still emits read events during history fetches, lacks a recipient read acknowledgment/echo, and does not correctly support group delivery/read membership. A frontend cannot reliably distinguish its fetch-triggered read event from a genuine visibility-triggered one. These server blockers were deliberately left unchanged under the selected scope.

## 1. Architecture traced and root causes

```text
Composer → useChat → MessageService → existing REST/upload routes
                                      ↓
                        PostgreSQL / Prisma → Kafka
                                      ↓
                           Redis-adapted Socket.IO
                                      ↓
SocketReceiver → committed SQLite MessageStore changes → useChat
                                      ↓
             cached chronological/reply models → inverted FlatList
                                      ↓
                       memoized rows → message bubbles
```

Redux remains the auth/application store, not another store for message bodies. AsyncStorage is not the message database. Native providers and keyboard ownership were not replaced.

| Finding | Frontend action / remaining boundary |
| --- | --- |
| Reply quotes were not interactive; no missing-original navigation/context loader existed. | Added ID-based cache/network lookup, measured navigation, highlight, and presentation-only context. |
| Message normalization discarded authors and nested reply details; incoming labels used the conversation receiver, which is wrong for groups. | Preserve existing message author/reply fields and conversation participant data in local metadata; use each sender's identity. |
| An early visibility report could arrive before session/focus effects and never be replayed. Foreground return did not explicitly reconsider the viewport. | Retain viewport IDs, replay eligibility on session/focus/foreground/data availability, and request native viewability recalculation. |
| Eligible reads waited another 250 ms after FlatList's own view-time threshold. | Removed that application delay. Persist/dispatch as soon as native eligibility is reported. |
| Read/delivery handlers waited for every outgoing operation, including unrelated uploads. | Apply known-ID receipts immediately; defer only unresolved canonical identities. |
| A pending delivered-HTTP request could block the shared read outbox drain. | Independently drain reads over the same socket; delivery HTTP cannot hold them up. |
| Client expected its own read echo, but the backend sends reads only to the sender and has no read ACK callback. | Durable per-connection claims prevent repeated online emission. Reconnect replays unconfirmed reads. A fresh recipient-specific DM history READ can confirm them; never treat `emit()` itself as confirmation. |
| Backend history fetch mutates `lastReadAt` and emits a read event without visibility. | **Backend blocker, not fixed.** |
| Backend cursor filters only by timestamp and lacks deterministic tie ordering. | Reply search uses the already-supported `page`/`limit` API; existing general cursor limitations remain. |
| Backend requires a single `receiverId` and has only shared message read flags, not individual group receipt records. | Client direction/author handling is corrected, but real group synchronization remains a server blocker. |

## 2. Reply navigation and context

### Finding an original

- Quote taps, text-reply taps, and composer quote taps use the existing original ID. Attachment controls keep their own viewing/playback/download action; long-press remains available for replying.
- A scoped SQLite lookup and indexed cached range make an older cached original available offline without discarding the latest loaded messages. Direct reply lookup also includes replies preceding an outgoing parent’s immutable local timestamp when device/server clocks differ; existing insertion keys/order are not silently rewritten.
- An explicit, cancellable search walks the existing history endpoint in pages of 100 through the original. No invented `/around` or `/replies` endpoint, guessed server message fields, or alternate message store was added.
- Replies several hundred messages away are covered by automated cases: 625 remote messages, timestamp ties in the deterministic test server, and more than 600 cached messages offline.
- Missing/deleted/foreign-room targets produce a notice or cached/incomplete result, not a fabricated historical message or a jump to latest. Loading has a visible cancellation action. New navigation, blur, unmount, and room/account transitions invalidate obsolete navigation work.

### Scrolling and highlight

`ReplyNavigator` tracks the target by server/local identity, not a stale numeric index. It uses native `scrollToIndex`, a bounded average-length fallback for unmeasured cells, and exact coordinates from a forwarding cell renderer. Refinement is driven by actual measurement, viewability, and momentum events—not timeouts, repeated animation frames, fixed-height `getItemLayout`, or manual history compensation.

Already-visible originals highlight without an unnecessary scroll toward the bottom. Navigation leaves latest-sticky mode; new messages, context loading, media layout, and keyboard measurements do not intentionally send the reader to offset zero. A temporary native-driver opacity highlight identifies the target. Native MVCP remains the sole normal history anchor. Extremely variable rows still require device testing; no-progress/failure paths allow retry instead of endlessly scrolling.

### Context without history reordering

A `reply-context` presentation item is placed visually above the original. It contains chronological, type-aware **previews**, five per page, with sender names/avatars and an explicit “Original message below” relationship. Tapping a summary locates its canonical message. These summaries are not copied message rows, are not marked read as full messages, and never change persisted order or canonical message IDs.

The full reply set is indexed separately from the visible context page; nested replies are not falsely classified as direct replies to another parent. Cached/offline results explicitly say they may be incomplete.

“Complete” internally means the available API traversal reached the parent, **not** a server-snapshot guarantee. Concurrent deletions, nondeterministic timestamp ties, missing server pages, and the backend's existing cursor behavior cannot be fully repaired without backend changes. The UI says how many replies were found rather than promising a permanently complete thread.

### Authors and stored previews

SQLite v2 adds local-only `sender_data`, `reply_data`, `attachment_data`, conversation `is_group`/`participants_data`, and receipt-attempt metadata. These copy fields already present in message/conversation/upload/picker contracts; they are not new backend message fields.

- Existing participant data supplies display names omitted by the message endpoint, with a bounded 20-room parsing cache. Cached legacy rows can be enriched offline when that roster exists.
- Current-user/other-participant names and avatars are kept distinct. Unknown legacy group authors remain unknown rather than being assigned another participant's name.
- Previews distinguish text, photo, video, voice/audio with known duration, documents with filename/type, shared posts, and shared stories. Scoped, bounded local-parent lookups hydrate missing thumbnails/durations without inserting those parents into the visible timeline; receipt-only changes do not trigger unconditional hydration.
- Outgoing replies preserve a bounded original snapshot even if sending fails offline.
- Editing/deleting an unloaded original updates only the loaded dependent previews. Snapshot redaction is transactional and survives stale/out-of-order history and reopening; deleting an original does not expose its old text through its quote.
- Text and attachment replies retain the target. Media sends now include the existing DTO's `type`, `thumbnailUrl`, and `duration` fields. Multiple selected attachments still become individual messages, as before; no unsupported album schema was introduced.

## 3. Read-receipt synchronization

Eligibility requires:

- The chat is focused and the app is active.
- The chat is not covered by its video modal, attachment picker, or file share sheet.
- FlatList reports a fully visible small item or at least 50% viewport coverage for an oversized item, with the existing 300 ms native minimum-view period. Media resource visibility is separately tracked at 1% without a read acknowledgment.

This accommodates long text/media that cannot occupy 50% of its own height inside a short viewport. After eligibility there is **no additional read timer**.

```text
native eligible viewport
 → deduplicated received-message IDs
 → atomic SQLite READ + unread delta + durable read outbox
 → independent socket read drain immediately
 → existing backend write/Kafka broadcast
 → sender receipt handler, without unrelated-send barrier
 → targeted SQLite row commit/publication
 → only affected rendered message/model
```

Delivery alone never qualifies as read. Own messages, tombstones, inactive/covered screens, and context previews are excluded. Duplicate in-flight visibility reports are coalesced. The outbox claims a read once per socket-connection token while retaining it until authoritative confirmation; a new connection can replay it idempotently. No arbitrary timer was added to disguise synchronization.

Known messages update immediately. A bounded 512-entry unresolved-ID metadata buffer handles read-before-REST-confirm races, including confirmation between lookup and registration. It is cleared with the socket/account lifecycle; server-persisted history remains the recovery authority. A receipt from another group member does not mark this user's incoming message as personally seen. Only an explicit other-reader receipt for this user's outgoing message changes its outgoing read indicator; id-less/actor-less events cannot bulk-mark unrelated messages.

**Remaining server limits:** sender-only broadcasts cannot positively acknowledge the recipient's queue; group-wide status cannot prove which member viewed a message; fetch-triggered false reads remain indistinguishable on the client. Unconfirmed records may remain queued until a qualifying DM refresh or future compatible server acknowledgment.

## 4. Bubble redesign and resource ownership

Shared design: existing violet/white tokens, a soft outgoing tint, rounded corners, consistent padding/metadata, distinct alignment, real author identity on replies/groups, accessible actions, and clear sent/delivered/read/failed states. No unrelated chat header, wallpaper, composer keyboard system, or post/auth redesign was performed.

- **Images:** Expo Image memory/disk caching, responsive fit to known aspect ratio, loading reservation/indicator, error/retry, and the existing full-screen viewer. No intentional cropping/stretching. Geometry caching is bounded to 256 URIs.
- **Voice/audio:** native player is created only after play, with play/pause/retry, duration, seek/progress, native error handling, and 200 ms player-local updates. Actual supplied samples are resampled once; missing samples use a plainly labeled progress rail. Random wave generation and animated fake equalizers are removed. File-backed audio titles can be shown.
- **Videos:** cached poster/neutral unavailable-preview fallback, duration when known, centered play, no eager playback, and a user-opened native player with contain fit, errors/retry, speed control, rotation, and close/disposal. A missing video thumbnail is not replaced with a fabricated one.
- **Documents:** file-specific icons, truncated filename/extension, known or explicitly unavailable size, real download bytes/progress, downloaded/open/share state, and retry. Downloads use two concurrent native transfers, per-file subscriptions, bounded RAM state, app-private account partitions, temporary `.part` files and final promotion. Existence is rechecked after remount/restart; incomplete files are not treated as ready. Logout/account change cancels transfers and clears private downloads. Incoming remote messages cannot request arbitrary local-file access.
- **Resources:** one user-selected chat player claims playback; previous chat playback pauses. Offscreen/blur/background players are gated, and native hooks own disposal. Downloads survive row virtualization intentionally, without keeping React row listeners mounted. Existing original-attachment opening menus and shared post/story routes remain.

### Native dependency/build requirement

`expo-file-system@56.0.8` is now a direct dependency at the **same version already supplied transitively by Expo**. `expo-sharing@56.0.17`, the version specified by this SDK's bundled modules, is added for safe native file opening/sharing. No React Native/Expo upgrade or third-party chat framework was introduced.

**Rebuild the development client/native app to enable the new sharing module**, for example with `npx expo run:android` or the project's normal EAS/native workflow. Sharing is imported lazily, so a missing native sharing module does not crash text chat at startup. JavaScript/Hermes exports do not substitute for native linking/build verification.

## 5. Performance and verification

- FlatList, stable `localId`, native MVCP, independent composer state, and incremental row models remain. Render window is 9 viewports, initial batch 12, subsequent batches 8.
- Indexed room/order/reply queries and dependency indexes avoid per-row reply scans. Context renders five summaries, not an unbounded nested list.
- Receipts do not reload latest history or reset the loaded timeline. Player progress and document progress update their own subscribed component, not the whole chat.
- Snapshots of edited/deleted originals are maintained without publishing every reply body. Native geometry and profile parsing caches are bounded.
- Active loaded history still grows when navigating far back; it is not a hard-bounded history-window implementation. Existing explicit return-to-latest reclamation remains. Explicit downloaded files have no new disk quota/eviction policy beyond account cleanup.

| Check | Result |
| --- | --- |
| Full regression suite | **186 passing tests**: 137 messaging + 21 posts + 28 auth. |
| Reply/cache/context coverage | Text and all six other supported original types; media replies; rich metadata; offline failures; 625-message remote and 600+ cached lookup; cancellation; deleted/foreign parents; chronological paged context; measured ID-based navigation; stale edit/delete redaction. |
| Receipt coverage | Early/focus/foreground replay, no touch requirement, immediate transaction, duplicate reports, modal coverage, unrelated pending sends, slow delivery HTTP, canonical-ID races, reconnect replay, group direction, and subscription cleanup. |
| Bubble/download coverage | Sending/sent/delivered/read/failed, image loading/retry/aspect, lazy audio/video resources, real-sample versus absent-waveform behavior, play/pause/seek/error/retry/background/unmount, document progress/retry/partial files/account cleanup and share-sheet coverage. |
| Migration | Real in-memory SQLite adapter: v0 repair and additive v1→v2 preservation, indexes and receipt replay/claim semantics. Not a physical-device WAL/restart test. |
| Browser layout review | Actual React Native Web bubble/context components at `320×568`, `393×873`, `430×932`, `844×390`, `1024×1366`; horizontal bounds, 44-unit touch actions, context paging, simulated play/pause and download progress/error. Native media/network/storage adapters mocked. |
| Android/iOS exports | Both Hermes bundles exported using Expo offline export. Not native binaries. |
| Typecheck | Same two baseline errors: missing `@react-native-community/netinfo` and consequent implicit-any state in unchanged `useScreenState.ts`. |
| Lint | Changed production/test files: **0 errors / 222 existing warnings** in legacy tab/picker/shared-card files. Project lint: **14 errors / 2,010 warnings**; remaining errors are unrelated to this upgrade. |
| Whitespace and scope | Checked against the baseline; protected post/auth/theme/provider/API files remain unchanged. |

Synthetic benchmark: [`messaging-upgrade-benchmark.json`](messaging-upgrade-benchmark.json). It compares against original commit `c0b7d99`, **not** the immediately preceding refinement. The earlier rendering optimization is preserved: 50 receipts over 30 representative rows render 50 message rows, and a 5,000-row receipt changes one row model. Timing varies with sandbox CPU contention. This is not new measured POCO FPS, native frame time, heap usage, or battery evidence.

## 6. Exact file inventory

- Screens: `src/app/(chatRoom)/privateRoom.tsx`; `src/app/(tabs)/messages.tsx` (group routing flag only).
- Chat components: `src/components/chat/ChatComposer.tsx`, `ChatMessageRow.tsx`; **new** `ChatReadVisibility.tsx`, `MeasuredMessageCell.tsx`, `ReplyContext.tsx`.
- Message components: `src/components/messages/MessageCard.tsx`, `ImageMessage.tsx`, `VoiceMessage.tsx`, `Videoplayer.tsx`, `MediaPickerModal.tsx`, `SharedPostCard.tsx`, `SharedStoryCard.tsx`; **new** `DocumentMessage.tsx`, `MessageMeta.tsx`, `ReplyPreview.tsx`.
- Hooks: `src/hooks/useChat.ts`, `useChatMediaPlayback.ts`, `useRooms.ts`.
- Services: `src/services/MessageService.ts`, `SocketReceiver.ts`, `MessagingCache.ts`; **new** `DocumentDownloads.ts`.
- Database: `src/db/schema.ts`, `migrations.ts`, `getQueries.ts`, `insertQueries.ts`, `updateQueries.ts`, `MessageStore.ts`, `receiptQueue.ts`; **new** `replySnapshots.ts`.
- Models/utilities: `src/utils/messaging/listItems.ts`, `serialization.ts`, `timeline.ts`; **new** `presentation.ts`, `replyNavigation.ts`, `mediaGeometry.ts`, `roomAuthors.ts`.
- Contracts/dependencies: `src/types/index.ts`, `package.json`, `package-lock.json`.
- Tests: `test/messaging/harness.cjs`, `hooks.test.cjs`, `media.test.cjs`, `socket.test.cjs`; **new** `replies.test.cjs`, `bubbles.test.cjs`, `downloads.test.cjs`, `migration-v2.test.cjs`.
- Reports: this audit, `docs/messaging-upgrade-benchmark.json`, and the historical note in `docs/messaging-audit.md`.

No backend source/patch, auth screens/service/store, post positioning, global socket/keyboard providers, theme palette, auth/post tests, or existing benchmark report was rewritten.

## 7. Remaining release verification

No Android SDK/emulator, iOS simulator, two physical devices/accounts, verified live backend, or POCO X3 performance run was available. Test adapters simulate participant IDs and events; they are **not a live two-device test**.

Before release:

1. Rebuild/link native sharing. Back up `app.db` and WAL and exercise a real v1→v2 installed-app upgrade, crash/restart, logout, transfer cancellation, and disk-full/unavailable-file cases.
2. On two accounts/devices, send → deliver → expose a stationary message → observe the sender without touching either screen. Repeat while uploads and delivery HTTP are pending, across background/foreground and network interruption. Deploy the backend fixes first if visibility-only correctness is required.
3. On the backend, remove read side effects from GET history; acknowledge individual committed reads idempotently; implement proper group fan-out/per-member persistence; and make pagination deterministic by timestamp plus ID. No frontend test can prove those server fixes occurred.
4. On iOS/Android, navigate hundreds of variable-height messages, cancel/retry, receive messages during navigation, edit/delete unloaded originals, page context, return from viewers, rotate, and show/hide the keyboard without losing the reading anchor.
5. Profile release builds on POCO X3/mid-range Android: scroll frame times, native image/player memory, rapid media switching, long conversations, and file/background behavior. Missing legacy remote dimensions/thumbnails/file sizes/waveforms remain honest fallbacks, not invented data.

Publication branch: `arena/e4dfc24a-socialapp`. No other repository or branch was modified.
