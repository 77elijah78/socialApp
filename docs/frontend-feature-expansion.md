# Frontend Feature Expansion

Branch: `arena/8e08f1a0-socialapp`
Base: `main` @ `e6dfe03`
Scope: React Native / Expo / TypeScript client. The backend was audited before implementation; no endpoint was invented.

## 1. Outcome

Implemented against the capabilities the server actually exposes:

- global HTTP 429 handling, cooldowns, disabled actions, upload failures, and no automatic retry of 429s;
- Google sign-in/up UI with PKCE ID-token exchange and the existing JWT session model;
- existing group conversations rendered with group-aware labels/header/info, plus a full create/manage UI that activates when group routes are deployed;
- channel discovery, creation, information, subscription, feed, pinned posts, media/stickers, and admin-only edit/delete/publish controls;
- a WebP sticker system (bundled packs, picker, recents/favorites, store, remote pack discovery) wired into private chats, groups, and channel posts;
- loading skeletons, empty/error states, pagination, and focused in-flight guards.

The current server does **not** expose Google auth, group management, channels, or sticker-catalog routes. Those surfaces use probe-guarded services and clearly labelled capability errors instead of pretending to succeed. Nothing is mocked with fake data.

## 2. Backend capability audit

| Area | Current server |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`, `PATCH /auth/me`. No `/auth/google` or account-link route. |
| Conversations | `GET /messages/conversations` returns `isGroup`, `groupName`, `groupAvatar`; `POST /messages/conversations { userId }`. No group create/manage routes. |
| Messages | TEXT / IMAGE / VIDEO / AUDIO / DOCUMENT / SHARED_POST / SHARED_STORY. No STICKER message type. |
| Channels | No `/channels` routes. |
| Sticker catalog | No `/stickers/packs` route. |
| Rate limits | Global 60 s / 1000 requests; `/media` 20/min; `/push` 30/min. Returns `RateLimit-*` headers and `Retry-After`; 429 body uses `error` or `message`. |

The group and channel services treat `404`, `405`, and `501` as “not deployed on this server”. They surface a specific, user-readable capability message and leave existing chat fully usable.

## 3. Rate limits and submission feedback

### Service layer

- `src/services/RateLimitService.ts`
  - maps paths to scopes (`auth`, `media`, `messaging`, `social`, `global`);
  - parses `Retry-After` seconds/dates and `RateLimit-Reset`;
  - clamps cooldowns to 1 s–15 min, falling back to 60 s;
  - stores server-authoritative notices with expiry, without deleting expired entries during render;
  - exposes friendly messages and countdown formatting.
- `src/services/api.ts`
  - checks the active cooldown before every request and fails fast with a `RateLimitError`;
  - parses every 429, stores the cooldown, and **never retries** it;
  - also checks a refresh-retry response for 429;
  - XHR multipart uploads parse 429 headers and throw `UploadHttpError` with the retry window;
  - preserves 401 refresh behavior for non-rate-limited requests.
- `src/services/AuthService.ts` raw auth fetches opt into the same 429 path, so login/register cannot bypass the banner.

### UI layer

- `src/components/system/RateLimitBanner.tsx` is rendered above the app stack and shows the active scope’s countdown.
- `src/hooks/useRateLimit.ts` supplies `blocked`, `countdown`, and `notice` to screens.
- `ChatComposer` blocks message submission during a messaging cooldown, preserves the draft, closes pickers, and disables attachments/mic during a media cooldown.
- `ChannelComposer`, `newGroup`, `groupInfo`, channel create/feed/info, and the auth form all disable their primary action and guard with refs so a double tap cannot submit twice.
- Media upload failures keep the optimistic message in the Failed state (existing retry path); upload-429s also populate the global cooldown.

No frontend rule is presented as security enforcement. The backend still decides every limit.

## 4. Google sign-in / sign-up

- `src/hooks/useGoogleAuth.ts`: `expo-auth-session` Google provider using `useIdTokenAuthRequest`, PKCE, system browser, and the app scheme `yoursocialapp` with path `oauth2redirect`. It requests only `openid`, `email`, `profile` and sends only the ID token.
- `src/services/AuthService.ts`: `loginWithGoogle(idToken, dispatch)` calls `POST /auth/google` with `{ idToken }`. On success it uses the **same** `completeAuthentication` path as email/password: `setTokens`, Redux `setCredentials`, refresh-token storage, messaging account preparation.
- `src/components/auth/GoogleAuthButton.tsx` + `AuthForm.tsx`: “Continue with Google” / “Sign up with Google” on both screens, with loading, disabled, cancelled, configuration, and backend-error states. Email/password remains intact.
- A 404/405/501 from `/auth/google` is reported as “Google sign-in isn’t supported by this server yet” rather than a generic retry loop.

### Required backend contract

The server still needs to implement:

```
POST /api/v1/auth/google
{ "idToken": "<Google ID token>" }

200 { success: true, data: { user, accessToken, refreshToken } }
```

The backend must verify the Google ID token, link an existing verified email/account according to its own policy, create a new account when allowed, and return the normal app JWT pair. The client never trusts Google profile claims without that session.

### Configuration

Add to `.env` (also documented in `.env.example`):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

Register `yoursocialapp://oauth2redirect` (and the Expo auth proxy redirect if used) in Google Cloud Console. Without a client ID the button reports that Google is not configured in that build.

## 5. Group chats

### Rendering and reuse

- Existing group conversations continue to use `PrivateRoom`, `ChatHeader`, `MessageCard`, `ChatComposer`, pagination, receipts, replies, reactions, and media components.
- `messages.tsx` shows group names/avatars and group affordances.
- `ChatHeader` opens group info instead of a private profile for groups.
- Sender labels, delivery/read state, replies/reactions, and all existing message types therefore work in groups without a parallel chat store.

### Create and manage

New screens:

- `src/app/(chatRoom)/newGroup.tsx` — multi-select user search, member chips, name, optional photo upload, member preview, in-flight guard, capability error.
- `src/app/(chatRoom)/groupInfo.tsx` — group identity, photo/name edit, member list with roles, add members, remove member, promote/demote admin, leave group, read-only fallback.
- `src/services/GroupService.ts` — probe-guarded endpoints:
  - `POST /messages/groups`
  - `GET|PATCH /messages/groups/:id`
  - `POST /messages/groups/:id/members`
  - `DELETE /messages/groups/:id/members/:userId`
  - `PATCH /messages/groups/:id/members/:userId/role`
  - `POST /messages/groups/:id/leave`
- `src/hooks/useUserSearch.ts` + `PageHeader` provide reusable search/header UI.

Permissions are derived from the server’s `myRole`/`canManage` fields. If the management route is absent, group info falls back to the real `GET /messages/conversations` participant payload, marks itself read-only, and explains why. The client never grants management powers locally.

## 6. Channels

New routes:

- `src/app/channels/index.tsx` — discover/subscribed tabs, search, pagination, skeletons, empty/error/capability states, create action.
- `src/app/channels/create.tsx` — public/private switch, name, description, image upload, validation, rate-limit guard.
- `src/app/channels/[channelId]/index.tsx` — dedicated broadcast feed, new-post composer, pinned section, pagination, pull-to-refresh, edit/pin/delete menu gated by server `canPost`.
- `src/app/channels/[channelId]/info.tsx` — subscriber count, visibility, description, admins (or an explicit note when the server omits them), subscribe/unsubscribe.
- `src/services/ChannelService.ts` — probe-guarded paths:
  - `GET /channels?query=&scope=&page=&limit=`
  - `GET|POST /channels`
  - `GET /channels/:id`
  - `POST|DELETE /channels/:id/subscribe`
  - `GET|POST /channels/:id/posts`
  - `PATCH|DELETE /channels/:id/posts/:postId`
- `ChannelPostCard` reuses `AuthenticatedImage`, `Videoplayer`, `VoiceMessage`, `DocumentMessage`, and `StickerImage`; it does not copy chat bubbles.
- `ChannelComposer` reuses the existing media picker/upload pipeline and sticker picker.

Channels are visually distinct: blue broadcast accents, megaphone identity, pinned-post treatment, feed cards, and admin badges. Only `canPost` from the server reveals publishing controls; subscriber state never implies publish permission.

### Current limitation

No channel route exists on the audited server. Every channel request therefore resolves to the explicit “Channels aren’t available on this server yet” state. The UI and contracts are ready for the documented endpoints, but they cannot complete until the backend is deployed.

## 7. Stickers

### Artwork and protocol

- Eight bundled, transparent WebP stickers in `src/assets/stickers/circle/` (two packs: Circle, Moods), generated at 256 px and kept small (about 88 KB total).
- `src/constants/stickers.ts` defines packs, tags, marker encode/parse, and built-in lookup.
- `src/types/assets.d.ts` types `.webp` imports.
- Chat stickers use an existing IMAGE message with `content = [[sticker:packId:stickerId]]` and attachment metadata. This needs no backend schema change and remains readable by older clients as an image.
- Channel sticker posts use standard `IMAGE` posts with the same marker (not a fabricated STICKER enum), so a strict channel backend remains compatible.

### UI and state

- `StickerImage.tsx` preserves transparency, uses expo-image (WebP/GIF/APNG), `contain`, memory/disk caching, and explicit unavailable artwork.
- `StickerPickerModal.tsx` provides pack tabs, search, recents, favorites, long-press favorite, store shortcut, loading/empty states, and closes cleanly.
- `src/app/stickers.tsx` is the store: browse/search, add/remove packs, previews, favorites.
- `src/hooks/useStickers.ts` derives installed/favorite/recent lists from local per-account preferences.
- `src/services/StickerService.ts`:
  - hydrates `stickers:<account>:installed|favorites|recents`;
  - caps recents at 24;
  - probes `GET /stickers/packs?query=` for optional remote packs;
  - sends remote stickers by URL (no redundant download) and resolves bundled assets locally;
  - preserves real MIME types (`webp`/`gif`/`png`/`jpeg`);
  - explicitly rejects Telegram `.tgs`/`.webm`, which this Expo app does not ship runtimes for.
- `MessageCard`/`StickerMessage` render markers as artwork without a file bubble; replies, sender labels, timestamps, retry, and group behavior are inherited.
- Settings contains a “Sticker store” entry.

### Current limitation

No sticker catalog route exists on the audited server; bundled packs and local favorites/recents work fully. The store shows a clear note when online packs are unavailable.

## 8. API integrations

| Method | Path | Used by |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | existing auth, preserved |
| POST | `/auth/google` | Google sign-in (backend pending) |
| GET | `/auth/me` | session restore, preserved |
| GET | `/messages/conversations` | group discovery/fallback info |
| POST | `/messages/conversations/:id/messages` / `reply` | private + group sending |
| POST | `/messages/groups` and group member/role/leave routes | group creation/management (backend pending) |
| GET/POST | `/channels`, `/channels/:id`, `/channels/:id/subscribe`, `/channels/:id/posts` | channel browse/create/info/feed (backend pending) |
| PATCH/DELETE | `/channels/:id/posts/:postId` | channel admin edit/pin/delete (backend pending) |
| GET | `/stickers/packs` | optional remote sticker catalog (backend pending) |
| POST | `/media/*` | existing upload pipeline, now 429-aware |

All HTTP goes through the existing `api.ts` or the existing upload path. No new HTTP client and no mock server were added.

## 9. Navigation changes

Root `src/app/_layout.tsx`:

- `settings` remains registered;
- new `channels` stack (header hidden);
- new `stickers` modal.

Chat layout `src/app/(chatRoom)/_layout.tsx`:

- `newGroup`;
- `groupInfo`.

Entry points:

- Messages header: new-group and browse-channels actions.
- Settings: sticker store.
- Channel list: `/channels/create`.
- Channel cards: `/channels/:id`.
- Channel info: `/channels/:id/info`.
- Group header/menu: group info.

Existing private chat, notifications, profile, and social routes were not renamed or removed.

## 10. Dependencies

Added directly:

- `expo-auth-session` `~56.0.14` (resolved 56.0.20)
- `expo-crypto` `~56.0.4` (resolved 56.0.5; PKCE support)

No sticker, channel, or group UI dependency was added. Existing `expo-image`, `expo-router`, `expo-file-system`, `expo-image-picker`, `expo-video`, `expo-audio`, `expo-sqlite`, Redux Toolkit, and the existing component set are reused. `sharp` was used only locally to generate the checked-in WebP assets; it is not an app runtime dependency.

## 11. Native/build notes

- The new auth packages are Expo modules. Expo Go may include compatible versions, but a custom development build is recommended and required for the native modules already present in this project from Part 1.
- After pulling:

```bash
npm install
# if the native project needs regenerating:
npx expo prebuild --clean
npx expo run:android
# or: eas build --profile development
```

- Add Google OAuth client IDs to `.env` and register the redirect URI before testing Google.
- Existing Android package `com.elijah77.social` and scheme `yoursocialapp` must be kept.

## 12. Tests and verification

Added `test/features/`:

- `rate-limit.test.cjs` — scope mapping, `Retry-After` seconds/dates/reset, friendly copy, scoped/global cooldowns, API 429 no-retry and fail-fast behavior.
- `google-auth.test.cjs` — ID-token exchange, JWT persistence, backend rejection, 429 propagation, missing-endpoint capability message, preserved email/password contract.
- `group-channel.test.cjs` — group create/member/role/leave contracts, conversation fallback, group message payload, channel list/create/subscribe/feed/pagination/permission normalization, capability errors.
- `stickers.test.cjs` — real WebP files, marker round-trip, per-account preferences, remote normalization, GIF MIME, Telegram-format rejection, no redundant remote download, optimistic send in private + group.

`test/messaging/harness.cjs` now mocks `expo-auth-session/providers/google` and `expo-asset` so service tests remain deterministic; `test/auth/screens.test.cjs` was updated for the intentional Google button addition.

Results on this branch:

```
npx tsc --noEmit          -> exit 0
npm test                  -> 721 tests, 721 pass, 0 fail
eslint (changed files)    -> 0 errors, 131 warnings
```

The full-repo lint still reports the pre-existing `react-hooks/refs` errors in `src/hooks/useVoiceRecorder.ts`; that file was not changed in this work. Most remaining warnings are existing `import/no-named-as-default-member` notices for the theme default import.

## 13. Remaining backend work / follow-ups

1. Implement `POST /auth/google` with token verification and account linking.
2. Deploy group management routes (or confirm their exact contract) so creation/edit/member controls become live.
3. Deploy `/channels` and channel post routes; confirm whether post types are strict and whether admins are returned in channel detail.
4. Deploy `GET /stickers/packs` if remote packs are desired; bundled stickers already work offline.
5. Confirm message validation accepts IMAGE messages whose content is a sticker marker.
6. Consider a first-class STICKER message type later; until then the marker + IMAGE fallback preserves compatibility with old clients.
7. The channel feed pagination uses cursor when returned; otherwise it reports no next cursor. Confirm the final server pagination envelope when channels ship.
