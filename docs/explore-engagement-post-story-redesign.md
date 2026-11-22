# Explore, engagement, creation and navigation redesign

Branch: `arena/8e08f1a0-socialapp` (Expo SDK 56 / React Native 0.85 / TypeScript).
Scope: implemented in the existing app; no new project, no new dependency, no mock data in production paths.

## Implemented

### 1. Explore — real ranked discovery

- Replaced the decorative Explore screen with `GET /posts/explore?limit=24`, cursor pagination, explicit pull-to-refresh (`refresh=true`) and a refresh button.
- Responsive 2/3/4-column edge-to-edge grid (`FlatList`), square cells, `expo-image` thumbnails through `AuthenticatedImage` (`memory-disk`, recycling keys) and **no video players in the grid**. Video and multi-photo badges plus like/comment counts are overlaid.
- Text-only and video-without-poster posts get a gradient tile instead of a broken image.
- Initial skeleton (`ExploreGridSkeleton`), full error state with retry, inline refresh error when cached posts exist, empty/"nothing new" state, pagination spinner, expired-cursor retry and caught-up footer.
- Cursor handling is defensive: `meta.nextCursor/hasNext/exhausted/expiresAt`, a 400/cursor error never crashes the screen. A fresh snapshot (60 s) renders from cache without consuming the server's seen history; cache TTL is 5 min.
- Dedupe across pages, one in-flight page request, stale account responses aborted/ignored, confirmed post updates (like/save/delete) applied without a feed refetch.
- People search uses the existing `/users/search` contract. Non-empty queries replace the grid with `PeopleSearchResults` (rows, verified badge, follow/unfollow with ref-based single flight, loading/error/empty states).

### 2. Comment likes

- Optimistic like/unlike per comment, immediately reflected in that row; server count/flag reconcile the row on success, and a failure rolls back **only that comment**.
- Duplicate taps share one in-flight request per comment; no full comment-list refresh.
- Canonical `likesCount`/`isLikedByCurrentUser` preferred, legacy `likeCount`/`isLiked`/`_count.likes` tolerated, and unknown state is never presented as authoritative.
- Row layout: avatar, name, content, time, heart + count, Reply. Wired in both the comments page and the comment bottom sheet.

### 3. Accurate post/comment counts

- Canonical mapping for `likesCount`, `commentsCount`, `isLikedByCurrentUser`, `isBookmarkedByCurrentUser` with safe legacy fallbacks (`_count`, `isLiked`, `isSaved`).
- Confirmed like/save responses now replace local guesses with server counts/flags and publish one update to Home/Explore/Profile/Saved, so every mounted screen converges without refetching.
- `likeStateKnown`/`saveStateKnown` retained so legacy endpoints that omit membership never cause fabricated state.
- Bookmark membership in `/posts/saved` is authoritative (`isBookmarked: true`).

### 4. Bookmarks → real post detail (regression fix)

- Grid tiles and card bodies now push `/posts/[id]` with the original id instead of opening comments.
- Comments only open from the explicit comment action (card button or post detail).
- Post detail reuses the existing `PostCollection` and `PostCard`; deleted/unavailable posts get a clear error + retry.
- Unbookmark publishes a confirmed update; the saved collection removes the row and total without a full reload.

### 5. Single-screen post composer

- Author card, caption (2,000 chars, hashtag insertion, counter), media section, upload-progress card, inline dismissible error and prominent Publish.
- Media: library or camera, up to four photos **or** one video, previews, remove, reorder; mixing a gallery video resets the selection to that video rather than inventing a mixed payload.
- Per-file upload progress from the existing XHR path (`api.upload` now forwards `onProgress`), then publish/save progress to 100%.
- Duplicate-submit guard (ref + disabled controls), close/remove/reorder disabled while busy, selected media kept on failure so retry works.
- Edit mode remains `postId` + `GET /posts/:id` + `PATCH /posts/:id`; `videoUrl` is omitted when there is no video, preserving the old contract for image-only posts.
- Location/privacy were not added because the API and post model expose neither.

### 6. Story creation

- New modal route `/stories/create` with a dedicated `CreateStoryScreen`: pick from library or camera, photo or 60 s video, live preview (video plays muted/looping), replace/remove, optional caption, real upload progress and a single clear Share action.
- `POST /media/upload` → `POST /posts/stories` with `mediaUrl`, `mediaType` and optional caption; failure keeps the selection, shows the server message and allows retry.
- Duplicate-submit guard; after a confirmed publish the action becomes “Story shared” and cannot republish. The home Stories bar refreshes once via `subscribeStoryCreated` (no polling, no focus refetch).
- StoriesBar now navigates to the creator instead of uploading inline (removing duplicate creation code). Own ring still views when a story exists; add button and long-press create another.
- The existing app has no text/sticker/drawing story editor, so none was invented.

### 7. Navigation / state

- One canonical open: `router.push({ pathname: "/posts/[id]", params: { id } })` from Home, Explore, Saved/author grids, and card bodies.
- Comment sheet/page remain explicit actions; no route or card opens them implicitly.
- Shared confirmation events (`postUpdates`, `storyUpdates`) keep screens in sync with minimal re-renders.
- Story creator registered as a modal in the root Stack.

### 8. Performance

- Memoized `ExploreTile`; image-only grid; `FlatList` tuning (`initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews` on Android).
- Cached first Explore page, bounded page sizes, single-flight pagination and mutations, no mutation-driven refetch.
- Bookmark/author grid uses `expo-image` caching and responsive tile widths; counts formatted consistently.
- Comments and post lists update by id rather than refetching whole collections.

## Files

Created:

- `src/hooks/useExploreFeed.ts`
- `src/components/explore/ExploreTile.tsx`
- `src/components/explore/PeopleSearchResults.tsx`
- `src/components/stories/CreateStoryScreen.tsx`
- `src/app/stories/create.tsx`
- `src/utils/format.ts`
- `src/utils/storyUpdates.ts`
- `test/posts/explore.test.cjs`
- `test/posts/explore-screen.test.cjs`
- `test/posts/comment-likes.test.cjs`
- `test/posts/post-navigation.test.cjs`
- `test/posts/story-create.test.cjs`

Modified:

- `src/app/(tabs)/explore.tsx`, `src/app/(tabs)/home.tsx`, `src/app/_layout.tsx`
- `src/app/posts/[id]/comments.tsx`, `src/app/posts/[id]/index.tsx` (reused, unchanged detail contract)
- `src/components/feed/PostCard.tsx`, `src/components/feed/StoriesBar.tsx`
- `src/components/posts/PostCollection.tsx`, `CreatePostScreen.tsx`, `CommentThread.tsx`, `CommentBottomSheet.tsx`
- `src/components/ui/Skeleton.tsx`, `src/components/ui/index.ts`
- `src/hooks/useImagePicker.ts`, `usePostComments.ts`, `usePosts.ts`
- `src/services/api.ts`
- `src/types/index.ts`
- `src/utils/postContracts.ts`

## API integration

| Purpose | Endpoint |
| --- | --- |
| Ranked Explore snapshot | `GET /posts/explore?limit=24[&cursor|&refresh]` |
| Comment like / unlike | `POST / DELETE /posts/:id/comments/:commentId/like` |
| Saved collection | existing `GET /posts/saved` (canonical engagement fields consumed) |
| People search | existing `GET /users/search?q=` |
| Post create/edit | `POST /posts`, `PATCH /posts/:id` |
| Media upload | `POST /media/upload` (XHR progress forwarded) |
| Stories | `POST /posts/stories` |
| Post detail | existing `GET /posts/:id` |

Explore and comment-like endpoints live on backend branch `arena/1275dc5e-nodejs-socialapp`; until that deploy reaches the target environment, Explore shows its error/retry state and comment likes surface a real error rather than inventing success.

## Tests run

- `npx tsc --noEmit` — clean.
- `npm test` — **681 passed, 0 failed** (660 pre-existing + 21 new).
  - New: Explore hook contracts (7), Explore screen wiring (3), comment likes (5), bookmark navigation (2), story creation (4).
  - Existing post create/input tests (48) still pass, including multi-image publish, publish failure and layout/keyboard contracts.
- `npm run lint` — no new errors; the 7 remaining errors are pre-existing `react-hooks/refs` violations in `src/hooks/useVoiceRecorder.ts`. New files only carry the repo-wide `theme` named-export warnings.

## Remaining limitations

- Not device/simulator-certified and not exercised against a live backend in this environment; verification is typecheck + mounted component/hook tests.
- Comments still render the first page returned by `GET /posts/:id` (20). The backend now supports comment cursors, but adding comment pagination was outside this brief; the UI accurately says “Showing the latest N of M”.
- Explore search is people search; no post/hashtag search endpoint exists.
- No location/privacy controls (unsupported by API/model).
- No story text/sticker/drawing tools (none existed).
- Video stories require backend acceptance of `mediaType: "video"`; if a deployment rejects it, the creator shows the server error and keeps the selection.
- Explore is rate-limited (30/min server-side); repeated manual refreshes can return 429 and are surfaced as a retryable error.
