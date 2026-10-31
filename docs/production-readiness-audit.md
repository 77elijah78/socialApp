# SocialApp — production-readiness frontend audit and repair

**Date:** 2026-10-31. **Frontend baseline:** `44aabd7a5c683bfc957ffdbf591bd3e32b08b704`. **Working branch:** `arena/e4dfc24a-socialapp`. **Backend inspected read-only:** [`77elijah78/nodejs-socialapp` main `eb79c440ae38f0f120b8301c59ff64904b67c7bc`](https://github.com/77elijah78/nodejs-socialapp/commit/eb79c440ae38f0f120b8301c59ff64904b67c7bc).

**Verdict: frontend repairs and automated/build checks completed; NOT production-readiness certification.** The requested two-account, two-physical-Android-device production verification has **not** been performed. No APK/AAB was built or installed. The reported approximately 128 MB APK and sub-second startup were user observations, not measurements reproduced here. Backend capabilities still limit comments and activity; dependency advisories also require review. Nothing was merged, deployed, or changed in the live database.

## 1. Initial audit, root causes and disposition

The mounted consumer and backend routes/services were inspected before implementation. Both group ChatRoom and direct PrivateRoom use `src/app/(chatRoom)/privateRoom.tsx`, `isGroup`, `useChat`, existing SQLite message storage and the common `ChatMessageRow` → `MessageCard` path. The older `MessageBubble` is **not** this active renderer. `MediaService` exposes `.message` and the shared `.socket`; it does not have separate `.video`/`.audio` services. The initial baseline suite passed **282/282**.

| Issue | Actual cause / contract finding | Frontend disposition and boundary |
| --- | --- | --- |
| Sender and recipient cannot load uploaded media | Four services duplicated configuration and silently fell back to a developer LAN address. Backend `buildUrl` uses `BASE_URL`, with a `http://localhost:3000` default. Those returned strings previously crossed the wire and entered SQLite unchanged. | One explicit API origin, no built-in LAN fallback. Normalize only verified owned `/uploads/{images,videos,audio}/filename` routes at upload, outgoing-wire, incoming-normalization and display boundaries. Reject unusable/device-local remote URLs. Real public HTTPS origin, static hosting/range support and both-device access still need deployment verification. |
| Authenticated multipart / retry failures | The XHR uploader bypassed the HTTP client's token-refresh path; retry MIME came from a filename instead of available actual MIME metadata. | Shared authenticated multipart transport, refresh single-flight, auth-generation guards, full FormData preservation, timeout/network/abort errors. MIME/name/known-size checks follow the inspected backend. Malformed legacy attachment JSON now uses the existing bounded safe parser even after upload succeeds. |
| Images remain thumbnails or fail without reaching the original | Active `ImageMessage` used `thumbnail || uri` as its sole source. | Original image is always the source; thumbnail is an optional placeholder. Existing loading/error/retry/full-image/zoom/cache behavior remains. Picker permission denials and thrown native selection errors are surfaced without a fake send. |
| Video / voice reliability | Bad URLs affect both existing Expo players. Their native codec/playback behavior was not established by prior tests. Async setup also needed a route-focus guard in addition to visibility/AppState gates. Feed cards omitted `videoUrl`. | Reuse existing players and resource ownership. Add blur/late-play protection; voice uses non-background `doNotMix` audio mode. Video remains deliberate-play only; feed video lazily reuses the existing preview and measures its actual container, with reserved responsive geometry. No transcode, codec guarantee or invented video thumbnail. |
| Fast swipe animates but does not select | Completion previously required net distance at finger-up. A fast swipe can cross completion and rebound below it. END coordinates may also lag final touch-up. | Latch a real 48-point crossing, disarm deliberate reversal at 12 points, consume final changed-touch coordinates. Successful gesture END calls the existing JS callback immediately, independently of spring completion. Preserve vertical failure, one-finger, cancellation, selection and canonical-row guards. |
| Unreadable / narrow reply quotes | A flexible quote column was inside a shrink-to-content text bubble; text and metadata were not consistently bounded. | Responsive bounded reply-bubble width, readable line height, author line, two composer / three bubble lines and tail ellipsis. Snapshot copy is capped at 240 characters with honest ellipsis. Existing real image/video/audio/document/shared/deleted metadata is retained; missing data is not fabricated. |
| Secondary composer jump when keyboard closes | KeyboardController KAV moved the viewport while a separate JS `isVisible` change abruptly added bottom safe-area padding at hide completion. | Keep the existing KAV as positioning owner. Compose bottom inset continuously from that same controller progress, not a second keyboard-height listener/translation. Mocked progress cycles preserve input/reply identity; native Android IME/navigation-bar behavior remains a release gate. |
| Inconsistent detail navigation / duplicate headers | Root/detail stacks used platform defaults; bookmarks could combine native and custom headers. | Shared native-stack `slide_from_right` options, natural reverse native pop, custom-header ownership. Tabs remain mounted; auth fades and existing create/story modal exceptions remain. Bookmarks have one custom back header. |
| Comments falsely looked persisted / wrong ownership / counts | Both surfaces retained optimistic failures and simulated comment likes. Backend returns nested `author`, not response `authorId`/`postId`, and only the oldest 20 comments. | Shared confirmed-only hook, normalized real ownership, duplicate-ID suppression, real totals, failed-draft/error/retry/duplicate-send handling and account/post/open-session guards. Confirmed counts propagate to mounted post lists. No fabricated comment-like, delete or pagination route. |
| Profile grid / Liked tab / bookmarks | Tiles opened comments, grids eagerly fetched an initial large page without pagination; saved response was misread as `data.posts` instead of `data[]`; own profile fetched an unnecessary liked list. Merging author endpoint `user._count` could replace follower/following totals with posts-only counts. | Paginated grids and dedicated surrounding author feed at selected ID/page. Remove own Liked tab and its fetch/state/handlers only. Saved grid/list uses actual envelope and shared actions; confirmed unsave removes the member. Stop merging the partial posts-endpoint user into full profile statistics. |
| Activity was not backed by available API | NotificationService called nonexistent public `/notifications` routes. Actual live events are sparse, without ID/time/profile/read metadata. LIKE/COMMENT/FOLLOW notifications are stored but not published by the inspected services. | Replace speculative requests/fake read behavior with truthful session-only activity from the existing socket. Bound/coalesce received groups, account/logout isolation, verified navigation targets and explicit unsupported capabilities. Full durable activity remains a **backend gap**, not a completed frontend feature. |
| State / cache / credential races found during review | Token dependency changes reset loaded pages and pending comments; old GET/cache results could overwrite confirmed mutations. Draft locks could survive a reused routed resource/account. | Account/resource request epochs and token refs preserve same-account JWT rotation. Scoped cache renders before HTTP/timeouts, network success wins over late hydration, and mutation versions protect visible confirmed state/removals from older GETs. Reset routed draft/lock on actual resource/account change without keyboard remount; scope sheet composer by account. |

Existing selective post-input/comment-sheet keyboard restoration was preserved. This task did **not** retune its legacy detents/offsets or replace it with another footer strategy; the chat composer fix is separate.

## 2. Modified files and reasons

**66 frontend/config/documentation/test files** differ from the baseline. No runtime dependency, lockfile, framework upgrade, backend source, native generated project, binary, or build export is included. Historical untracked `backend-delivery/` is excluded.

### Configuration, transport and media boundaries

- `.env.example`: explicit public API-origin setup; no secrets/demo origin.
- `app.config.ts`, `src/config/api.ts`, `src/config/origin.js`: shared Expo-config/runtime origin parsing, request-time missing-config errors, production HTTPS/non-private-host gate and cleartext policy.
- `app.json`: retain resize/audio/video setup; configure the already-installed image-picker plugin and permission descriptions.
- `src/services/api.ts`, `src/services/BaseUploader.ts`: one authenticated multipart implementation, refresh/lifetime/error handling and normalized generic image/avatar upload responses.
- `src/services/AuthService.ts`, `src/services/MediaService.ts`, `src/services/SocketReceiver.ts`: use the shared origin without silent fallback; retain the existing singleton/provider/token/store integration. Correct the facade documentation to match mounted consumers.
- `src/services/MessageService.ts`: actual mounted media send/retry path; real MIME/metadata, safe legacy parsing and final public-URL wire validation.
- `src/services/MediaUploader.ts`: align the existing alternate uploader utility with shared MIME/URL/transport rules; **not claimed as the mounted chat sender**.
- `src/utils/mediaUrls.ts`, `src/utils/mediaUpload.ts`: constrained owned-upload normalization, signed/CDN URL preservation, local-display boundary and backend format/known-size checks.
- `src/utils/messaging/serialization.ts`: normalize incoming media before SQLite persistence.
- `src/components/messages/ImageMessage.tsx`, `src/components/messages/MediaPickerModal.tsx`, `src/components/messages/MessageCard.tsx`, `src/components/messages/VoiceMessage.tsx`, `src/hooks/useChatMediaPlayback.ts`: original-image source, picker errors/permissions, pending-local-only display, readable quote width and audio/focus lifecycle.

### Messaging, keyboard and navigation

- `src/components/chat/SwipeToReply.tsx`, `src/utils/messaging/swipeReply.ts`: real threshold latch, final-touch handling and successful END → JS reply selection.
- `src/components/messages/ReplyPreview.tsx`, `src/utils/messaging/presentation.ts`: bounded readable previews, real metadata and URL-safe thumbnails.
- `src/app/(chatRoom)/privateRoom.tsx`: same-controller animated bottom inset; preserve existing message/read/selection/history flow.
- `src/constants/navigation.ts`, `src/app/(chatRoom)/_layout.tsx`, `src/app/_layout.tsx`: shared detail transitions and existing provider/socket integration; root also subscribes to verified live activity.

### Posts, comments, profiles and collections

- `src/hooks/usePostComments.ts`: confirmed comment normalization/fetch/send, authors/totals/IDs and scoped request lifetimes.
- `src/utils/postUpdates.ts`: transient account-scoped confirmed update bus, not another persistent post store.
- `src/components/posts/CommentBottomSheet.tsx`, `src/components/posts/CommentThread.tsx`, `src/app/posts/[id]/comments.tsx`: real comment integration, honest partial-result notices, preserved failed drafts, no fake likes and resource-safe composers.
- `src/hooks/usePosts.ts`, `src/utils/postContracts.ts`: actual source envelopes, scoped cache, single-flight bidirectional pagination/retry, mutation ordering and author route parameters.
- `src/components/feed/PostCard.tsx`, `src/app/(tabs)/home.tsx`: existing card actions return confirmed promises, prevent duplicates and roll back errors; lazily render actual post videos using measured container width.
- `src/components/posts/PostCollection.tsx`, `src/app/bookmarks.tsx`, `src/app/user/[username]/posts.tsx`: shared responsive collection/list actions and bounded selected-author-page entry, with one header.
- `src/app/(tabs)/profile.tsx`, `src/app/user/[username]/index.tsx`: paginated grids → author-feed route, responsive sizing and removal of own Liked UI/fetch; retain full profile statistics separately.
- `src/types/index.ts`: explicit client knowledge flags for missing saved/like state; no invented backend schema fields.

### Activity, existing connectivity hooks and tests

- `src/services/NotificationService.ts`, `src/store/slices/notificationsSlice.ts`, `src/store/index.ts`: real sparse live normalization, capability/target rules, bounded account-scoped session state and legacy unscoped-activity migration.
- `src/app/(tabs)/notifications.tsx`, `src/app/(tabs)/_layout.tsx`: truthful live/disconnected/session UI; remove unsupported unread badge/server-read calls.
- `src/hooks/useNetworkStatus.ts`, `src/hooks/useScreenState.ts`: use configured `/health` and the existing health hook rather than a missing NetInfo dependency/new connectivity package. Preserve the existing nonblocking poll.
- `package.json`: include activity tests and add `test:activity`; dependencies unchanged.
- `test/activity/activity.test.cjs`, `test/auth/config.test.cjs`: sparse event/account/migration/capability and production-origin/missing-config coverage.
- `test/messaging/media-production.test.cjs`, `test/messaging/media-lifecycle.test.cjs`: multipart/MIME/URL/image/picker/focus/AppState/single-player regressions with explicit native/network doubles.
- `test/messaging/deletion-reply-contract.test.cjs`, `test/messaging/replies.test.cjs`, `test/messaging/swipe-reply.test.cjs`, `test/messaging/interaction-ui.test.cjs`: real supported media contracts, malformed legacy retry, rich reply bounds and all-type fast-swipe → persistent canonical composer → send coverage.
- `test/messaging/harness.cjs`, `test/messaging/gesture-driver.cjs`: configured test origin and realistic final changed-touch/stale-END support.
- `test/posts/collections.test.cjs`, `test/posts/comments.test.cjs`, `test/posts/card-actions.test.cjs`, `test/posts/input-layout.test.cjs`: actual envelopes, paging, counts, failed drafts/locks, token/account/resource races, offline cache, membership removal, selected-item anchoring and lazy video/container assertions.
- `docs/production-readiness-audit.md`: this seven-part audit, exact contracts and outstanding release gates.

## 3. Architectural changes and preserved behavior

### Media: actual end-to-end path

1. `MediaPickerModal` selects/captures Expo assets; `ChatComposer` supplies an Expo audio recording. URI, actual MIME/name and available size/dimensions/duration remain local metadata.
2. PrivateRoom's existing media handler calls `mediaService.message.sendMediaRecord` for both group and DM. MessageService creates the existing stable optimistic SQLite row. Only that device's unconfirmed outgoing row can display a local URI.
3. `mediaFileForUpload` validates the attachment and forms the multipart file. MessageService → BaseUploader → shared `uploadMultipart` sends authenticated FormData to the existing upload route. It does not manually set a multipart content type/boundary. Refresh retries retain **all** parts.
4. Validate/normalize the response URL and optional thumbnail. Merge genuine returned metadata into the same local row. At the final message/reply POST boundary, reject unusable remote values; local device URLs are never sent as persisted media URLs.
5. The existing backend persists the message and publishes Kafka → existing Socket.IO events. REST and socket messages use the same frontend normalization and SQLite reconciliation. No parallel socket or competing message store was added.
6. `MessageCard` uses existing Expo image/video/audio/download components. Image source is the original; video creates a native player only after deliberate playback; audio remains demand-loaded, with pause/progress/duration/error controls. Focus/visibility/background checks also gate late async playback.

Only recognized owned upload paths are rebased to the configured origin, including historical localhost/LAN uploads. Arbitrary external/CDN/signed URLs retain their exact escaping/query signatures. An external HTTP CDN URL is **not** magically changed to HTTPS; a production cleartext failure needs real HTTPS hosting/backend cleanup.

### Messaging and keyboard

- Existing native gesture stack, canonical row callback, React composer state and JS bridge remain. No animation-completion-only selection, velocity-only shortcut, timeout or forced refresh/navigation.
- Thresholds remain one pointer, horizontal activation 12, completion 48, visual maximum 72 and early vertical/ratio arbitration. A crossing can survive minor rebound; deliberate reversal, tiny/vertical/right swipes, cancellation/multitouch and selection remain non-replies.
- Reply state updates on successful gesture END, independently of the visual spring. Tests cover text, image, video, audio, document, shared post and shared story.
- Chat layout retains existing KeyboardController KAV and inverted FlatList. Safe-bottom padding uses `insets.bottom * (1 - clampedKeyboardProgress)`, eliminating the second JS hide-completion padding step. No extra keyboard-height positioning owner or scroll-to-end correction chain.
- Existing sent/delivered/read distinction, genuinely-visible per-ID read gates, exact ACK handling, group READ = **any other recipient**, stable optimistic identity, partial replies, deletion ledger/permissions, selection/Android Back, offline SQLite and history behavior are unchanged and remain in the full regression suite.

### Posts, navigation and activity

- One existing post hook owns each source's paging. It does not refetch merely because a page commits or the same account rotates JWT. Confirmed mutation events are account-scoped; older in-flight GETs cannot undo visible confirmed changes/removals. Feed cache is scoped as `feed:<accountId>:page1` with posts/total/hasMore, can render before HTTP, and survives a failed refresh.
- Profile grid navigation passes author username, selected post ID and containing page. The dedicated author list fetches that **bounded 20-post page**, not all preceding posts. Initial variable-height entry measures only that page, scrolls once after real layout, then removes measurement and uses native MVCP for prepends. It does not combine ongoing manual history anchoring with MVCP. A changed/missing selected post gets an honest notice instead of silently displaying a different selected item.
- Native back stack retains the underlying profile/grid context; no focus-driven profile remount or scroll-to-top correction was added. Live-device preservation still needs verification.
- Bookmarks provide theme-aligned grid/list modes, normal shared card interactions, real pagination/loading/empty/errors and one back header. A confirmed unsave removes the saved member and updates the total; failure does not pretend to remove it.
- Comments use server-confirmed rows and real totals only. A same-account token refresh does not discard a pending confirmation. Account/post/sheet changes reject late responses, and composer ownership prevents an old request from clearing or locking the next draft.
- Activity uses the existing SocketReceiver/provider. Stored entries explicitly have client-only grouping keys/receipt times and matching-delivery counts, capped at 100 groups. No server notification ID, creation time, actor profile or read state is fabricated. Logout/account change clears session activity, and persisted legacy account-unscoped activity is discarded without deleting auth/app state.

No new blocking startup request, runtime/native package, automatic media preload, second message store or server schema/migration was introduced. Post video reserves responsive frame geometry before lazy code resolves; width comes from the actual card container, not guessed screen padding.

## 4. Exact inspected backend contracts

All REST paths below are under configured-origin **`/api/v1`** unless explicitly noted. Source references are pinned to backend main `eb79c44`, not an unmerged backend branch. These are source-inspected contracts, **not evidence of a running deployment**.

### Upload and message contracts

Sources: [`media.routes.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/routes/media.routes.ts), [`media.controller.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/controllers/media.controller.ts), [`upload.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/middlewares/upload.ts), [`media.service.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/services/media.service.ts), [`message.service.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/services/message.service.ts), [`consumer.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/kafka/consumer.ts).

| Contract | Actual shape / constraints |
| --- | --- |
| POST `/media/upload` | JWT; multipart **`file`**. 201 `{success:true,data:{url,thumbnailUrl?,category,mimeType,size,width?,height?,filename},message}`. |
| POST `/media/upload/images` | JWT; multipart repeated **`images`**, at most 4. 201 same envelope with `data` array. Actual Multer limit 10 MB/image. |
| POST `/media/upload/avatar` | JWT; multipart **`avatar`**, image only, 5 MB. 201 data `{url,thumbnailUrl?,width?,height?}`. |
| Accepted media | JPEG/PNG/GIF/WebP; MP4/MOV/WebM/AVI; MP3/OGG/WAV/WebM/M4A/AAC. Backend MIME policy declares 10/200/20 MB for image/video/audio. **Mixed single-file Multer actually caps all categories at 200 MB**; frontend checks the declared per-category limit when size is known. No document or HEIC acceptance, transcoding, codec guarantee, video thumbnail or extracted audio/video duration. Sharp image thumbnails/dimensions are optional. |
| Public files | `${BASE_URL ?? 'http://localhost:3000'}/uploads/{images|videos|audio}/{uuid.ext}`; static mount supports ranges/cache. Production must serve it through the actual public HTTPS origin. |
| POST `/messages/conversations/:id/messages` or `/reply` | Existing JWT conversation send contract. Payload supports `content`, `type`, `mediaUrl`, `thumbnailUrl`, `duration`, and `repliedToId` for replies (plus existing receiver metadata where applicable). Server confirms canonical message ID/time. `attachmentData` is local-only, **not** a newly invented REST field. |
| `message:new` | Kafka → existing socket payload includes `id`/`messageId`, `conversationId`, sender/receiver IDs, `isGroup`, `readByMe:false`, `content`, `mediaUrl`, `thumbnailUrl`, `type`, `createdAt`, timestamp, sender summary and sparse repliedTo summary. It **omits duration and attachmentData**, although REST persists/returns duration. |
| `message:notification` | Sparse existing inbox/message delivery including IDs, sender, content/media/type/time/reply summary; normalization preserves richer known local data. Delivery/history is not treated as read. |

No outgoing local file/content/photo-library/blob path is accepted as a persisted media URL. Explicit LAN development API configuration remains possible; production-profile builds require HTTPS and reject recognized private/localhost hosts. This is syntactic configuration validation, not public DNS/TLS reachability testing.

### Posts, comments and collections

Sources: [`post.routes.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/routes/post.routes.ts), [`post.controller.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/controllers/post.controller.ts), [`post.service.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/services/post.service.ts).

- GET `/posts/:id` → `{success,data:post}`. `data.comments` contains **oldest 20**, ascending, nondeleted comments; `data._count.comments` is the real total. Comment fields include `id`, `content`, `createdAt`, `repliedToId`, nested `author:{id,username,avatarUrl}`. Normalize ownership from nested author and the requested post, not imagined response `authorId`/`postId`.
- POST `/posts/:id/comments`, JWT, `{content,repliedToId?:string|null}` → 201 `{success,data:comment,message}`. No public comment pagination, deletion, or comment-like route exists. The UI exposes none of those pretend operations. New comments beyond the oldest-20 window can disappear from a reopen response despite successful persistence; the partial-result notice explains the server boundary.
- GET `/posts/feed`, `/posts/saved`, `/posts/liked`, JWT, `?page=N&limit=L` → `{success,data:[post],meta:{page,limit,total,totalPages,hasNext,hasPrev},message}`. Saved membership proves `isBookmarked:true`, but this endpoint does not return requester engagement state.
- GET `/posts/user/:username?page=N&limit=L` (optional auth) → `{success,data:{user,posts,total},message}`. Posts are newest-first. Returned user's `_count` contains **posts only**; it must not replace full follower/following counts from GET `/users/:username`. The author endpoint's `isSaved:false` is hard-coded and is **not authoritative**; requester `isLiked` is enriched when authenticated.
- POST/DELETE `/posts/:id/like`, POST/DELETE `/posts/:id/save`: existing real mutations. Verified conflicts are `Already liked` / `Post already saved`; confirm requested state without fabricating another count increment. Unlike is idempotent.
- Removing the own-profile Liked UI does not remove backend `/posts/liked`, post likes, or like controls elsewhere.
- Existing share overlay still uses the existing post-share flow; no new share endpoint/event was invented.
- Paging is backend page/offset based. Concurrent insert/delete can shift pages; this client does not invent a stable cursor or fetch an entire author history to conceal that backend property.

### Activity and connectivity capabilities

Sources: backend [`routes/index.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/routes/index.ts), [`consumer.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/kafka/consumer.ts), post/user services and [`app.ts`](https://github.com/77elijah78/nodejs-socialapp/blob/eb79c440ae38f0f120b8301c59ff64904b67c7bc/src/app.ts).

- There is **no mounted public notifications REST/history/pagination/unread/read router**. No speculative request is retained.
- Existing `notification:new` wire payload is `{type,content,actorId,resourceId}`. It has no durable notification ID, creation timestamp, actor profile, read status or cursor. Types are LIKE, COMMENT, FOLLOW, MESSAGE, MENTION, SHARE; recognizing a type does not prove its service publishes it. SHARE publication is verified; like/comment/follow services only create database notification records in the inspected paths.
- Notification `user` in the database selection is the recipient, not an actor profile; it is not displayed as the actor.
- Identical sparse deliveries cannot be reliably separated into replay versus repeated genuine action. UI groups matching payloads with an explicit receipt count instead of asserting durable deduplication.
- Targets: LIKE/COMMENT/SHARE with resource ID → existing post comments route; MESSAGE → existing messages tab. FOLLOW has actor UUID, not a verified username lookup; MENTION lacks a verified resource type. Do not guess those routes.
- Existing unauthenticated **`/health`**, outside `/api/v1`, is mounted before maintenance guards and returns `{status:'ok',timestamp}`. The existing connectivity hook uses it, nonblocking.

## 5. Executed verification and performance evidence

These are **frontend hermetic tests and build checks**. React/native/transport boundaries are doubled; messaging tests also exercise real TypeScript, Drizzle and in-memory Node SQLite. They are not two production accounts or real native playback/gestures/IME tests.

| Executed check | Result |
| --- | --- |
| Fresh baseline `npm test` before implementation | **282/282 passed**, 33.970 s. |
| Final full `npm test` | **344/344 passed**, 0 failed/cancelled/skipped; **51.540 s**. Includes auth, messaging, receipts/deletion/history, media, gesture/UI, posts/comments/collections and activity. |
| Final `npm run typecheck` | **Passed** (`tsc --noEmit`). |
| Scoped ESLint on every changed/new TS/TSX/JS/CJS file | **62 files, 0 errors, 0 warnings**. Not a claim that repository-wide legacy lint is clean. |
| `git diff --check` | **Passed**. |
| Production-profile `expo config --type public --json` | **Passed** using fixture `https://api.example.invalid`. Config tests reject missing/private/HTTP production origins. |
| `CI=1 ... expo prebuild --platform android --no-install` | **Passed**. Generated main manifest has `usesCleartextTraffic="false"` and `windowSoftInputMode="adjustResize"`. Existing image-picker library manifest declares CAMERA; config/audio declare RECORD_AUDIO. **No Gradle merged-manifest or APK verification.** |
| Android release JS/Hermes export | **Passed**, **6,554,747 bytes** raw Hermes. |
| iOS release JS/Hermes export | **Passed**, **6,370,466 bytes** raw Hermes. |
| Read-only baseline Android export at `44aabd7` | **6,549,945 bytes**, same installed dependency tree. Current delta **+4,802 bytes / +0.0733%**. Different archived project path; controlled bundle-byte check, not APK/native startup measurement. |
| Existing `npm run benchmark:messaging` | Passed; see scope and exact numbers below. |
| Dependency scan | Install reported **51** advisories (2 low / 32 moderate / 16 high / 1 critical). `npm audit --omit=dev --json` reported **34** (2 low / 15 moderate / 16 high / 1 critical). **Unresolved; security triage is a release gate.** |

Production config/prebuild/exports used a deliberately non-live `.invalid` fixture solely to exercise build policy and bundling. They do **not** establish production DNS, TLS, authentication, upload/static hosting, live backend compatibility or deployed configuration.

### Regression coverage added or strengthened

- Owned/internal/relative uploads versus exact signed/CDN URL preservation; malicious/local schemes, unsafe paths/credentials, missing API config; sender retry and recipient group/DM normalization.
- Full multipart parts/MIME, real upload response failures, refresh single-flight, auth-generation isolation and timeout/network/onabort propagation. Malformed legacy metadata can complete upload/retry without a second JSON crash.
- Original image versus thumbnail-placeholder behavior; retry; picker denial/throw/retry; route blur/AppState/visibility/late-play gates and the existing single-player arbiter.
- Fast rebound and final-touch coordinates, all seven message types, cancellation, deliberate reversal, vertical/multitouch rejection, disabled selection, persistent composer target through keyboard changes and actual send target.
- Real comment ownership, partial total, confirmed-only persistence/reopen, duplicate POST/ID protection, error/retry/draft retention, same-account token refresh and late account/post/open-session results.
- Saved/author envelopes, one-request page commits, single-flight next/previous/exact retry, bounded selected-page variable-height anchoring, confirmed counts versus stale GET, unsave membership, cached-first/offline retention, cross-account separation and loaded-page identity through JWT rotation.
- Shared card failed-action rollback/duplicate lock and actual lazy video selection/container dimensions. This uses a mocked video component; it is **not a native codec/player performance test**.
- Activity sparse payload validation, verified targets, honest grouping/100-group bound, account/logout isolation and legacy persist migration.

Four new scope/membership regressions were run **failing before their fixes**, then passed: saved unsave membership, sheet account switch, routed account switch and routed post switch while a send is pending. The final full suite includes them. Test logs contain expected React test-renderer deprecation / Node experimental SQLite and test-double warnings; no production-console-clean claim follows from these logs.

### Benchmark scope and startup/size boundary

Latest standalone benchmark: Node `v22.22.3`, Linux, real React test renderer with native views mocked. Script baseline is historical **`c0b7d9`**, not this task's `44aabd7` baseline.

- 30 rows / 50 receipt updates: **1,500 → 50 row renders**, 96.67% fewer; typing **300 → 0** row renders. React commit 147.38 → 55.25 ms; wall 187.40 → 88.63 ms in this run.
- 5,000 messages / 50 iterations: model-builder median **2.881 → 0.027 ms**, p95 **4.953 → 0.175 ms**, changed models per receipt **5,001 → 1**.
- Fresh task-baseline current-path model median was 0.026 ms, versus 0.027 ms now; these noisy sandbox figures are not a formal performance non-regression threshold.
- No native FPS, Android startup, heap, binary size, codec decode, network latency or power measurement. The small raw-Hermes delta and absence of new native/runtime dependencies **cannot prove** the approximately 128 MB APK / under-1-second startup constraint.

### Reproduction / evidence locations

```sh
npm ci
npm test
npm run typecheck
npm run benchmark:messaging
npm audit --omit=dev --json
# Set EXPO_PUBLIC_API_URL to the REAL HTTPS origin for an actual release.
CI=1 EXPO_OFFLINE=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo config --type public --json
CI=1 EXPO_OFFLINE=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo prebuild --platform android --no-install
CI=1 EXPO_OFFLINE=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo export --platform android --output-dir dist/production-android
CI=1 EXPO_OFFLINE=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo export --platform ios --output-dir dist/production-ios
```

Scoped ESLint selects `git diff --name-only` plus untracked files ending `.ts/.tsx/.js/.cjs`, excluding historical `backend-delivery/`, and invokes the installed ESLint with JSON output. Read-only bundle baseline used `git archive 44aabd7` outside the repository with the same installed `node_modules`; no branch switch or rollback.

Workspace evidence, deliberately not committed as generated artifacts: `/home/user/production-full-tests.log`, `production-typecheck.log`, `production-patch-lint.json`, `production-final-edge-reproduction.log`, `production-final-edge-tests.log`, `production-picker-tests.log`, `production-media-lifecycle-tests.log`, `production-export-android.log`, `production-export-ios.log`, `production-baseline-export-android.log`, `production-bundle-comparison.json`, `production-benchmark.log`, `production-expo-config.json`, `production-expo-config.log`, `production-android-prebuild.log`, `production-install.log`, `production-dependency-audit.json` (all log/result names relative to `/home/user/`). Generated native project/exports are ignored and are not release artifacts.

## 6. Remaining issues and backend/deployment gates

1. **Real release/device testing absent.** No `java`, `adb`, or `ANDROID_HOME`; no signed production APK/AAB or two physical devices. No real production origin/accounts/session was exercised. Neither native compile/manifest merge nor the requested APK-size/startup acceptance is established.
2. **Configure and test real public HTTPS media hosting.** Set `EXPO_PUBLIC_API_URL` before rebuilding and backend `BASE_URL` correctly. Verify `/uploads` survives restart/deploy, is externally reachable on both devices, honors range requests and serves genuine content types. Do not use the build fixture. Legacy arbitrary external HTTP media needs actual server/CDN HTTPS support; client guessing is not a fix.
3. **Format/metadata limitations.** The backend does not accept documents/HEIC, transcode MOV/AVI/WebM, produce video thumbnails or extract A/V duration. Accepted extensions do not imply Android decoder compatibility. Realtime messages omit duration/rich attachment metadata; use real REST/native metadata where available, otherwise a truthful generic preview. Document sending remains unsupported, although existing document messages/reply previews remain renderable.
4. **Comments cannot meet full-history acceptance on this backend.** GET only exposes the oldest 20; no pagination/deletion/like route. A successful newer comment can be persisted but absent after reopen. Backend must explicitly add/migrate those capabilities before full comment-history/deletion acceptance; no frontend fake endpoint/store was introduced.
5. **Activity cannot meet durable/full-feature acceptance.** Backend must provide durable IDs, creation time, actor metadata or a verified lookup, paginated history, read semantics and reliable publications for desired types. Current session-only SHARE-capable live UI cannot recover missed/offline/restarted events or pretend to supply full actor/read/history behavior.
6. **Post collection state limits.** Author saved-state is not authoritative and saved-post like state is absent. The UI cannot discover an existing save/like silently; a verified duplicate conflict confirms the requested state without a fake increment. Page/offset ordering can shift under concurrent inserts/deletes. Native selected-entry/profile-return behavior still needs the checklist below.
7. **Dependency advisories require triage.** The production-install tree scan includes build tooling as well as runtime packages, so severity totals are not proof of APK exploitability. Critical `shell-quote` and high entries including `socket.io-parser`/`expo-router` need dependency-path/runtime review and compatible remediation. Some suggested fixes require a major router/SDK change. No blind `npm audit fix --force`, framework upgrade or dependency churn was performed under this task's architecture/performance constraints.
8. **Standing messaging/backend limits remain.** No new backend change/deploy was made. Preserve the prior messaging audit's review gates for per-user delete durability across cache clearing/other devices, ambiguous send idempotency, missed old edits/deletes and historical offline revalidation. This task's passing regressions do not turn those backend gaps into guarantees.

## 7. Explicit actual-testing confirmation and production acceptance checklist

**Actually performed:** source/contract inspection, local implementation, 344 hermetic frontend tests, TypeScript, scoped lint, configuration validation, Android prebuild scaffolding, Android/iOS release JS exports, raw Android Hermes baseline comparison, Node/React/model benchmark and dependency audit.

**NOT performed:** two live accounts; two physical Android production installs; production HTTP/Socket.IO/media integration; real permission prompts; actual codecs/camera/microphone; native fast-swipe/IME/FPS; real offline/reconnect/restart; production APK/AAB compile, size or cold start. There was **no** live data mutation, backend implementation change, PR merge, or deployment.

All rows below remain **PENDING**. Use a release signed APK against the real HTTPS deployment on two Android phones, accounts A/B, and exercise **both DM and group**. Record device/OS/keyboard, APK version/build/hash, API origin, backend commit, timestamp and evidence for each pass/failure.

| Pending check | Required acceptance evidence |
| --- | --- |
| Build/install/config | Inspect final merged manifest and actual APK permissions/cleartext settings. Install on both phones. Confirm real HTTPS HTTP + WebSocket origin and no localhost/LAN/device-local media in persisted requests, socket payloads or recipient cache. |
| Images | Camera and library, multiple files, denied/re-enabled permissions; A→B and B→A, both modes; thumbnail loading → original → full zoom; retry, restart and download. Confirm original quality and valid public URLs on both devices. |
| Video | Real MP4/MOV/WebM/AVI samples as accepted by server, supported/unsupported codecs, loading/retry/error, preview, native controls/fullscreen/rotation/speed, range/seek/download, no unsolicited preloading or post-navigation playback. Record expected unsupported-format errors honestly. |
| Voice/audio | Record/send/pause/resume/seek/progress/duration; imported supported audio; interruptions/focus loss/background/route blur; delayed load after blur; one active player; denied microphone and transfer/playback errors. |
| Fast swipe / reply preview | Every message type, sender/recipient, slow/fast/rebound/interrupted/vertical/controls/image zoom. Correct persistent author/target immediately after successful gesture; keyboard cycles do not clear it; actual sent reply matches target. Long text, emoji, narrow/large font, media/document/shared/deleted previews stay bounded/readable. |
| Keyboard / layout | Android gesture and 3-button navigation, multiple keyboards, open/type/multiline/reply/media/cancel/Back-hide/reopen; no secondary jump, overlap or extra nav-bar gap. Repeat group/DM and portrait/landscape/tablet as supported. |
| Navigation/state | Settings, bookmarks, both profiles, PrivateRoom and details: shared forward/native-back transition, one header, no extra mount; return preserves profile grid/tab/scroll and selected-feed context. |
| Comments | Real post A/B ownership, confirmed send/reply, duplicate taps, failure/retry/draft, counts across feed/profile/bookmarks, close/reopen and real persistence. Explicitly record the oldest-20 limitation; pagination/delete acceptance cannot pass without backend support. |
| Author feed / bookmarks | Select beginning/middle/deep-page variable-height post; surrounding correct author/order, next/previous/retry; large histories without eager all-post load; normal like/comment/bookmark/share; unsave removal; loading/empty/offline/error; responsive grid/list and profile return context. |
| Activity | Generate verified backend SHARE event and inspect actual payload/recipient/target. Verify reconnect/session/account/logout isolation and honest receipt-time/grouping labels. Full history/actors/read/missed-event recovery and like/comment/follow live delivery remain backend-blocked, not invented passes. |
| Offline/reconnect / preserved semantics | Airplane mode during upload/send/comment/page load, visible explicit failures and same-row retry, resume/restart/catch-up, account/token change; no duplicate canonical messages, history reorder or false read. Check sent/delivered/read separately and group READ after any other recipient genuinely views. |
| Performance / release review | Measure actual APK bytes and comparable cold/warm starts on both phones against the supplied approximately 128 MB / sub-second baseline; scroll/typing/media responsiveness, heap and long-session use. Triage dependency advisories and verify deployed backend/static storage/security. |

Do not mark this application production-ready until these real-device/deployment gates and the explicit unsupported backend capabilities are resolved or consciously accepted with a documented limited release scope.
