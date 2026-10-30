# Login navigation and missing backend receipt schema

Date: 2026-10-30

Frontend baseline: `75f63d531a2ec3940e0eb1df7b31dfe115e71bed`, PR #2.

Backend inspected: PR #1 at `66fb1c18e3de82b688e645a8fa333f4c8c77346b`. At inspection, it is still open and backend main remains `002e337`. Running the receipt code locally/in a dev container does not imply it was migrated or deployed via GitHub.

## User-reported symptoms and diagnosis

1. Login succeeds but the dev build stays on the auth screen; closing/reopening reaches Home.
2. Messaging sync fails because `public.message_receipts` does not exist; the backend publisher repeatedly reports missing `receipt_outbox`.

### Frontend

Previously AuthService prepared the account, dispatched authenticated Redux credentials, set HTTP tokens, and THEN awaited refresh-token storage. A storage failure left Redux/persisted auth committed but the form's awaited success callback never navigated. Redux subscribers could also observe the new authenticated account before the shared HTTP token was set. Separately, the auth layout did not react to authenticated state; routing depended solely on the mounted form's imperative callback. Restarting went through the index route and restored the already-committed session instead.

Reproduced the structural failure before production edits: **8 of 11 initial focused regressions failed**, including a committed session remaining on the auth stack and token-write rejection leaving `isAuthenticated=true`. This confirms a failure mode matching the symptom; no physical-device trace establishes that storage rejection was the exact trigger on the user's device.

### Backend

The source includes the additive receipt migration, but Docker/Compose launch the API without applying it. Kubernetes references a migration runner that does not exist. The worker starts even when its new tables are missing. These errors come from PostgreSQL, not the app's existing SQLite migrations. Generating Prisma Client or restarting/rebuilding the mobile app cannot create those server tables. A different DATABASE_URL/schema from the migrated destination can produce the same error.

## Frontend fix

- Auth layout declaratively redirects a complete authenticated Redux session to Home, including login, registration, a remount or an auth deep link.
- AuthService completes account/cache preparation and refresh-token persistence before activating API tokens and finally publishing credentials. Authenticated subscribers see the correct HTTP identity immediately; no fallible asynchronous storage work remains after credential publication.
- Removed the form's competing imperative Home replacement. Existing in-flight/mounted/error guards and explicit login/signup/recovery navigation remain.
- Cold entry uses the same complete-session condition and explicit `/(auth)/login` route. A partial session without a user/token is not treated as logged in.
- No frontend dependencies, visual/theme/keyboard changes, API payload changes, message-store changes, polling/delay tricks, or cache resets were added.

Files: `src/app/(auth)/_layout.tsx`, `src/app/index.tsx`, `src/hooks/useAuthForm.ts`, `src/services/AuthService.ts`, `test/auth/screens.test.cjs`, new `test/auth/session.test.cjs`, and this document.

## Backend recovery — operator action still required

Back up/stage-test any important database. From the **backend repository root**, for its existing Docker development setup:

```sh
docker compose -f docker-compose.dev.yml exec app npx --no-install prisma migrate status
docker compose -f docker-compose.dev.yml exec app npx --no-install prisma migrate deploy
# Only restart after the migration succeeds:
docker compose -f docker-compose.dev.yml restart app
```

Use the API's actual DATABASE_URL and current migration files. Do not use migrate reset, force-reset, volume deletion, or a manual empty-table workaround. If migration history is unbaselined/failed, stop for schema/history reconciliation rather than destroying messages or blindly marking migrations applied. A production-only old image lacks the Prisma CLI; use a matching controlled migration environment or the rebuilt backend fix rather than npx downloading an arbitrary version.

A focused backend deployment patch/runbook is saved locally under `backend-delivery/receipt-migration-startup.patch` and `backend-delivery/receipt-migration-recovery.md`. It targets **PR #1 at 66fb1c1**, not the older unpublished `0f7a7e6` handoff. It adds migration-aware npm/Docker/Compose entrypoints, fixes the K8s init command, retains the locked migration CLI in production, and checks receipt tables/columns before starting HTTP/Kafka/workers. These backend changes are NOT committed to this frontend repository or published to the other session's branch.

This deployment patch does not resolve the four separate findings in the previous backend PR review. In particular, authorization/DTO/alternate-message-writer/legacy-status fixes remain necessary. Neither PR is merged or deployed by this change.

## Verification

| Check | Result |
| --- | --- |
| Frontend `npm test` | **208 passed**, including all prior 194 and 14 new session regressions. |
| Auth coverage | Actual Redux/layout/service/form with storage/HTTP/navigation adapters: transition without callback, existing session, complete/partial entry, storage rejection/pending/retry, account preparation failure, correct API-token ordering and exactly one Home transition. |
| Scoped frontend ESLint | **0 errors / 0 warnings**. |
| Frontend typecheck | Same two baseline errors in unchanged `useScreenState.ts`: missing NetInfo package and consequent implicit-any state. |
| Android/iOS export | Both native Hermes bundles exported successfully. Not an installed dev-build/device test. |
| Focused backend patch | **23 passing tests**, TypeScript build, schema validation; full lint 0 errors / 12 warnings in unchanged files. |
| Live production DB / devices | **Not run.** The operator must apply the migration to the running backend's database and verify real-account login/messaging afterward. |

Native follow-up: log out and log in without closing the dev build; repeat signup and a rejected-login retry; confirm one Home transition and an authenticated first request. Then verify message sync, two-account arrival/delivery/read and reconnect recovery after the backend migration. Do not infer production readiness from bundle exports or PostgreSQL/WASM fixtures.
