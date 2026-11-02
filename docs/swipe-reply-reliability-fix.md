# Swipe-left reply reliability follow-up

- **Date:** 2026-10-30
- **Baseline:** `c40b809dbfbc5ba54aaec6920d5181bcad783111`
- **Review:** existing [frontend PR #2](https://github.com/77elijah78/socialApp/pull/2), branch `arena/e4dfc24a-socialapp`.
- **Status:** source repair and automated checks completed; **not native/device acceptance sign-off**. No backend, dependency manifest, message storage, deployment or merge changes.

## 1. Inspected causes

The baseline common row gesture existed on all seven message types, but its constraints made it unnecessarily difficult to finish:

- It waited for 18 points left while failing at more than 12 points of vertical movement before activation.
- Completion independently rejected more than 20 points of vertical movement or less than a 2:1 horizontal/vertical ratio, even after a left swipe had already activated and animated.
- It used native `translationX` for the 56-point finish. Installed RNGH 2.31.1 Android `PanGestureHandler.activate()` resets its translation origin; the iOS custom-activation path also resets translation. The required finger travel could therefore exceed the stated completion threshold.
- The RN `FlatList` had no explicit relationship with row pans. Scroll competition was a source-level risk, **not a reproduced diagnosis on the user's device**.

Inspected the installed gesture builders, touch/state dispatcher, Android pan/native/orchestrator and iOS pan/native/failure relationships before adding coordination. It is still unknown which factor dominated on the user's device.

## 2. Files changed

| File | Purpose |
| --- | --- |
| `src/utils/messaging/swipeReply.ts` | Initial direction classifier and intent-required completion using total touch-down distance. |
| `src/components/chat/SwipeToReply.tsx` | UI-thread manual direction lock, original pointer/window coordinates, cancellation/reset/once-only guards and web fallback. |
| `src/components/chat/ChatGestureCoordinator.tsx` | Stable native scroll gesture shared with descendant row pans; no message or scroll-position state. |
| `src/app/(chatRoom)/privateRoom.tsx` | Attach the coordinator directly around the existing RN `FlatList`, without another native layout view. |
| `test/messaging/gesture-driver.cjs` | Load installed RNGH builders and JS lifecycle dispatcher; explicitly model native state transitions at the test boundary. |
| `test/messaging/harness.cjs` | Replace the hand-written Pan-only builder with the installed builder adapter. |
| `test/messaging/swipe-reply.test.cjs` | Ten direction, completion, lifecycle, cancellation, pointer and production-worklet regressions. |
| `test/messaging/interaction-ui.test.cjs` | Replay gesture lifecycles instead of direct end-only callbacks; add three screen/native-relationship/stability/web checks. |

This document and a historical-follow-up link in `messaging-system-fix-audit.md` document the change.

## 3. Behavior and architecture

- On Android/iOS, recognize left intent at **12 points**, requiring at least **1.2:1 horizontal dominance**. Release clearly vertical/right drags around **10 points**, and release unresolved diagonals by 12 vertical points. Taps/long presses remain unactivated and release on finger-up.
- Once left intent wins, later natural vertical drift does not veto it. Require **48 net points left from touch-down** at successful finger-up. Keep the existing **72-point visual cap**, themed indicator and spring parameters. Returning short/right before finger-up does not reply.
- Use absolute/window touch origin and end/update coordinates, not pan translation or a moving row's local coordinates. Keep a single original pointer; a second/replaced/invalid pointer invalidates the stream.
- Row pans `blocksExternalGesture` the one native scroll handler. There is no configured simultaneous reply/scroll relationship. The native handler is not forced active at touch-down or made non-interruptible; vertical/right/tap failure releases it. Untouched mounted rows do not hold the list pending.
- All gesture movement/decisions stay in worklets. Only a successful, once-only reply callback crosses to JS. No per-move React state, timers, forced refreshes or scroll corrections were added.
- Preserve all-type row composition, media children, existing reply/cancel composer path, latest-canonical-row validation, selection/busy/eligibility guards and draft retention. Image zoom/fullscreen players remain separate native views/routes.
- Preserve RN `FlatList`, its ref, measured cells/composer, history anchoring, virtualization and viewability handlers. The shared scroll gesture and each unchanged row pan remain stable across typing/receipt commits.
- **Web compatibility:** installed Reanimated `setGestureState.web` is a warning/no-op. Web therefore retains automatic offset-based pan recognition, uses browser `pan-y`, and does not attach the native coordinator or call manual state APIs. Its pre-activation diagonal tolerance remains bounded by automatic offsets; this is not native-equivalent manual direction locking.

## 4. Backend/API contracts

**None changed or added.** The existing canonical message, composer, reply payload and permission path are reused. No backend request, migration or live data mutation was needed for this gesture repair. All contracts and unrelated backend limitations in the original messaging audit remain unchanged.

## 5. Compatibility and remaining gaps

The test adapter executes the installed builders and JS callback lifecycle, but supplies modeled recognition/state transitions. It cannot demonstrate native recognizer ordering, physical vertical scroll ergonomics, OS interruptions, actual media responders or animation smoothness. Production Babel registration is checked separately so the native manual manager does not accidentally execute on JS. Web is configuration/lifecycle-tested, not browser-certified.

No extra runtime dependency or framework upgrade was introduced. Existing package audit findings were not automatically upgraded or suppressed.

## 6. Executed verification

| Check | Result |
| --- | --- |
| `npm test` | **282/282 pass**, no failures/cancellations/skips; 13 additional tests versus baseline 269. Includes all seven message types, current/deleted reply-source guards, composer/draft preservation and selection/Back behavior. |
| Focused swipe + interaction tests | **21/21 pass**. |
| ESLint on the eight changed/new TS/TSX/CJS source/test files, `--max-warnings 0` | **0 errors / 0 warnings**. |
| Expo Babel/Metro worklet regression | Both classifier/completion helpers and all eight gesture callbacks have worklet hashes; installed RNGH chooses Reanimated execution. Visual clamp/reversal/reset targets also checked with mocked spring physics. |
| Android offline production Expo export (`--max-workers 2`) | **Passed**, Hermes `.hbc`, approximately 6.5 MB. |
| iOS offline production Expo export (`--max-workers 2`) | **Passed**, Hermes `.hbc`, approximately 6.4 MB. |
| `npm run typecheck` | Only the same two pre-existing diagnostics: missing `@react-native-community/netinfo` at `useScreenState.ts(2,21)` and implicit-any `state` at `(108,56)`. No new diagnostics. |
| `git diff --check` | **Passed**. |

An additional adapted replay loaded the actual `c40b809` component/helper from Git alongside the new source and modeled activation-origin reset. Three representative intended paths (48-point travel, left-then-curved finish, early diagonal start) yielded **0 replies before / 1 after**. Long-straight, vertical-then-left and right-then-left controls retained their expected behavior. This is **JS model evidence, not a device reproduction**.

Exports/logs are outside the repository. Reproduce with `npm test`, changed-file ESLint, `npm run typecheck`, and `CI=1 EXPO_OFFLINE=1 npx expo export --platform android|ios --max-workers 2 --output-dir <external-directory>`.

## 7. Required native acceptance (not run here)

On both a real Android device and iPhone, test text, image, video, audio, document, shared post and shared story rows, incoming and outgoing:

1. Short/right/vertical motion, deliberate left swipes and naturally curved swipes; reversal before release; repeated attempts and a second finger.
2. Vertical scrolling/flinging from message content before/after a reply, including while the list is settling. No reply should simultaneously scroll the list.
3. Image tap/fullscreen/pinch, video play/fullscreen/controls, voice play/pause/tap-seek, document actions and long-press selection. Pending reply recognition must not consume these controls.
4. Keyboard open/closed, multiline draft, selection/busy mode, new receipts during the gesture, a deleted source, navigation away and OS interruption.
5. At different display scales and with variable-height media/history, assess actual touch distance, indicator/spring behavior and frame pacing.

No device, simulator, two-account/live-backend, native FPS/memory or real-browser acceptance run was performed. These checks are not replaced by successful exports or adapted tests.
