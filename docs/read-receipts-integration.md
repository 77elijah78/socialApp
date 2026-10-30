# Backend receipt integration follow-up

Date: 2026-10-30

The frontend reply/bubble upgrade was committed and pushed as `278640c` after **186 passing tests**. This follow-up supersedes the backend-blocker status in the historical [messaging upgrade audit](messaging-upgrade-audit.md) once the paired backend is migrated/deployed; it does not claim the server changes are already deployed.

## Paired backend contract

Repository: `77elijah78/nodejs-socialapp`, work branch `arena/e4dfc24a-socialapp`.

**Publication blocked:** backend commit `0f7a7e6c4449c04d30c26fe4311f9d9a691a3a64` is prepared and locally verified, but GitHub rejected its push with HTTP 403. No backend PR or deployment is claimed. Reconnect GitHub in Arena with write access to that repository to publish it. Backend code is preserved separately and is not included in the frontend commit.

- History reads no longer mutate read state or emit read events.
- `message:read` requires `{ conversationId, messageId }`; reader identity is authenticated by the server. Committed read events go to both the sender's and reader's personal rooms. Repeating an already-read acknowledgment reconfirms the reader.
- The server persists per-member receipts and atomically queues metadata publication in PostgreSQL before using its existing Kafka/Redis Socket.IO pipeline. Delivery cannot regress READ.
- Group outgoing READ means **any other recipient** read the message. Optional DTO fields `isGroup` and `readByMe` distinguish aggregate status from the current member's actual read state; old servers retain a conservative fallback.
- `POST /api/v1/messages/receipts/sync` accepts up to 200 exact outgoing message IDs and returns `{ data: [{ messageId, conversationId, status }] }`. It is authenticated, sender/conversation scoped, and read-only.
- `receipts:resync` is a server recovery signal after Redis/Kafka/receipt infrastructure recovery, not a replacement socket system or periodic client polling.

## Frontend changes

- The existing `SocketReceiver` performs a single-flight, account-generation-guarded reconciliation in **100-ID batches**. Only pending cached outgoing IDs are selected; old messages are included, not merely the latest history page. Returned identities and conversations must match the request.
- READ snapshots are applied in affected-room batches; DELIVERED updates remain monotonic. No fabricated reader ID, message-body fetch, whole-history reset, or competing Redux/message store is introduced.
- Reconciliation runs on connection, foreground, room open, explicit retry and server recovery. Genuine recovery/explicit retry may also replay unconfirmed reads under a fresh attempt token. Ordinary chat activity does not repeatedly emit the same read acknowledgment. Healthy visibility dispatch still has no added application delay.
- SQLite **v3 adds only `idx_messages_receipt_recovery(sender_id,status,local_id)`**. Existing messages, per-message metadata, stable IDs, durable outboxes and v1/v2 data remain intact.
- Authoritative `readByMe` is used for incoming messages; a group-wide READ for another member is not treated as this user's personal visibility. Outgoing bubbles continue to use the aggregate any-reader state.

## Deployment

1. Back up/stage-test PostgreSQL, then apply the backend's additive `20261030000000_reliable_message_receipts` migration before deploying its new API code.
2. Drain old backend writers/events so the previous fetch-triggered false read producer is no longer running.
3. Deploy the backend, including its receipt publisher. Review the backend's `docs/read-receipts.md` for outbox leases, recovery, group behavior, migration/backfill and rollback notes.
4. Deploy the paired client. The recovery endpoint must be available first. The native rebuild requirement for Expo Sharing from the prior UI upgrade still applies if that native module is not yet installed.
5. Verify two real mobile accounts/devices and a three-member group, including stationary visibility, network interruption, background/foreground, old cached messages and late delivery acknowledgments.

No production database, deployment, physical-device, or POCO performance test was executed here. Backend integration tests use PostgreSQL/WASM and real Socket.IO clients with adapted identity verification/Kafka boundaries, not a live production cluster. Historic client false READ indicators created by the previous backend cannot be reliably undone just by removing that bug. Existing ambiguous send retries still lack a backend/client nonce and are not claimed to be exactly-once sends.

Both repositories use the fixed branch name `arena/e4dfc24a-socialapp`. Neither PR is merged automatically.


## Verification for this follow-up

- Frontend: **194 passing tests**, including old-message recovery, sender/account/conversation scoping, single-flight cancellation, monotonic affected-row updates, group `readByMe`, server recovery replay and v2→v3 cache/outbox preservation.
- Integration production/test ESLint: **0 errors / 0 warnings**. Project typecheck retains the same two unchanged NetInfo-related baseline errors.
- Android and iOS Hermes exports both pass. No physical-device or production deployment sign-off.
- Prepared backend: **20 passing tests**, successful TypeScript build, and lint with 0 errors / 1 existing stale-directive warning.
