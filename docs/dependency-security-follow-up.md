# SocialApp — dependency security follow-up

**Observed:** 2026-10-31. **Frontend baseline:** `24a5b31a24a8826acff77e79c283175c934b4eeb`. **Branch:** `arena/e4dfc24a-socialapp`.

This continues the [seven-part production-readiness audit](production-readiness-audit.md). **Compatible dependency fixes and automated checks are complete; the app is still NOT production-certified.** The high-severity router URI-decoding path remains unresolved, alongside build/development advisories, backend capability limits and the required physical-device verification.

## 1. Initial audit, root causes and scope

A fresh `npm ci` and both audit modes reproduced the findings before changes. The counts below are npm's **affected package entries**, including propagated parent advisories, not counts of distinct CVEs or proof of APK exploitability. Expo's production dependency tree also contains its build/CLI tooling.

| Scan | Before | After |
| --- | --- | --- |
| `npm audit --omit=dev` | **34:** 1 critical, 16 high, 15 moderate, 2 low | **22:** 0 critical, 6 high, 14 moderate, 2 low |
| `npm audit` | **51:** 1 critical, 16 high, 32 moderate, 2 low | **39:** 0 critical, 6 high, 31 moderate, 2 low |

Verified relevant paths:

- **App runtime:** `socket.io-client@4.8.3 → socket.io-parser@4.2.6`. Zero-attachment binary packets left a reconstructor able to accumulate subsequent buffers. Version 4.2.7 rejects that header before taking buffer ownership. Ordinary JSON events, legitimate binary events/ACKs and Socket.IO protocol 5 must remain compatible.
- **App runtime:** Expo Router and `@gorhom/portal` use `nanoid/non-secure` for route/portal keys. Old generators can loop indefinitely on invalid sizes; patched generators terminate. These non-secure keys are not being substituted for authentication secrets.
- **Development tooling:** `react-native@0.85.3 → react-devtools-core@6.1.5 → shell-quote@1.8.4`. A comment token followed by a string containing a line terminator could escape shell quoting. Fixed 1.12.0 rejects the sequence rather than producing an executable command.
- **Build/config tooling:** affected XML parsers, brace expansion, browser target data, compression, YAML, certificates, CSS and source-map parsing. Both XML version branches and **all four brace-expansion copies**, including the dev-only 1.x branch, were covered.
- **Still unresolved runtime exposure:** `expo-router@56.2.10 → query-string@7.1.3 → decode-uri-component@0.2.2`. Malformed encoded query/deep-link input can cause excessive CPU use. This must not be dismissed as build-only.

The general `npm audit fix --dry-run` proposed unrelated SDK/module/peer changes and was **not applied**. Instead, an isolated plan updated twelve affected JavaScript dependency families within their existing parents' ranges; every lock delta was reviewed before applying it. There is no `--force`, advisory suppression, override, custom fork or framework upgrade.

## 2. Modified files and exact dependency changes

| File | Purpose |
| --- | --- |
| `package-lock.json` | 20 reviewed transitive package records updated; no package added or removed. |
| `package.json` | Include the security regressions in `npm test`; add `npm run test:security`. Dependency declarations unchanged. |
| `test/security/dependencies.test.cjs` | Nine real-installed-package contracts, including the production ESM parser entry; no socket/native/HTTP mocks. |
| `docs/dependency-security-follow-up.md` | This audit and remaining compatibility boundaries. |
| `docs/dependency-security-evidence.json` | Scan totals, removed/remaining names, exact 20 version deltas, lock/bundle hashes, unchanged direct versions and executed checks. |
| `docs/production-readiness-audit.md` | A historical-scope note linking this follow-up; the original repair inventory/evidence remains intact. |

| Targeted family | Before → after |
| --- | --- |
| `socket.io-parser` | 4.2.6 → **4.2.7** |
| `shell-quote` | 1.8.4 → **1.12.0** |
| `@xmldom/xmldom` | 0.8.13 → **0.8.15**; 0.9.10 → **0.9.12** |
| `brace-expansion` | 1.1.15 → **1.1.21**; three copies of 5.0.6 → **5.0.12** |
| `browserslist` | 4.28.2 → **4.29.5** |
| `baseline-browser-mapping` | 2.10.34 → **2.11.34** |
| `compression` | 1.8.1 → **1.8.2** |
| `js-yaml` | 4.2.0 → **4.3.2** |
| `nanoid` | 3.3.12 → **3.3.20** |
| `node-forge` | 1.4.0 → **1.4.2** |
| `postcss` | 8.5.15 → **8.5.32** |
| `source-map-js` | 1.2.1 → **1.2.2** |

The Browserslist update also resolved its supporting packages: `caniuse-lite` 1.0.30001797 → 1.0.30001820, `electron-to-chromium` 1.5.368 → 1.5.472, `node-releases` 2.0.47 → 2.0.63 and `update-browserslist-db` 1.2.3 → 1.3.4. Together these account for the **20** lock records. Installed package versions were checked against those records after clean installation.

## 3. Architecture and performance boundaries preserved

- All **59 direct dependency records** retain their exact resolved versions, and all direct dependency ranges are unchanged. Expo **56.0.11**, React Native **0.85.3**, React **19.2.3**, Router **56.2.10** and Socket.IO client **4.8.3** remain in place. Native media, gestures, keyboard, SQLite, navigation and other native modules were not upgraded.
- No runtime dependency was added, and no package was added to or removed from the locked graph. No application source file was changed in this follow-up. No new startup work/request, media preload, cache, provider, message store, schema or API was introduced.
- Socket.IO stays on protocol **5**. Media remains uploaded through the existing authenticated multipart service and referenced by public URLs in JSON message payloads. Rejecting an invalid zero-attachment binary header does not turn those normal messages into binary packets.
- Canonical message identity, receipts (including group READ by **any other recipient**), deletion, history anchoring, reply selection and account isolation remain in the existing application implementation.
- Both exports retain identical asset paths and contents: **46 Android assets / 43 iOS assets**. Hermes changes are **+36 / +39 bytes**, not a material bundle expansion. This is **not a native startup or APK-size measurement** and cannot establish the user's sub-second startup requirement by itself.

## 4. Backend and wire contracts

**No REST, upload, Socket.IO event, database, storage or permission contract changed.** The exact pinned-backend contracts and known comments/activity limitations remain in [section 4 of the original audit](production-readiness-audit.md#4-exact-inspected-backend-contracts).

The new parser tests only exercise encoding/decoding of local JSON/binary data. They do not contact a backend or establish delivery/read persistence, authorization, two-account interoperability or media playback. Updating this frontend lockfile does **not** update a deployed server's Socket.IO parser. The backend dependency tree was not re-audited or edited in this follow-up; it needs its own independent security check in the owning session.

## 5. Executed verification and reproducibility

[Machine-readable evidence](dependency-security-evidence.json) includes the exact lock hashes and all direct resolved versions.

| Check | Executed result |
| --- | --- |
| Fresh pre-change application suite | **344/344 passed**, 44.535 s. |
| New security tests against isolated exact pre-fix packages and original app lock | **5 expected failures / 4 passing controls**: CJS/ESM zero attachments, comment quoting, invalid-size generator and vulnerable-lock guard fail before the fixes. |
| New tests against real updated installation | **9/9 passed**. |
| Full final `npm test` | **353/353 passed**, 54.406 s; zero failures/skips. |
| `npm run typecheck` | Passed. |
| ESLint | **63 audited frontend/config/test files**, zero errors/warnings. This is the previous production-repair source set plus the new security test, not a claim of linting unrelated legacy files. |
| Clean install | `npm ci` passed: 921 installed / 922 audited. Remaining advisories are explicitly retained below. |
| Android production-mode offline export | Passed; **6,554,750 → 6,554,786 bytes** of Hermes bytecode (**+36**, approximately **0.00055%**). |
| iOS production-mode offline export | Passed; **6,370,466 → 6,370,505 bytes** (**+39**, approximately **0.00061%**). |
| Exported assets | Before/after hashes match for every asset on each platform. |
| Lock boundary / installed-version checks | Exactly 20 changed transitive records; unchanged package set, direct records and declarations; all 20 installed versions match. |
| Diff whitespace check | Passed. |

The nine added contracts cover zero-attachment EVENT/ACK rejection without retained buffer ownership; the actual **production ESM** parser; ordinary media/reply/receipt JSON preservation; legitimate binary EVENT/ACK round trips; malformed/over-limit headers; all four line-terminator variants of the shell-quoting advisory; ordinary quoted argument round trips; negative/zero-size route/portal and custom generators; and patched floors for all twelve targeted families. The generator probe runs in a child bounded to **48 MB V8 old space / 5 seconds**, so the pre-fix infinite loop cannot hang the parent test runner. Quoting tests never invoke a shell. No large unbounded decoder DoS payload was run.

Main commands, from the repository root:

```sh
npm ci
npm run test:security
npm test
npm run typecheck
npm audit --omit=dev --json
npm audit --json
CI=1 EXPO_OFFLINE=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo export --platform android --output-dir dist/security-after-android
CI=1 EXPO_OFFLINE=1 EXPO_PUBLIC_API_URL=https://api.example.invalid EAS_BUILD_PROFILE=production \
  npx expo export --platform ios --output-dir dist/security-after-ios
```

The two audit commands still exit nonzero because findings remain; **they are not clean security gates**. The invalid HTTPS origin is an explicit offline fixture, not a live service. Exported bundles, node_modules, scratch projects, logs and historical `backend-delivery/` are not included in the patch.

## 6. Remaining findings and compatibility boundaries

The production scan's **six high affected package entries** are `@expo/cli`, `decode-uri-component`, `expo-router`, `image-size`, `query-string` and `zod`: three underlying high-severity leaf families plus propagated parents. Production also retains 14 moderate and two low entries; the full scan adds 17 moderate dev/tooling entries. The full remaining name/advisory lists are recorded in the evidence JSON, not suppressed.

| Unresolved leaf/path | Reachability and reason no blind replacement was made |
| --- | --- |
| **`decode-uri-component@0.2.2`** via Router → `query-string@7.1.3` (**high**) | Runtime route/query parsing can consume untrusted encoded input. Safe decoder **0.5.1** is ESM-only; query-string 7 expects a **callable CommonJS `require()`**. Forcing the version can break normal navigation. Resolve through a compatible upstream router/decoder fix, an explicitly reviewed maintained backport, or an approved SDK migration. **Remains a release blocker; no arbitrary URL-size cap is claimed to fix it.** |
| **`image-size@1.2.1`** via Metro 0.84.4 (**high**) | Build asset parser. Metro requires `^1.0.2` and uses both in-memory buffers **and filename strings** (`metro/src/Assets.js`, `getAssetData`). Safe 2.x separates file reading into `image-size/fromFile`; a naive 2.x override breaks the filename call even if buffer-only tests pass. No patched 1.x version was available. |
| **`zod@3.25.76`** via Expo CLI 56.1.15; also dev hooks tooling (**high**) | Oversized constrained-collection validation can exhaust memory. CLI requires `^3.25.76`; there is no patched 3.x release. Safe **4.6.6+** crosses a schema API/type boundary; changing it without coordinated consumers is not a drop-in patch. |
| **`glob@13.0.6` / `minimatch@10.2.5` and dev `minimatch@3.1.5`** (**moderate**) | Expo config/prebuild/fingerprint/update/CLI and lint traversal. Fixed versions **14.0.2 / 11.0.1** are outside current parents' ranges. Legacy minimatch consumers use a callable CommonJS API; a global major override is unsafe. The brace-expansion children are patched, but that does **not** fix the distinct glob cancellation/minimatch amplification advisories. |
| **`deepmerge@4.3.1`** via Expo config (**low**) | Config merge/prototype-poisoning advisory has **no patched release** at the scan date. The app's theme provider separately uses 3.3.0, not this flagged 4.x path. An SDK upgrade is not automatically proof of a deepmerge fix. |
| **`uuid@7.0.3`** via `xcode@3.0.1` (**moderate**) | Build project identifiers. Advisory concerns buffered v3/v5/v6; inspected xcode uses **`uuid.v4()`** without a buffer, so the flagged functions are not used in that consumer. This narrows exposure, not the audit result. Safe **11.1.1** is outside xcode's `^7.0.3`; no unreviewed global UUID replacement was made. |
| **Nested `esbuild@0.18.20`** via dev-only Drizzle Kit → `@esbuild-kit/esm-loader` → core-utils (**moderate**) | Old esbuild development-server access advisory remains in the dev loader chain; the separate root esbuild 0.25.12 is not that vulnerable copy. No vulnerable dev server was started or exposure tested. Fixed 0.25+ is outside the loader's current range, so this requires its own tooling update rather than a forced unrelated native/SDK change. |

Key advisory references: [Socket.IO zero attachments](https://github.com/advisories/GHSA-2m8v-j782-fhvr), [shell-quote comment escape](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), [URI decoder exponential case](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [URI decoder remaining malformed-run case](https://github.com/advisories/GHSA-qr28-fpjm-wq7f), [image-size JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). The evidence JSON lists every remaining leaf advisory URL.

Do not accept an audit-count reduction that changes supported native APIs, breaks the CommonJS consumers, downgrades Expo modules, or merely hides an unresolved leaf advisory. The next dependency phase needs an explicit compatibility/backport/SDK decision, starting with runtime URI decoding.

## 7. Actual-testing confirmation and unchanged production gates

**Performed:** local clean installs, source/contract inspection, bounded real-package regressions, the full automated suite, typecheck, scoped lint, dependency scans and offline fixture exports for Android/iOS.

**NOT performed:** native Android/iOS compilation; APK/AAB generation, installation or size measurement; native startup/FPS measurements; live HTTPS API/TLS/media/range/codec/auth checks; two real accounts on two physical Android production installs; device permissions/IME/gesture/navigation/offline/reconnect verification; backend remediation or production deployment. No live database mutation, merge or deployment occurred.

The approximately **128 MB APK / <1 s startup** remains the user's reported baseline, not independently reproduced evidence. The original media, swipe, keyboard, comments, collections/activity and two-device checklist still must be completed against the real deployment. The oldest-20 comments response and sparse session-only activity remain backend capability limits, not newly certified frontend features. **Production readiness is still withheld.**
