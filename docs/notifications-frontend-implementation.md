# Notifications / Activity — frontend implementation

Date: 2026-11-01
Frontend baseline: `b75300496743629933c2c83e94e8e1897d6f6248`
Branch / existing PR: `arena/e4dfc24a-socialapp` · [socialApp PR #2](https://github.com/77elijah78/socialApp/pull/2)

**Implemented and locally validated; not production/device-certified.** The real contracts were inspected in backend commit [`12e570c4ba0ce21dbc8c25325314b547e52e9534`](https://github.com/77elijah78/nodejs-socialapp/commit/12e570c4ba0ce21dbc8c25325314b547e52e9534), including its Activity routes/service, notification producer/consumer, Prisma schema, and post/profile routes. At verification, that code remained in open [backend PR #2](https://github.com/77elijah78/nodejs-socialapp/pull/2); backend `main` remained `eb79c440ae38f0f120b8301c59ff64904b67c7bc`. Repository source is **not** evidence of deployment.

## 1. Files changed

| File | Responsibility |
| --- | --- |
| `src/services/NotificationService.ts` | Actual REST adapter, validated DTOs/socket envelopes, stable-ID ordering/deduplication, destinations and relative time; preserves the legacy persist migration. |
| `src/services/NotificationsController.ts` | Single-flight requests, optimistic mutation coordination, shared-socket listeners, reconnect/foreground recovery, cancellation and account/session guards. |
| `src/store/slices/notificationsSlice.ts` | Account-scoped history, pagination, unread count, load/errors, per-operation optimistic read/rollback and stale-response protection. |
| `src/hooks/useNotifications.ts` | One coordinator per existing Redux store; root subscription hook and shared command access. |
| `src/components/notifications/ActivityRow.tsx` | Real actor/preview content, authenticated avatar/thumbnail, type icon, server-relative time, unread marker, profile/post/read actions and media fallbacks. |
| `src/components/notifications/ActivitySkeleton.tsx` | Six loading rows using the existing shared shimmer/reduced-motion primitives. |
| `src/app/(tabs)/notifications.tsx` | Activity screen, loading/empty/retry/refresh/pagination states, read-all, clock and navigation. |
| `src/app/(tabs)/_layout.tsx` | Existing Activity tab badge/accessibility label, capped visually at `99+`. |
| `src/app/_layout.tsx` | Registers Activity synchronization in the existing SocketProvider; removes the obsolete session-only subscription. |
| `src/app/posts/[id]/index.tsx` | Real selected-post resolution and safe loading/unavailable/back/retry states; renders the existing author collection. |
| `src/components/posts/PostCollection.tsx` | Optional selected detail entry, explicitly labeled when separate from author page one. |
| `src/hooks/usePosts.ts` | Selected-entry deduplication/mutations, entry survival when the surrounding page fails, and authoritative count refresh when like membership is unknown. |
| `src/services/api.ts` | Compatible `ApiError` HTTP status metadata for unavailable-content/backend-release handling. |
| `test/activity/activity.test.cjs` | Updated contract/reducer/privacy/migration/pagination regressions, replacing obsolete no-history assumptions. |
| `test/activity/sync.test.cjs` | REST, mutations, socket recovery, races, cancellation, account isolation and pagination tests. |
| `test/activity/screen.test.cjs` | Mounted Android-branch UI/navigation/badge/media/selected-post regressions. |
| `test/activity/socket-bridge.test.cjs` | Actual shared SocketReceiver integration and listener/connection ownership regression. |
| `test/activity/fixtures.cjs` | Backend-shaped test records/events only; no runtime mock notifications. |
| `test/activity/server-double.cjs` | Deterministic HTTP/socket/AppState test doubles only. |
| `docs/notifications-frontend-implementation.md` | This six-part delivery and release checklist. |
| `docs/notifications-frontend-evidence.json` | Test results, exact bundle/asset/source hashes and unchanged manifest evidence. |

No backend files, native configuration, framework versions, package manifests or lockfile were changed. The unrelated `backend-delivery/` directory was left untouched.

## 2. Components, navigation and state

### Audit and architecture

The previous screen stored sparse, session-only events with content-based client keys and an obsolete claim that no history/read API existed. That implementation has been replaced, not layered beneath a second notification store.

- Reuses the existing Redux slice, HTTP client/token refresh, SocketReceiver/MediaService singleton, LiquidGlassTabBar, theme, authenticated image loader, shared skeleton driver and native-stack detail transitions.
- History remains memory/account-scoped, not persisted as unscoped private data. The existing persist migration still removes legacy notifications. Login/logout/account-session changes clear history and badges immediately; stale same-account logout/login callbacks are rejected as well.
- Initial authentication starts an asynchronous unread sync without adding an awaited startup gate. History is fetched when Activity is opened. An unopened session retains only 20 live preview rows; opening the tab loads durable history rather than relying on those previews.
- The FlatList uses stable server IDs, variable-height bounded text, batches of 8 and window size 7. There are no fixed-height scroll guesses, per-row clocks, players, timer-based scrolling corrections or new runtime dependencies.
- One minute clock runs only while Activity is focused and foregrounded. Listener cleanup does not disconnect messaging's shared socket.
- Pull-to-refresh, pagination retry and reconnect/foreground/focus reconciliation use the real REST feed. A recent refresh uses at most 100 rows in one request. Overlapping prefixes retain the loaded tail; a larger missed burst resets to a contiguous prefix rather than preserving a hidden pagination gap. Offset boundaries intentionally overlap when necessary, then deduplicate by ID. An authoritative zero unread count marks the entire retained tail read. Unexpected nonzero read-count changes rebuild the prefix rather than retaining stale older read flags, including changes discovered while paginating. Old out-of-window socket envelopes cannot advance the page or inflate its count.
- Individual/read-all changes are optimistic, scoped per operation, and roll back only their own unread delta and flags. Arrivals and independent reads survive rollback. A fresh REST snapshot follows success or failure, including ambiguous acknowledgements that may have committed on the server.

### Rows and destinations

- LIKE, COMMENT (including replies), FOLLOW, SHARE, MESSAGE and MENTION render their actual backend content. Replies remain `COMMENT`, with the server's “replied to your comment” wording and available comment preview; no invented `REPLY` enum is introduced.
- Avatar or username → `/user/[username]`, using the real REST username, never an actor UUID as a username.
- FOLLOW row → actor profile.
- LIKE / COMMENT / reply / SHARE → `/posts/[id]`. A real `GET /posts/:id` resolves the post author, then the existing `PostCollection` shows the selected post with paginated author posts and existing comment/share/like/bookmark controls. Notification actor and post author are not assumed to be the same person.
- For an older post outside author page one, the selected post is explicitly labeled and shown first, followed by the author's paginated feed. No page/rank is invented and the author's entire history is not scanned. Existing profile-grid page/selection behavior is unchanged.
- MESSAGE → the existing Messages tab, not a guessed conversation ID.
- MENTION → a post only if the REST post preview proves that target; otherwise an explanatory unavailable-destination state. The pinned backend has no verified mention producer/resource-kind contract.
- Missing/deleted actor/post previews render safe fallbacks; unavailable post GETs handle 403/404 with back/retry. Network failures are not treated as successful empty data. Image failure keeps a real fallback, never a fabricated thumbnail.

Comment/reply entries open their post in the feed experience, not a standalone comments page. The post's existing Comments action opens the existing paginated comment sheet; this implementation does not pretend to locate an arbitrary exact reply without a backend position/context contract.

## 3. Exact consumed endpoints

All paths below are relative to the existing authenticated API origin and `/api/v1` prefix. No `/notifications` route or alternative auth transport was introduced.

| Direct Activity request | Request / response used |
| --- | --- |
| `GET /api/v1/activity?page=N&limit=L` | `L=20` for regular pages; up to 100 for bounded refresh. Standard `{success,data:{items,total,unreadCount},meta:{page,limit,hasNext,...}}`. |
| `GET /api/v1/activity/unread-count` | `{success,data:{unreadCount}}`. |
| `POST /api/v1/activity/read` | `{ids:[UUID]}`; adapter enforces the server's 1–200 UUID limit. Response `{success,data:{count}}`, including valid idempotent `count:0`. |
| `POST /api/v1/activity/read-all` | `{}`; response `{success,data:{count}}`. Server operation covers all of the authenticated user's unread records, not just loaded rows. |

Reused navigation/post flows:

- `GET /api/v1/posts/:id` resolves the selected post and author, handles unavailable content, and refreshes real like count when detail membership is unknown.
- `GET /api/v1/posts/user/:username?page=N&limit=20` supplies the existing paginated author feed.
- `GET /api/v1/users/:username` supplies the existing actor profile.
- Existing post/profile actions remain on their existing contracts: `POST/DELETE /posts/:id/like`, `POST/DELETE /posts/:id/save`, `GET/POST /posts/:id/comments`, and `POST/DELETE /users/:username/follow`, all under `/api/v1`. The existing overlay owns comments and sharing; Activity adds no competing implementation.

Actor/post/comment previews are nullable REST data. Sparse socket events do not supply a username/avatar/read flag; new-ID unread state is only provisional optimism until REST reconciliation. No synthetic event ID or receipt timestamp substitutes for persisted server metadata.

## 4. Exact socket events

Uses the **existing** shared SocketReceiver, with no new connection, room protocol or backend event name.

| Existing event | Activity handling |
| --- | --- |
| `notification:new` | Consumes `id`, optional `commentId`, `createdAt`, `type`, `content`, `actorId`, `resourceId`. Previously unseen stable IDs update the visible row/badge optimistically and trigger REST hydration. Known IDs never duplicate rows or reset confirmed reads. |
| `connect` | Reconciles unread/history after connection or reconnection. |
| `disconnect` | Updates connection UI; keeps durable REST history available. |
| `error` on the SocketReceiver facade | Updates connection UI from the real connection state. This is the existing forwarding of native Socket.IO `connect_error`, not a new notification backend event. |

Legacy SHARE producers can still emit `notification:new` without ID/time. Such payloads are REST invalidation hints only: persisted records are recovered with their real IDs/timestamps, not content-coalesced into fictional rows.

AppState is a native lifecycle subscription, not a socket event. Background signals do not perform history/count work; in-flight list/count requests are cancelled and foreground resumes reconcile. Explicit user mutations may finish. Account stop/unmount cancels requests, removes listeners and releases pending optimism; stale callbacks cannot update another session. There is deliberately no invented `notification:read` event.

## 5. Test results and production-mode exports

| Check | Result |
| --- | --- |
| Pre-change regression baseline | **387/387 passed**. |
| Focused Activity suite | **72/72 passed**, 4,529.88 ms. Replaces the 6 obsolete Activity tests; includes actual SocketReceiver integration with native/network doubles. |
| Full regression suite after implementation | **453/453 passed**, no failures/skips, 72,896.33 ms. |
| `npm run typecheck` | Passed. |
| Scoped ESLint | 19 implementation/test files, **0 errors / 0 warnings**. |
| `git diff --check` | Passed. |
| Production-mode Android Hermes export | Completed. |
| Production-mode iOS Hermes export | Completed. |

Coverage includes every actual enum and reply wording; actor/post/message navigation; long text; private avatar/thumbnail headers; skeleton/empty/error/refresh/infinite-scroll states; optimistic badge/read-all rollback with unloaded records; duplicate delivery; stale GETs; old envelopes; cross-device deep-tail read-all/partial-read recovery; ambiguous writes; reconnect/background recovery; listener cleanup; auth/account ABA; deleted targets; older selected post entry; and unknown-membership like count handling. The full suite retains messaging, media, comments, author selection, auth and dependency regressions.

Both platforms were compared with a fresh export of the exact frontend baseline, using the same installed dependencies and `CI=1 EXPO_OFFLINE=1 NODE_ENV=production EXPO_PUBLIC_API_URL=https://api.test`, two Metro workers:

| Platform | Baseline Hermes bytes | Updated Hermes bytes | Delta | Assets |
| --- | ---: | ---: | ---: | --- |
| Android | 6,578,787 | 6,628,955 | +50,168 (+0.762572%) | 46, byte-identical |
| iOS | 6,394,849 | 6,444,813 | +49,964 (+0.781316%) | 43, byte-identical |

Exact hashes and source/manifest provenance are in `notifications-frontend-evidence.json`. Generated bundles/caches are not committed. Test wall time under concurrent exports is not a device startup/FPS measurement.

**Not performed:** two physical devices/accounts against a deployed backend, production APK/AAB/native iOS builds, native installation, live Kafka delivery, production permissions/offline/reconnect certification, APK size, cold-start timing, FPS or memory measurements. Exports and renderer doubles do **not** certify the approximately 128 MB / sub-second-startup targets or production readiness. Existing dependency audit findings were not remediated by this feature.

## 6. Backend dependencies and release gates

### Required to enable real persisted Activity

1. Deploy the inspected backend Activity implementation (PR #2 / `12e570c4…` or a verified compatible successor). Current checked backend `main` does not contain these routes. The frontend reports an explicit backend-release requirement for unavailable Activity endpoints instead of falling back to mock history.
2. Apply the backend-owned `20261031000000_media_comments_activity` migration as part of that release. Its Notification fields/relations/indexes and transactional outbox support belong to the backend session; no migrations or live DB mutations were performed here.
3. Run/verify the backend's authenticated Socket.IO personal-room connection, Kafka consumer and durable outbox publication for LIKE, COMMENT/reply and FOLLOW. Configure the real reachable HTTPS API origin for the release build; source inspection is not proof those services are deployed.

### Existing protocol limitations handled explicitly

- Legacy SHARE is persisted but not fully converted to the new stable-ID transactional socket envelope. REST recovers its real record; no frontend-generated identity disguises the gap.
- No notification-read socket broadcast exists. Local reads/new arrivals update immediately; another device's reads reconcile on focus, refresh, reconnect or foreground—not through a fictional push event.
- Offset pagination has no snapshot revision/cursor. The frontend deduplicates and repairs boundaries; a missed burst beyond the bounded refresh window, or an unexpected change in older read state, resets older loaded pages rather than claiming a gap-free retained tail.
- There is no post rank/context endpoint or arbitrary comment-position endpoint. Older selected posts use the labeled detail-entry/author-feed experience described above. Exact chronological surrounding-page or reply-position jumps require a real backend contract.
- The single-post GET omits like/save membership. Existing knowledge flags remain honest; confirmed like writes re-read the real count rather than permanently inventing an increment. Authorization, post/profile visibility and 403/404 enforcement remain backend responsibilities.

### Required manual production gate (pending)

Use two real accounts on two physical devices against the deployed release: create a post; like/comment/reply/follow/share from the other account; verify actor/avatar/thumbnail, server ID/time, author-post destination, read/unread and read-all across unloaded pages. Repeat with background/foreground, dropped connectivity, process restart, token refresh/account switching, duplicate delivery and a large missed burst. Test deleted/inaccessible users/posts and video/text-only previews. Confirm navigation back preserves existing tab/feed/chat state and media/receipt behavior. Finally install signed native production builds and measure APK/AAB size, cold start, scrolling, memory and permissions on target Android devices (and iOS if shipping it).

No backend merge/deployment, live database change, production readiness approval, or physical-device certification is implied by this delivery.
