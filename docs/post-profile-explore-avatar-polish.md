# Post deletion sync, profile actions, Explore gutters, and avatar formats

Branch: `arena/8e08f1a0-socialapp`
Base: `main` @ `e6dfe03`
Scope: React Native / Expo / TypeScript client, plus a backend hand-off prompt for
the one restriction the client cannot fix.

## 1. Post deletion now reaches the profile immediately

The real deletion path was already `api.delete('/posts/:id')` →
`publishPostUpdate({postId, accountId, deleted:true})` → `usePosts` subscribers.
The profile was not a subscriber for its stats, so the grid could drop a row while
the “Posts” number remained stale until a manual refresh.

Implemented:

- `src/app/(tabs)/profile.tsx` subscribes with `subscribePostUpdates`. A
  `deleted` event owned by the signed-in account decrements the visible
  `_count.posts` immediately. `usePosts` already drops the corresponding grid
  row and lowers its live total.
- The profile performs a reconciliation fetch (`GET /users/:username` plus the
  author page refresh) when it regains focus after the first visit. This catches
  changes made elsewhere without refetching on every render.
- The displayed count is `Math.min(server posts, author-feed total)` once the
  author feed is ready and healthy; while that page is loading or failed, the
  profile keeps the server count. Deletions therefore show one consistent number
  on the header, the tab, and the grid.
- A deleted post is removed from the author feed by the existing post-update
  subscriber; no mock row or placeholder is inserted.

Tests: `test/posts/profile-update.test.cjs` publishes a real
`publishPostUpdate` deletion for the signed-in account and asserts the rendered
profile stat changes `2 → 1`. `test/posts/post-navigation.test.cjs` exercises the
same subscription path through `PostCollection`.

## 2. Profile post detail uses the feed action sheet

`src/utils/postMenu.ts` is now the single action-sheet builder used by both the
home feed and the profile/collection detail screen:

- save / “Remove from saved” toggle (errors show the existing app dialog);
- share;
- owner-only `Edit post` and destructive `Delete post` with a
  `Delete this post?` confirmation (`Cancel` / destructive `Delete post`);
- non-owner `Report`, `Hide post`, and `Unfollow` placeholders, matching the
  feed's current TODO state.

The owner check is `post.author.id === state.auth.user.id`. Deleting from the
profile detail calls `feed.deletePost(postId)` and then `router.back()` only when
that deleted id was the selected detail item, so the user never stays on a page
whose post no longer exists.

Tests: `test/posts/post-menu.test.cjs` covers owner/non-owner action sets, save
labeling, cancel-without-delete, confirmed delete, and the canonical failure
dialog. `test/posts/post-navigation.test.cjs` drives the actual
`PostCollection` card menu, confirms the owner action set, confirms deletion,
and asserts the detail screen closes.

## 3. Explore grid now uses the header gutter

The Explore header/search already used `LAYOUT.contentPadding`, but the
recommendation section added its own smaller `SPACING.xs`/`sm` insets and the
grid ran to the screen edges. The content container now owns one horizontal
padding equal to the header:

- `GRID_PADDING = theme.LAYOUT.contentPadding`;
- `gridWidth = screenWidth - 2 * GRID_PADDING`;
- `tileSize = (gridWidth - GRID_GAP * (columns - 1)) / columns`;
- `listContent` gets `paddingHorizontal: GRID_PADDING`;
- the redundant intro/heading/callout horizontal margins were removed.

The intro, heading, grid, and footer now share exactly the header's left and
right edges. `test/posts/explore-screen.test.cjs` and the existing Explore tests
remain green.

## 4. Avatars accept all image files on the client

The avatar picker was already opened with `mediaTypes: images`, but the upload
path had two narrow-format assumptions:

- unknown extensions were labelled `image/jpeg`, which could send HEIC bytes
  under a JPEG MIME;
- the iOS picker could return a HEIC representation that the server rejects.

Implemented:

- `src/utils/imageMime.ts` provides a broad extension → MIME map and MIME
  inference from the picked `mimeType`, filename, or URI. It is deliberately not
  an upload allowlist.
- `src/utils/avatarUpload.ts` (`avatarFileForUpload`) accepts any `image/*`
  value, preserves the true MIME, normalizes the filename extension to that MIME,
  keeps opaque provider filenames when the MIME is image, and enforces the
  server's 5 MB limit before the request. Explicit video/non-image files are
  rejected with a human-readable message.
- `src/hooks/useImagePicker.ts` now requests
  `preferredAssetRepresentationMode: Compatible` on iOS 14+, so HEIC/HEIF
  library assets are converted to JPEG by the system when possible. Pickers can
  override the mode; camera captures remain JPEG.
- All avatar entry points share one implementation:
  - `src/services/AvatarService.ts` (`uploadAvatarAsset`) uses the new helper;
  - `src/app/editProfile.tsx` now calls `uploadAvatarAsset` instead of building
    its own multipart body;
  - `src/services/MediaUploader.ts` avatar shorthand uses the same helper.
- Group/channel avatar pickers already call `uploadAvatarAsset`, so they inherit
  the same behavior.

Tests: `test/features/avatar-image-support.test.cjs` covers HEIC, AVIF, BMP,
TIFF, SVG, DNG, an opaque content-provider URI with an unusual `image/*` MIME, a
JPEG payload named `.HEIC`, video/non-image rejection, the 5 MB boundary, and
the exact multipart arguments sent to `/media/upload/avatar`.

### Server-side limitation

The inspected backend (`77elijah78/nodejs-socialapp` @ `eb79c44`) still restricts
avatars to `image/jpeg`, `image/png`, `image/gif`, and `image/webp`. Its Multer
disk destination calls `getCategoryFromMime` **before** the avatar filter, so
HEIC/AVIF/BMP/TIFF/RAW fail with `Unsupported file type` even though the client
now sends them correctly. A backend prompt with exact current code references,
an avatar-only Multer storage/filter, Sharp decoding/normalization to WebP,
security rules, acceptance tests, and documentation updates is in
[`docs/prompts/backend-avatar-all-image-types.md`](prompts/backend-avatar-all-image-types.md).

Until that server change ships, the client accepts and uploads the file but the
server may still return its existing rejection. No client-side rule is presented
as server enforcement.

## Verification

- `npx tsc --noEmit` — exit 0.
- `npx eslint` on the new/changed implementation files — 0 errors, 0 warnings
  in the touched files (the previous `home.tsx` exhaustive-deps warning was also
  fixed by adding `openPost` to the feed renderer dependencies).
- `npm test` — **732 pass / 0 fail** (was 721 before this task; 11 new tests:
  6 menu/profile/avatar-support, 5 avatar transport).
- No mock data or invented endpoints. The only unimplemented menu items remain
  the same `Report`/`Hide post`/`Unfollow` placeholders the feed already had.

## Residual checks

- Physical iOS HEIC selection and Android provider selection were not executed in
  this sandbox; the picker option and helper contracts are covered by tests.
- Avatar format acceptance depends on the backend prompt being applied. The
  frontend no longer narrows the set itself.
- Deleting from the home feed while the profile tab is already mounted is covered
  by the subscription test; a full device navigation soak remains a manual QA
  step.
