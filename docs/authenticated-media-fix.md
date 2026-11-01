# Chat and story media authorization fix

**Observed:** 2026-10-31. **Frontend baseline:** `4af5d455b683eca6a816596820ff09e3b43b2c4a`. **Branch:** `arena/e4dfc24a-socialapp`.

**Implementation and local verification are complete; production-device verification is not.** This addresses the native media requests behind the supplied HTTP 403, without making uploads public. [Machine-readable evidence](authenticated-media-evidence.json) records source hashes, tests and fresh export comparisons.

## 1. Verified root cause and backend contract

The supplied Android request reached `/uploads/images/...` and received **403 “Media access denied”**, thrown by `authorizeMedia` line 28. Read-only inspection located the matching middleware at backend security-branch commit [`12e570c4ba0ce21dbc8c25325314b547e52e9534`](https://github.com/77elijah78/nodejs-socialapp/blob/12e570c4ba0ce21dbc8c25325314b547e52e9534/src/middlewares/media-access.ts). This differs from the public-uploads contract at the earlier inspected main `eb79c44`. The matching source is not proof of the actual deployed SHA.

- `/uploads` runs `optionalAuth → authorizeMedia → express.static`.
- Public, nondeleted post references and active-user avatars can load anonymously. A recognized authenticated user can access an unexpired, nondeleted story. Asset owners are also allowed. Chat access requires a matching nondeleted message, no per-user deletion and active conversation participation.
- `optionalAuth` ignores absent/expired/invalid Bearer tokens. Private requests consequently receive **403**, not necessarily 401.
- The frontend authenticated uploads and message/story API calls but passed **bare URIs** to separate native image/player/download GETs. Those requests did not inherit API request headers. Their failure produced the unavailable UI; there was no one-second media expiration timer.

A read-only archive of the exact frontend baseline reproduced missing headers in **seven actual loader paths**: photo, reply thumbnail, chat video/audio, story image/video and native download. All seven failed the header contract before this patch and passed afterward. The external signed-URL/no-credential control passed both times. These are renderer/player/file doubles, not seven live-device tests.

## 2. Changed files and behavior

| Files | Change |
| --- | --- |
| `src/utils/mediaRequests.ts` | Normalize known owned upload references; construct scoped Bearer sources; bounded/cycle-safe native HTTP classification. Advisory JWT expiry handles opaque native errors without treating an unverified payload as authorization. |
| `src/hooks/useMediaSource.ts` | Account/session/resource lifetime, scoped memory-cache identity, currentness guards and one automatic auth retry across token rotation. Explicit native retry may begin another bounded attempt. |
| `src/components/common/AuthenticatedImage.tsx` | Existing Expo renderer, authenticated original/placeholder, deduplicated error callbacks, retry-before-final-failure and stale resource/attempt rejection. No additional native layout wrapper. |
| `src/services/api.ts` | Expose auth generation and media refresh through the existing HTTP refresh single-flight; reject old-account refresh work and reuse an already rotated token. |
| `src/components/messages/{ImageMessage,ReplyPreview,SharedStoryCard,Videoplayer,VoiceMessage}.tsx` | Authenticate chat media, reply/thumbnail/poster and shared-story image requests, plus actual native audio/video playback. Shared video stories show “Video story · Tap to watch” instead of decoding MP4 bytes as an image. |
| `src/app/(chatRoom)/imageViewer.tsx` | Authenticated full-size photo, existing zoom/gesture layout and consented native file sharing. |
| `src/services/{DocumentDownloads,MediaSharing}.ts`, `src/components/messages/MessageCard.tsx` | Authenticated, bounded-retry downloads; private attachment action saves/shares authorized local bytes rather than handing a protected URL to a browser that cannot attach JWTs. Preserve download queue, progress, partial cleanup and account-private paths. |
| `src/components/stories/StoryViewer.tsx` | Authenticated native image/video loading, guarded playback and recovery; image display timer and view request start only after native media readiness, not during auth/loading failure. Failed media is not counted as viewed. |
| `src/hooks/useStories.ts`, `src/app/stories/viewer.tsx` | Normalize story URLs/types; scope feed/30-second viewer cache by account/session; hide old-account rows and reject late fetch/refetch results. Token rotation does not reset the loaded feed. |
| `test/messaging/media-authorization.test.cjs` | 34 new request, refresh, denial, cache, lifecycle, sharing, story-readiness and transport regressions. |
| `test/messaging/{bubbles,media}.test.cjs`, `gesture-driver.cjs` | Retain real geometry assertions using the native frame, not incidental JS ancestor counts. Expose the installed RNGH pinch/tap/composition builders for full-screen viewer construction tests; no claim of native touch recognition. |
| `docs/{authenticated-media-fix.md,authenticated-media-evidence.json,production-readiness-audit.md}` | This seven-part follow-up, exact evidence and historical audit cross-reference. |

## 3. Security, architecture and performance boundaries

- Bearer credentials go **only** to the configured API origin's `/uploads/` mount. Never add JWTs to URLs, route params, messages, filenames or cache identities. External/CDN/signed/local sources receive no Bearer header; valid external signed URLs retain their exact bytes.
- Owned protected images, including a protected placeholder, use **memory-only caching** with account/session-scoped keys, not an account-unscoped persistent native image cache. Protected video uses `useCaching: false`. User-requested downloads remain in existing account-private app storage and are removed by existing logout/account teardown.
- A genuine second 401/403 stays failed. No anonymous fallback, access-control bypass, repeated refresh loop, row preflight/HEAD request, separate token store or signed-ticket endpoint was introduced. Expo Audio sometimes exposes only “Source error”; a known-expired JWT permits the same bounded recovery, while ordinary valid-token codec failures do not cause refreshes.
- Reject old account, unmounted and replaced-resource callbacks, including URI A → B → A. A fast second native denial must not be mistaken for a subscriber to a completed refresh. Token synchronization must not replay the previous native error while fresh media is loading.
- Keep the existing Expo modules, deliberate-play chat players, native controls, focus/AppState/visibility guards, shared Socket.IO provider, SQLite history, stable message identities, uploads/persistence, reply gestures, receipts and **any-other-recipient group READ**. No runtime dependency, framework/native configuration, permission, manifest, lockfile, message schema or backend code changed.
- Fresh controlled Hermes comparison: Android **6,554,792 → 6,582,415 bytes** (**+27,623 / 0.421417%**); iOS **6,370,512 → 6,394,883 bytes** (**+24,371 / 0.382560%**). All **46 Android / 43 iOS** asset paths and content hashes match. The archived baseline uses a different project path with the same installed dependency tree. These are JS/Hermes byte checks, **not APK-size, startup, FPS or native-memory measurements**.

## 4. Integration contract and remaining backend prerequisites

No REST/upload/Socket.IO/database contract was invented or changed. Existing `/posts/stories`, `/posts/stories/:id/view`, upload/message APIs and the existing refresh endpoint remain in use. Both direct and group conversations use the common message renderer.

Server authorization remains authoritative. Valid Bearer requests can still be denied for permissions, deletion, expiry, inactive participation or missing/mismatched references. The inspected middleware compares the complete stored `mediaAsset.sourceUrl`/`mediaBaseUrl()` with post/story/message URL fields. **Backend `BASE_URL`/asset source URLs and persisted canonical media URLs must agree**; adding headers does not migrate historical database URLs or repair hosting. If a fresh valid-token request still receives 403, inspect those exact references and membership on the running backend rather than making uploads public.

Actual deployment SHA, production HTTPS/TLS reachability, durable files, correct MIME/range delivery and real codecs still require deployment/device verification. Generic document upload capabilities remain constrained by the existing backend; this patch does not add an unsupported document endpoint.

This implementation targets the installed **Android/iOS native** media APIs. Browser image/audio/video elements do not generally support arbitrary Authorization headers; web private-media playback needs separately reviewed browser/CORS/transport support. It is **not certified or represented as fixed by native source-prop tests**. No speculative cookie/signed-URL backend was added.

## 5. Executed verification

| Check | Result |
| --- | --- |
| Fresh pre-change `npm test` | **353/353 passed**, 42.889 s. |
| Exact-baseline native-source reproduction | **7 expected missing-header failures / 1 passing external-source control** before; **8/8 passed** after. |
| New media authorization tests | **34/34 passed**. |
| Full final `npm test` | **387/387 passed**, zero failures/skips, 62.557 s. Ran concurrently with exports; not an app-performance benchmark. |
| `npm run typecheck` | Passed. |
| Scoped ESLint | **20 changed source/test files**, zero errors/warnings; not a claim of linting unrelated legacy files. |
| Android and iOS production-mode offline exports | Both passed; fresh exact-baseline exports also passed. Byte/asset comparison above. |
| Manifest/lock boundary | `package.json` and `package-lock.json` byte-identical to baseline. No dependency update or fresh clean-audit claim. |
| `git diff --check` | Passed. |

The 34 additions cover native source headers, thumbnails/full-screen/share previews, original/signed/local URL handling, actual lazy player source props, private cache policies, shared refresh, 401/403 and genuine-denial bounds, opaque expired-token audio failure, delayed native setup, old-account refresh/fetch cancellation, repeated-URI lifetime safety, partial files, consented local-file sharing and native-ready story progress/view marking. A real **local HTTP fixture** verifies that a bare private GET is denied and the constructed header-bearing request succeeds. Its policy is a fixture, not the deployed middleware or a real-account membership test.

Reproduce current checks from the repository root:

```sh
npm test
node --test test/messaging/media-authorization.test.cjs
npm run typecheck
# ESLint file inventory is in authenticated-media-evidence.json.
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo export --platform android --max-workers 2 --output-dir dist/media-auth-after-android
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo export --platform ios --max-workers 2 --output-dir dist/media-auth-after-ios
```

The `.invalid` origin is deliberately non-live. Generated exports/archives and workspace logs are excluded from the commit. The evidence JSON lists logs and the additional workspace-only before/after probe, as well as source/manifest/bundle/asset hashes.

## 6. Required real-device follow-up

Use two accounts on two **physical Android production installs**, plus iOS as applicable:

1. Sender and recipient in DM and group: capture/pick → authenticated upload → persisted message → realtime/history/cache → original, thumbnail, reply, full-size image, audio/video playback and user-requested file download/share. Check no local URI or credentials enter the wire payload.
2. Unexpired image/video stories and shared-story previews/viewer; slow loading and token expiry; progress/view marking after media readiness; real expired/deleted/forbidden responses remain unavailable without a loop.
3. Expire an access token during a native load/range request; verify one shared refresh and authorized retry, then test logout/account switching while work is pending. Verify recipient membership and canonical source URL matching if 403 persists.
4. Offscreen/background/blur/unmount, native playback controls, long press/swipe/reply, photo zoom, permissions, audio focus, lost network/retry and native share cancellation. Confirm no receipt or canonical-history regression.
5. Measure the real APK/AAB and cold/warm startup against the user's reported approximately **128 MB / <1 second** baseline. Hermes exports alone cannot establish either result.

Existing dependency advisories and the original comments/activity capability limits remain in the earlier audits; they were not resolved by this media patch.

## 7. Actual-testing confirmation and delivery boundary

**Performed:** pinned source/contract inspection; native renderer/player/file-double regressions against original and patched frontend source; local HTTP fixture; full automated suite; TypeScript; scoped lint; Android/iOS offline production-mode JS/Hermes exports; unchanged asset/dependency checks.

**Not performed:** native Android/iOS compilation; APK/AAB build, installation, size/startup/FPS measurement; live production media/API/account/database tests; two physical Android production installs; native codec/range/TLS/permission/gesture verification; web authenticated playback certification; backend edits; merge, deployment or live database mutation.

The frontend source fix must be built/released through the normal approved process before an installed app receives it. **Production-readiness certification remains withheld.**
