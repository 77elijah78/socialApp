# Post input positioning and keyboard audit

> **Historical / superseded:** This records the implementation delivered in `43ecbcc`, whose positioning the user subsequently reported was worse. Its keyboard/positioning changes have since been **selectively** rolled back, while unrelated improvements were retained. Read [the current refinement audit](ui-refinement-audit.md) for the active implementation, regression explanation, and verification limits. Passing tests/exports below did not establish native keyboard quality.

Date: 2026-10-29

## Scope and outcome

Audited post creation/editing, the global comment sheet, the routed comments screen, their lists/scroll views, safe areas, keyboard handlers/animations, provider hierarchy, native dependency implementations, and navigation presentation. The root causes were explained in the conversation **before source changes**.

Changes are limited to three post UI files, test scripts, a regression suite, and this report. No dependency, theme, backend/API contract, app-wide keyboard setting, navigation configuration, or prior messaging implementation was changed. All three existing `StyleSheet.create` definitions are byte-for-byte unchanged.

**Automated checks pass for component behavior and bundle compilation. Native keyboard positioning and animation smoothness still require device validation.**

## What was causing the problem

### 1. The comment composer had competing position owners

`src/components/posts/CommentBottomSheet.tsx` combined:

- Gorhom `keyboardBehavior="extend"` and `keyboardBlurBehavior="restore"`;
- application-owned keyboard show/hide listeners and `Animated.timing`;
- an interpolation from keyboard heights `[0, 400]` to translations `[0, -420]`;
- replacing the `["66%", "92%"]` snap array with `["66%"]` while the keyboard was visible at the lower detent.

This meant the sheet's position, its detent geometry, and the composer's visual translation could change through different paths. The translation amplified ordinary keyboard heights and clamped larger ones, without measuring overlap. Android's application listener ran on `keyboardDidShow`, adding a second adjustment after the keyboard appeared.

The composer was also an ordinary child, not a registered Gorhom footer. Gorhom sizes its content relative to its largest detent; an in-flow child at the end of that content is not an anchor to the currently visible sheet bottom. Translating that child does not update the list's reserved space, allowing comments to sit behind it.

### 2. Android creation relied on a native resize that the provider suppresses

`CreatePostScreen.tsx` used React Native's `KeyboardAvoidingView` with `behavior` undefined on Android, around an ordinary `ScrollView`. The global `KeyboardProvider` is active.

Inspection of installed keyboard-controller 1.21.13's Android `EdgeToEdgeReactViewGroup.setupWindowInsets` confirmed that it applies IME bottom margins for resize only when the provider is **inactive**. Consequently, the creation screen had no active Android keyboard-layout strategy under the actual provider configuration.

Ordinary scrolling also did not provide the controller's caret/selection tracking for long multiline captions.

### 3. Insets and navigation offsets were not consistently owned

- The comment sheet passed `bottomInset={0}` and did not read safe-area insets.
- The routed comments screen used React Native keyboard avoidance with a fixed zero navigation offset and no bottom safe-area wrapper.
- Creation already had an outer safe area. Its bottom inset must be compensated, not added a second time above the keyboard.
- Creation is a root-stack modal with a hidden native header, **outside the tabs**. Tab-bar padding would be incorrect. Routed comments retain the existing native stack header, which owns their top inset.

Provider path: `SafeAreaProvider → KeyboardProvider → Redux/Persist/Paper → GestureHandlerRootView → BottomSheetModalProvider → OverlayProvider → Stack`. The overlay provider globally mounts the comment sheet. No extra providers were introduced.

## Positioning after the fix

### Creation/editing: one controller strategy, separate responsibilities

`CreatePostScreen.tsx` now uses the already-installed controller's:

- `KeyboardAwareScrollView` for focused-caret visibility and multiline/selection tracking;
- `KeyboardStickyView` for the bottom photo-action footer.

There is **no wrapping keyboard avoider**. Native keyboard inset adjustment is explicitly disabled, and content inset adjustment is `never`. Thus the scrollable viewport is not also resized by another application mechanism. The footer remains in the original flex layout when the keyboard is closed.

The footer reports its actual height with `onLayout`. That measurement becomes `bottomOffset` for the caret-aware scroll view, so a wrapping footer hint, different screen width, or changed text size is not approximated with a fixed keyboard offset.

For an aligned window, let:

- `H` be window height;
- `B` be the existing outer safe-area bottom inset;
- `F` be measured footer height;
- `K` be keyboard height.

The closed footer bottom is `H − B`. Its controller-driven open translation is `−K + B`, giving an open footer bottom of `H − K`, exactly the keyboard top. The scroll view targets caret clearance above that footer using `F`, and its extra keyboard space is `−B` because the outer safe area already removed `B`.

These are inset/measurement compensations, not arbitrary offsets. The library measures focused inputs and scroll-view positions in the native window, including modal placement; the simplified calculation is not a substitute for those measurements. Keyboard frames and translation run through the controller/Reanimated path, without application keyboard listeners, custom timing curves, or scroll-to-end chains.

### Comment sheet: Gorhom owns all sheet/composer positioning

`CommentBottomSheet.tsx` now:

- keeps `["66%", "92%"]` stable throughout keyboard cycles;
- registers `CommentSheetComposer` using `footerComponent` and `BottomSheetFooter`;
- enables `enableFooterMarginAdjustment` on `BottomSheetFlatList`, reserving measured composer height, including multiline growth and the reply preview;
- supplies actual top/bottom safe-area insets to the modal, and left/right insets to the header/list/composer;
- removes the custom animated value, translation, show/hide listeners, and keyboard-dependent detent bookkeeping;
- disables additional native list keyboard inset adjustment.

The existing Gorhom `extend`/`restore` policy is retained. **The sheet may extend once to the upper detent on focus**, then restore the previous resting detent on blur. The footer is independently anchored by Gorhom's measured position, so sheet extension does not add another upward translation to the composer. The fix does not freeze the entire sheet at 66% while typing.

In the library's local coordinates, footer translation is based on `containerHeight − sheetPosition − keyboardOverlap − footerHeight − handleHeight`. Adding the sheet/handle position cancels those terms: the footer bottom is the usable container bottom minus the real keyboard overlap, not that overlap plus a manual 420-point adjustment.

The sheet's `android_keyboardInputMode` flag is `adjustPan`: this tells Gorhom to retain keyboard height in its calculations. Its `adjustResize` branch explicitly discards that height, assuming the native root has already resized—which is not true under this active provider. This Gorhom flag does **not** change the OS window mode. `app.json` keeps `softwareKeyboardLayoutMode: "resize"` for the keyboard controller's native event pipeline.

Composer draft, bounded input height (the existing 44–88 design), reply target, and busy state live in a stable component within the same file. `renderFooter` does not depend on draft/height/reply/busy/keyboard visibility. This prevents changing the React component type and remounting the native input on each keystroke or send-state change. An imperative reply/reset interface preserves opening and reply behavior, including reopening an already-open post. No context is assumed to propagate across Gorhom's portal.

REST paths, optimistic comments, reply IDs, avatar rendering, and existing send-failure behavior are retained. The existing profile-navigation frame scheduled after dismissal is unrelated to positioning and was not replaced with keyboard timing workarounds.

### Routed comments: one measured avoider

`src/app/posts/[id]/comments.tsx` now uses the controller's `KeyboardAvoidingView`, with `behavior="padding"` and `automaticOffset`. Its native window measurement accounts for the existing stack header and actual screen placement rather than guessing a header height.

The safe-area wrapper sits outside that avoider and owns left/right/bottom only; the existing native stack header owns the top. The list and composer stay in normal flow. Native list keyboard insets are disabled to prevent a second adjustment. The original single-line routed input behavior is unchanged.

## Exact changed files

| File | Change |
| --- | --- |
| `src/components/posts/CreatePostScreen.tsx` | Controller caret-aware scrolling, measured keyboard-sticky photo footer, safe-area compensation; remove inactive/competing RN avoidance. |
| `src/components/posts/CommentBottomSheet.tsx` | Registered stable composer/footer, fixed detents, measured list reservation, actual safe areas; remove manual keyboard animation/listeners. |
| `src/app/posts/[id]/comments.tsx` | Controller avoider with measured offset and explicit safe-area/inset ownership. |
| `test/posts/input-layout.test.cjs` | 20 component/layout-ownership regressions using the existing TS loader and mocked native APIs. |
| `package.json` | Include post regressions in `npm test`; add `npm run test:posts`. No dependency changes. |
| `docs/post-input-layout-audit.md` | Audit, calculations, actual verification results, and remaining device checklist. |

## Checks actually performed

| Command/check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed; restored existing dependencies. |
| `npm run test:posts` | 20/20 passed on the initial run; final revised cases are included in the full run below. |
| `npm test` | **85/85 passed**, zero failures/skips: 65 existing messaging tests plus 20 post tests. |
| Scoped ESLint on the three changed TSX files and the new test | **0 errors**, 179 existing warnings (61 routed comments, 118 creation, 0 sheet/test), unchanged from the scoped pre-change baseline. |
| `npm run typecheck` | Same two pre-change diagnostics, with byte-identical output: missing `@react-native-community/netinfo` and implicit-any `state`, both in untouched `src/hooks/useScreenState.ts`. |
| `npm run lint` | Still fails repository-wide: 16 errors, 2346 warnings. All error locations are outside this task's changed files. |
| `EXPO_OFFLINE=1 npx expo export --platform android --platform ios --max-workers 2 --output-dir dist` | Passed for both platforms. This compiles JS/Hermes bundles, **not native app binaries**. Generated output remains ignored. |
| `git diff --check` | Passed. |
| Turn-entry file-hash comparison | Only the listed existing post files and package scripts changed; prior messaging files, lockfile, providers, theme, app configuration, and navigation files were preserved. All three style-definition blocks are unchanged. |

The new component tests exercise simulated keyboard visibility cycles, input-instance/footer identity, bounded multiline size events, no list render from draft-only edits, reply/cancel/pending-send behavior, optimistic/API payloads, image upload and post editing, dismiss/reopen and same/different-post opening, profile-navigation ordering, and unmount/remount cleanup. Both Android/iOS branches are exercised where applicable.

Measurement/inset contracts are exercised at logical viewports **320×568, 393×873, 430×932, 1024×1366, and 844×390**, including zero, gesture/home-indicator, and horizontal-cutout insets. Translation algebra checks use keyboard heights 220, 300, and 420. These are **mocked scenarios and calculation assertions, not screenshots or physical-device measurements**. Actual animation frames, native focus, footer visibility, scroll clipping, and FPS are not implemented by the native mocks. Renderer deprecation and Node SQLite experimental warnings are expected from the existing test setup.

Full-lint errors remain in `PostCard.tsx`, `ImageMessage.tsx`, `useNetworkStatus.ts`, `useScreenState.ts`, `useStories.ts`, and `useVoiceRecorder.ts`; they were not hidden with ignores or unrelated rewrites.

## Required native acceptance checks — not yet performed

This environment has no Android SDK, `adb`, emulator, iOS simulator, or connected phone. No POCO X3 performance, native visual correctness, or live backend success is claimed. Existing SDK/native dependency caveats in `docs/messaging-audit.md` were not upgraded away in this task.

Use a native development build for functionality and a release/profile build for smoothness:

1. **Initial open:** create/edit a post, open comments at each resting detent, and open the routed comments page. Verify the input/footer is visible before focus, aligned to existing content, clear of system controls, and does not receive tab-bar padding.
2. **Focus/open:** focus each input. Verify one movement, no overshoot or second lift, and no extra bottom-safe-area gap above IME. In the sheet, expect the single configured extension to the upper detent, with the footer still adjacent to IME.
3. **Typing:** add/remove lines, paste a long caption, move the caret into earlier lines, and type through the comment composer's height cap. Verify caret visibility above the photo footer and automatic comment-list clearance above composer/reply preview.
4. **Dismiss/reopen:** use Android Back, scroll-drag dismissal, iOS interactive dismissal where supported, and repeated focus cycles. Verify restoration of the previous sheet detent and footer resting position, without shaking or a remounted input.
5. **Reply/send/media:** reply, cancel, send with a slow response, add/remove photos, open camera/library, and edit/save. Verify controls remain reachable and posting behavior is unchanged.
6. **Navigation:** close or dismiss the sheet with the keyboard open, navigate to a profile, leave/return to each post screen, and reopen the same and a different post. Verify no stuck keyboard, stale composer placement, or accumulated listener-driven movement.
7. **Device matrix:** POCO X3-class Android in gesture and three-button navigation, small and large screens/tablet, permitted split-screen/window resizing, larger system text, different keyboard heights/toolbars/emoji modes, plus iOS home-indicator and non-home-indicator devices. The app remains configured portrait; landscape-sized automated cases are geometry robustness checks, not an orientation-setting change.
8. **Performance evidence:** capture frame pacing on the POCO-class device at its available refresh rates under normal and long multiline typing. Confirm no application JS keyboard-frame work or per-keystroke comment-list rendering, and check native footer measurements/scroll clipping during IME transitions. Do not infer FPS or device smoothness from the mocked component tests or export success.
