# Post-positioning rollback and authentication UI refinement

Date: 2026-10-29

Baseline: `43ecbcc8a745ddacdabcc9488dbecf4affdc1990`

Historical positioning reference: its parent, `4be0374`

## Outcome and scope

Selectively restored the earlier post keyboard/positioning behavior and redesigned login and signup as a coordinated, shared interface. The comparison, regression explanation, and implementation plan were given before source changes.

This is **not a whole-file or whole-commit revert**. Post styling, isolated composer state, API/optimistic/reply/reset behavior, horizontal safe-area improvements, and the preceding messaging implementation remain intact. All three post `StyleSheet.create` blocks are byte-for-byte unchanged from the baseline.

Authentication still uses the existing `AuthService`, endpoints, account preparation, Redux credentials, and token persistence. There are **no app dependency or lockfile changes**. Browser-review tooling was installed separately, outside the repository.

**Verified:** automated component/service regressions, an isolated React Native Web layout review, and Android/iOS bundle exports. **Not verified:** physical-device keyboard positioning, animation smoothness, accessibility with native screen readers, or live-credential/backend authentication.

## 1. What regressed in the previous post change

The key behavior change is visible in the historical diff:

- Before `43ecbcc`, the sheet supplied only the `66%` detent while the keyboard was visible and the remembered resting index was the lower detent. Otherwise it supplied `66%` and `92%`.
- `43ecbcc` replaced that guard with a constant two-detent array, while retaining Gorhom's `keyboardBehavior="extend"`. With both detents available, `extend` can move a lower sheet toward the upper detent on focus. This changed the interaction, rather than only removing a redundant animation.
- The same change also replaced the in-flow translated composer with a Gorhom footer, changed the sheet's inset/Android keyboard-mode inputs, and replaced creation's ordinary scroll/in-flow-footer arrangement with a keyboard-aware body and sticky footer. Routed comments also changed keyboard-avoidance ownership and offset calculation.

Those simultaneous changes explain why the previous patch could feel substantially different. The lower-detent guard removal is a concrete behavioral regression; this environment cannot establish the exact timing or perceived contribution of each change on the user's device. The previous passing mocked tests and exports did not establish native animation quality.

## 2. Selective post restoration

### Comment sheet

Restored the historical:

- Keyboard-visible/lower-resting-detent guard and remembered snap-index behavior; the remembered index updates only while the keyboard is hidden and resets on opening/dismissal.
- Keyboard show/hide subscriptions and animated in-flow composer, with subscription cleanup.
- Existing interpolation `[0, 400] → [0, -420]`, clamped, including the earlier platform event selection and animation timing behavior.
- `android_keyboardInputMode="adjustResize"`, `bottomInset={0}`, and absence of the newer explicit top inset.

Kept the stable, separately managed composer/input, draft/reply/sending/reset behavior, comment API payloads, optimistic insertion, profile navigation, and horizontal safe-area handling from the newer work.

### Creation and routed comments

- Creation/editing returns to React Native's `KeyboardAvoidingView`, ordinary `ScrollView`, and an in-flow action footer. Historical behavior/offsets were restored, including the existing iOS `100` offset; they were not newly tuned.
- Routed comments returns to the earlier native `KeyboardAvoidingView` behavior and zero offset, while retaining its bottom/horizontal safe-area wrapper.
- Explicitly disabled automatic keyboard/content inset adjustment where the application already owns it; retained useful scroll dismissal/tap handling.

No new post margins, padding, animation ranges, or guessed position offsets were introduced. This intentionally restores the requested earlier strategy; it does not claim that the legacy interpolation is a universally ideal keyboard architecture.

## 3. Coordinated login/signup redesign

### Presentation

- White surfaces, the existing violet palette, a native icon/wordmark, clear introduction, consistent typography, and shared field/button/link treatment. No gradients, decorative illustrations, or shadows were added.
- A full-width shell capped at `440`, with shared mobile gutters, scrolling for short screens/landscape, all-edge safe areas, and dark native status-bar content.
- A single keyboard-aware scroll owner in `insets` mode. Its caret gap uses the existing spacing token; already-consumed bottom safe area is accounted for, and competing automatic keyboard insets are disabled.
- Minimum `55` field containers/primary buttons and `44` secondary touch actions. Focus, inline validation, secure-entry toggles, keyboard Next/Done, loading/disabled/busy states, and accessible error announcements are shared.
- Server errors appear near the submission action, without moving already-entered fields. Error copy uses a high-contrast theme foreground; tinted-field placeholders use the existing darker gray token.
- Login/signup use a native stack fade. No timers, repeated scrolling, or extra layout animations were added to form focus/typing.

### Authentication contracts

- Login starts empty, accepts the existing email/username identity input, and still sends `{ email, password }` through `AuthService.login`. Identity is trimmed; passwords are never trimmed. Backend acceptance of username identifiers was not independently verified.
- Signup keeps the actual three-input flow: full name, email, password. It preserves the exact earlier name-to-username sanitizer and sends `{ email, password, username, displayName }`. The generated username is explained/shown rather than introducing a new account contract.
- Required-field and signup email-format feedback are local. Password-strength feedback is advisory: no invented minimum-length/complexity policy was imposed.
- Service error messages, including nonempty `.message` properties on plain error objects, are preserved with a useful fallback. An in-flight guard prevents rapid duplicate submissions; loading disables edits/navigation. A mounted guard prevents late responses from updating or navigating an abandoned form; it does not replace/cancel the service's existing persistence behavior.
- Social buttons previously had no integration and are omitted. No fabricated OAuth or terms flow was added.
- The forgot-password action now opens the correct route. Because no reset backend is implemented, that screen explicitly says recovery is unavailable and returns to login; it never claims an email/reset was sent. The existing OTP screen is untouched.

## 4. Exact changed files

| File | Change |
| --- | --- |
| `src/components/posts/CommentBottomSheet.tsx` | Selective historical positioning/animation restoration; retained isolated composer and functional improvements. |
| `src/components/posts/CreatePostScreen.tsx` | Historical native avoidance, ordinary scrolling, in-flow footer. |
| `src/app/posts/[id]/comments.tsx` | Historical native avoidance; retained safe-area wrapper. |
| `src/components/auth/AuthScreen.tsx` | **New:** shared safe-area, keyboard/scroll, branding, introduction, and footer shell. |
| `src/components/auth/AuthField.tsx` | **New:** reusable labeled input with focus, hint/error, secure-entry toggle, and refs. |
| `src/components/auth/AuthForm.tsx` | **New:** coordinated presentation, focus chain, feedback, links, loading action. |
| `src/hooks/useAuthForm.ts` | **New:** form state/validation, service calls, duplicate-submit and mount guards. |
| `src/utils/authForm.ts` | **New:** exact username generation, validation, advisory strength, error-message helpers. |
| `src/app/(auth)/login.tsx` | Thin login-mode route; removed hardcoded demo inputs and dead social controls. |
| `src/app/(auth)/register.tsx` | Thin signup-mode route using the same presentation/logic. |
| `src/app/(auth)/forgot-password.tsx` | Honest unsupported-recovery notice/back action instead of fake success. |
| `src/app/(auth)/_layout.tsx` | Fade only for login/signup. |
| `src/components/common/PrimaryButton.tsx` | Compatible loading/spinner/disabled/accessibility support using existing theme. |
| `src/types/index.ts` | Optional `loading`/`loadingLabel` button props only. |
| `test/posts/input-layout.test.cjs` | Revised positioning contracts; retained functional regressions; 21 tests. |
| `test/auth/screens.test.cjs` | **New:** 28 authentication component/service regression tests. |
| `package.json` | Added auth test command and included it in the full suite; dependencies unchanged. |
| `docs/post-input-layout-audit.md` | Marked the prior audit historical/superseded. |
| `docs/ui-refinement-audit.md` | This report. |

`AuthService.ts`, `authSlice.ts`, root providers/navigation, theme constants, package lock, backend/API configuration, messaging production code/tests, and OTP were not changed.

## 5. Verification actually performed

| Check | Result |
| --- | --- |
| `npm test` | **114/114 pass:** 65 messaging + 21 post + 28 auth. |
| `npm run test:posts` | **21/21 pass** after revising historical positioning assertions. |
| `npm run test:auth` | **28/28 pass**; real screens/hook/service/reducer with HTTP/native/storage/account-preparation adapters. |
| ESLint, changed production/test files | **0 errors**, 179 existing warnings in creation (118) and routed comments (61); new auth code/tests, button, and sheet have no warnings. |
| Project lint (`npm run lint`, Expo's source-file scope) | Still **16 errors / 2,247 warnings**; error-bearing production files are unchanged. The previous project-lint run had 16 errors / 2,346 warnings. |
| Broader `npx eslint . --format json` | **19 errors / 2,248 warnings**, because this also includes existing CommonJS messaging tests. All error-bearing files match their pre-edit SHA-256 hashes; the extra three errors/one warning are outside this change. |
| `npm run typecheck` | Same two baseline errors, exact output comparison unchanged: missing `@react-native-community/netinfo` and consequent implicit-any `state` in `useScreenState.ts`. |
| `EXPO_OFFLINE=1 npx expo export --platform android --platform ios --max-workers 2 --output-dir dist` | **Pass:** both Hermes bundles exported. This is not an installed native build/device test. |
| Isolated browser review | **10 viewport/mode checks pass**; actual auth presentation on React Native Web, native keyboard/safe-area/router/service adapters mocked. |
| Scope/style/hash review and `git diff --check` | Only the listed files changed; post style blocks and protected auth/theme/provider/dependency files unchanged; no whitespace errors. |

Auth regression coverage includes valid/invalid submission, exact payloads and generated usernames, untrimmed/short passwords, real Redux credential/token integration with mocked persistence, server rejection and network retry, duplicate submissions/loading, stable password visibility, invalid/Next focus, navigation/recovery, lifecycle guards, and responsive layout contracts.

Post regressions cover detent gating including an expanded resting sheet, listener cleanup/legacy animation contracts, stable input identity, draft/reply/reset behavior, optimistic payloads, API submission, and profile navigation. These do **not** measure native frames or prove absence of IME jumps.

Browser viewports, each checked for login and signup:

| Width × height | Review |
| --- | --- |
| `320 × 568` | Small phone; scrolling and no horizontal overflow. |
| `393 × 873` | Typical portrait; default/error/loading screenshots reviewed. |
| `430 × 932` | Larger phone. |
| `1024 × 1366` | Tablet-width centering/max-width. |
| `844 × 390` | Short landscape viewport. |

Browser assertions checked input/button horizontal bounds, touch-control minimum height, and actual password show/hide interaction. Four screenshots were captured/reviewed. They are browser-adapted UI evidence, not screenshots from an Android/iOS device. Temporary browser packages, bundles, screenshots, exports, and logs were kept out of Git.

## 6. Required native/live follow-up

No Android SDK/emulator, iOS simulator, or verified test-backend credentials were available. A full real-credential or native keyboard pass cannot honestly be reported from this environment.

Before treating positioning as device-verified:

1. On Android and iOS, open a fresh comment sheet at `66%`, focus/type/reply, dismiss/reopen the keyboard repeatedly, then close/reopen the sheet. Confirm no forced jump to `92%`, lost draft, delayed movement, or system-bar overlap.
2. Expand to `92%` before focusing; confirm keyboard dismissal restores the intended expanded rest state. Exercise profile navigation and dismiss/reopen while requests finish.
3. Test long creation/edit captions and routed comments with keyboard show/hide, drag dismissal, rotation, gesture navigation, and Android three-button navigation. Check footer/caret visibility, bottom safe area, and list end visibility.
4. Run login/signup on small/large devices, including Next/Done, visibility toggles, background/return, keyboard cycles, larger text, TalkBack/VoiceOver, and navigation while errors are shown.
5. Against the real backend, verify accepted/rejected credentials, username identity support, email/username conflicts, password rules, token/account preparation, and offline/retry behavior. Do not infer live success from mocked HTTP responses.

Publication branch: `arena/e4dfc24a-socialapp`. The branch history records the refinement commit and its publication.
