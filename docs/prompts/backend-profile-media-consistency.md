# Backend hand-off: profile media URLs, post images, and deleted-post counts

Repository: `77elijah78/nodejs-socialapp`
Branch: `arena/1275dc5e-nodejs-socialapp`
Related frontend branch: `arena/8e08f1a0-socialapp`

The mobile client now normalizes every owned upload URL it receives and uses the
author-feed total as a fallback for profile post counts. Two server-side
contracts still make a correct client render fail. Please implement both in the
backend; do not change the client to depend on an unverified media path.

## 1. `_count.posts` includes soft-deleted posts

`src/services/user.service.ts` builds profile and search responses with
`_count: { select: { followers: true, following: true, posts: true } }`.
`posts` are soft-deleted (`deletedAt` timestamp) by `post.service.deletePost`,
but the relation count has no `where` filter. Consequently:

- `GET /api/v1/users/:username` reports a stale post total;
- `GET /api/v1/users/search?q=` reports the same stale total;
- the author feed correctly filters `deletedAt: null`, so the grid and the
  profile header disagree after a delete.

Filter the relation count everywhere it is exposed:

```ts
_count: {
  select: {
    followers: true,
    following: true,
    posts: { where: { deletedAt: null } },
  },
},
```

Apply this to both `getProfile` and `searchUsers` (and any other DTO that returns
`_count.posts`, including follower/following list entries if present). Keep the
existing `deletedAt: null` filters on the post queries.

## 2. Owned media URLs are compared as whole strings, so valid avatar and post images return 403

Current path:

1. `media.controller.uploadAvatar` / `processUploadedFile` store a file and
   return `${mediaBaseUrl()}/images/<file>` (`src/config/media.ts`,
   `src/services/media.service.ts`).
2. The client PATCHes that exact URL to `/users/me`; `updateProfileSchema`
   accepts it via `isSharedMediaUrl`.
3. `authorizeMedia` (`src/middlewares/media-access.ts`) rebuilds
   `url = ${mediaBaseUrl()}/${key}` and looks up
   `prisma.user.findFirst({ where: { avatarUrl: url } })` or
   `prisma.post.findFirst({ where: { OR: [{ imageUrls: { has: url } }, ...] } })`.
4. If the client-supplied URL and `mediaBaseUrl()` differ by origin (reverse
   proxy, `PUBLIC_MEDIA_BASE_URL`, host/port change, localhost vs LAN), the
   exact-string lookup fails and the middleware throws
   `ForbiddenError('Media access denied')` even though the file exists and the
   avatar/post is public. This is why messages media (stored server-side and
   fetched with the server's own base) can work while avatars and post images
   do not.

Make the stored media reference canonical, not client-origin-dependent. Pick one
of these approaches (the first is preferred):

### Option A — canonicalize on write and backfill

- Add a helper such as `canonicalOwnedMediaUrl(value)` in
  `src/config/media.ts`:
  - parse the URL;
  - accept only `/uploads/(images|videos|audio)/<safe-filename>`;
  - reject traversal, encoded slashes, credentials, non-HTTP(S), and
    localhost/private hosts exactly as `isSharedMediaUrl` does today;
  - return `${mediaBaseUrl()}/${key}` (or a stored key plus a DTO serializer).
- Apply it to every media-bearing write path: `updateProfile.avatarUrl`,
  `createPost`/`updatePost` `imageUrls`, `videoUrl`, `mediaMetadata[].url` and
  `.thumbnailUrl`, channel avatars/posts, group avatars, story media, and
  messages if they accept client-supplied values. Do not trust the origin in
  the request body.
- Add a one-off idempotent backfill (script or migration) that rewrites
  existing `User.avatarUrl`, `Post.imageUrls`, `Post.videoUrl`,
  `Conversation.groupAvatar`, `Channel.avatarUrl`, and `Story.mediaUrl` values
  whose path matches `/uploads/...` to the current canonical base. Preserve
  signatures/queries for genuinely external CDN URLs; only rewrite owned upload
  paths.
- Keep `authorizeMedia` matching canonical `mediaBaseUrl()` URLs. Replace the
  exact-string avatar/post lookup with the helper on both sides if any legacy
  row can still contain a different owned origin.

### Option B — authorize by upload key, not full URL

If canonicalizing every write is too invasive, change `authorizeMedia` to:

- extract the `images|videos|audio/<filename>` key from the request path;
- find the `MediaAsset` by `key` and use its `sourceUrl`/owner;
- for public avatar/post/story authorization, compare only the pathname/key of
  stored values, not their origin. Never authorize merely because a public file
  exists: it still needs a public owner (post, avatar, active story) or an
  authenticated message/member relationship.

Option B must not broaden access to arbitrary files. Keep the current
`ForbiddenError` behavior for media that is not referenced by a public entity or
an authorized conversation.

### Avatar freshness

After the canonicalization is in place:

- `PATCH /api/v1/users/me` should return the canonical stored `avatarUrl`;
- `GET /api/v1/users/:username`, `/users/search`, the `actor` object in
  `/api/v1/notifications` (activity), and each participant `user` in
  `/api/v1/messages/conversations` must select the **current** `avatarUrl`;
- if any response is cached in Redis or an HTTP cache, invalidate the user and
  participant/activity keys when the avatar changes. Do not keep an old avatar
  in conversation summaries or activity rows.
- Optional but useful: emit the existing user/profile socket event after a
  successful avatar update so already-open clients can update without a tab
  refocus.

### Post image contract

Keep `imageUrls` as an array of canonical, publicly reachable
`.../uploads/images/<file>` URLs in every feed response (home, explore, saved,
author). Do not return `mediaMetadata` URLs only, and do not return
device-local or client-origin URLs. `max 4` remains enforced by
`createPostSchema`. Image-only posts (`content: ''`, `imageUrls` non-empty) must
be accepted and returned.

## Acceptance tests

Add backend tests (Supertest against the real router, Prisma test DB) for:

1. Create a post, delete it, then:
   - `GET /users/:username` `_count.posts` decreases by one;
   - `GET /users/search?q=` returns the same decreased count;
   - the author feed does not contain the deleted post.
2. Upload an avatar, PATCH `/users/me` with the returned URL, and fetch that
   URL through `/uploads/images/<file>` **without** an Authorization header:
   - status 200;
   - the response is the uploaded image;
   - repeat with `mediaBaseUrl()` configured to a different public origin than
     the API request origin used by the test, if the test harness can set it.
3. Create an image post through `/media/upload` + `/posts`, then fetch each
   `imageUrls` entry through `/uploads/images/<file>`:
   - status 200;
   - feed, explore, saved, and author responses all contain the canonical URL.
4. PATCH an avatar and immediately fetch:
   - `/users/:username`;
   - `/users/search?q=`;
   - `/messages/conversations` (the signed-in user's participant row);
   - `/notifications` (a row whose actor is this user);
   all four expose the new URL, not the previous one.
5. A request for `/uploads/images/<file>` that is not referenced by a public
   post/avatar/story and not in an accessible conversation still returns 403.

Run the existing backend suite (`npm test`), `npm run build`, and lint before
finishing. Do not weaken private-message media authorization, do not accept
`localhost`/private hosts as public media, and do not expose `inviteTokenHash`
or channel subscriber rosters.

## Client behavior already in place (do not duplicate)

The frontend:

- normalizes owned upload URLs against `EXPO_PUBLIC_API_URL`;
- accepts legacy post image shapes (`imageUrl`, `images`, `mediaUrls`, object
  arrays) as a fallback;
- prefers the current auth avatar for the signed-in author in existing group
  messages;
- uses the author-feed total (`Math.min(server _count.posts, author total)`)
  as the displayed profile count while the feed is healthy;
- aligns the Messages tab gutters with the rest of the app;
- uses a static `expo-sharing` import so Metro no longer reports
  `Requiring unknown module "2757"`.

The only intentionally unresolved client item is search-result `_count.posts`
and any avatar/post image that is still rejected by the server. Those are fixed
by items 1 and 2 above.
