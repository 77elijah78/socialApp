# Local Cache Review: Conversations & Chatrooms

## 1. Current Cache Gaps

### 1.1 Message Cache (`messages` table)
- **Missing unique index on `id`** (server message id). Lookups by server id require full table scan.
- **Missing composite index `(conversation_id, id)`** for efficient upserts and dedup during sync.
- **Missing `deliveredAt` / `readAt` timestamp columns**. Current schema only stores `status` enum, not when the transition happened.
- **`localId` is PK but `confirm()` sets `localId = serverId`**. After confirmation, the optimistic localId is permanently lost, breaking optimistic-to-server mapping for retry/reconciliation.
- **No `failedAt` or `retryCount`** for outgoing messages. UI cannot distinguish between "sending" and "failed but retryable".

### 1.2 Conversation Cache (`rooms` table)
- **Missing `receiverId`**. Conversation list must derive it from backend payload every time.
- **Missing `lastMessageStatus`**. Cannot show SENT/DELIVERED/READ checkmarks in conversation list.
- **Missing `cachedAt` / `updatedAt`**. No way to know if local cache is stale or how old it is.
- **Missing `muted`, `pinned`, `archived`**. No persistent state for conversation organization.
- **Missing `cursor` metadata** (e.g., `oldestMessageTimestamp`, `oldestMessageId`) for cursor-based pagination.
- **`unreadCount` is incremented blindly** in `roomInsertQueries.upsert` (`rooms.unreadCount + 1`) but **never decremented** when messages are read. This causes inflated badges.
- **`useRooms` always fetches from server first**; it never loads cached rooms from SQLite on app launch. Conversation list is blank until network responds.

### 1.3 Load Strategy
- **`useChat` calls `reload()` on every `message:new`** (`useChat.ts:284`). This does `getRecent` (SQLite query) + `setMessages` + `scrollToEnd`. For rapid messages this causes repeated queries and list jumps.
- **`syncFromServer` uses offset pagination** (`?page=1&limit=30`). Violates cursor-pagination rule.
- **`loadMore` calls `syncFromServer`** which re-fetches the same page the user already has, then does `reload()`. Inefficient and can downgrade status if reconciliation fails.
- **No in-memory message cache** in `useChat`. Every receipt event triggers SQLite write + React state update + potential `reload()`.

### 1.4 Offline Behavior
- **No explicit offline/error state in `useChat`**. The hook only exposes `isSyncing` (true during initial sync) and `isConnected` (socket state). There is no `isOffline` or `syncError` exposed to the UI.
- **No pending/failed message queue UI**. `FAILED` messages exist in SQLite but the conversation list and chat UI don't surface them.
- **`message:delivered` and `message:read` handlers in `useChat` persist to SQLite but do not handle failures gracefully beyond console.warn**.

### 1.5 Reconnect
- **Global reconnect sync only fetches pending delivery messages**. It does **not** fetch missed `message:new` events. If the receiver was offline for 1 hour and 50 messages were sent, only the SENT ones are ACK'd on reconnect; the messages themselves are not synced to the device until the user opens the conversation.
- **`syncPendingDelivery` uses `limit=200` hardcoded** with no cursor. Users with >200 pending messages never fully delivered in one sync.

### 1.6 Logout / Account Switch
- **`messageStore.deleteAll()` exists but is never called** on logout.
- **`roomStore` has no `deleteAll()`** method.
- **`AuthService.logout()` does not clear SQLite**. On account switch, the new user sees the previous user's cached conversations and messages.
- **`SocketProvider` disconnects socket** when `!isAuthenticated`, but does not clear local caches.

---

## 2. Exact Schema / Index Changes

### 2.1 `messages` table additions
```sql
-- Add server-id uniqueness and fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_id ON messages (id);

-- Composite for upserts / dedup
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, id);

-- Fast deliveredAt / readAt queries if we add those columns
-- (optional but recommended)
ALTER TABLE messages ADD COLUMN delivered_at TEXT;
ALTER TABLE messages ADD COLUMN read_at TEXT;
```

### 2.2 `rooms` table additions
```sql
-- Extend rooms table
ALTER TABLE rooms ADD COLUMN receiver_id TEXT;
ALTER TABLE rooms ADD COLUMN last_message_status TEXT DEFAULT 'SENT';
ALTER TABLE rooms ADD COLUMN cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000);
ALTER TABLE rooms ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000);
ALTER TABLE rooms ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN cursor_oldest_ts INTEGER;
ALTER TABLE rooms ADD COLUMN cursor_oldest_id TEXT;

-- Index for sorting pinned/archived + recent
CREATE INDEX IF NOT EXISTS idx_rooms_pinned_ts ON rooms (pinned DESC, last_message_timestamp DESC);
```

### 2.3 Migrations
- Update `src/db/migrations.ts` to run the above on app startup.
- Update `src/db/schema.ts` to include new columns.
- Update `src/db/insertQueries.ts` to set `cachedAt` / `updatedAt` on upsert.

---

## 3. Sync Merge Rules

| Scenario | Rule |
|---|---|
| Local optimistic (`SENDING`) + Server (`SENT`) | Keep `SENT`, confirm localId → serverId mapping |
| Local (`DELIVERED`) + Server (`SENT`) | Keep `DELIVERED` (local is newer) |
| Local (`READ`) + Server (`DELIVERED`) | Keep `READ` (local is newer) |
| Server (`DELIVERED`) + Local (`SENT`) | Upgrade to `DELIVERED` |
| Server (`READ`) + Local (`DELIVERED`) | Upgrade to `READ` |
| Local (`FAILED`) + Server (`SENT`) | Upgrade to `SENT`, clear `failedAt` |
| Duplicate server message during sync | Dedup by `id` (server id) before upsert |
| Duplicate `message:new` + `message:notification` | `saveReceived` is idempotent via upsert; dedupe in `useChat` by `id`/`localId` |

**Status rank:** `READ` (3) > `DELIVERED` (2) > `SENT` (1) > `SENDING` (0) > `FAILED` (-1)

---

## 4. Offline Send / Retry Behavior

- **Send:** Create optimistic row with `localId`, `status = SENDING`, `failedAt = null`, `retryCount = 0`. Optimistically append to `useChat` state.
- **REST success:** `confirm(localId, serverId)` maps `localId → serverId`, sets `status = SENT`, clears `failedAt`.
- **REST failure:** `markFailed(localId)` sets `status = FAILED`, `failedAt = now`. UI shows retry button.
- **Retry:** `resetForRetry(localId)` sets `status = SENDING`, increments `retryCount`. Re-send via REST.
- **Offline receipt generation:** None. Sockets cannot emit when disconnected. Reconnect sync only ACKs delivery, never generates read receipts.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `delivered_at`, `read_at`, `failed_at`, `retry_count` to messages; add `receiver_id`, `last_message_status`, `cached_at`, `updated_at`, `muted`, `pinned`, `archived`, `cursor_oldest_ts`, `cursor_oldest_id` to rooms |
| `src/db/migrations.ts` | Add `ALTER TABLE` and `CREATE INDEX` for new columns |
| `src/db/getQueries.ts` | Add `getByServerId`, `getOldestMessageTimestamp`, `getOldestMessageId`, `getRoomsByUserId` (future-proofing), fix `getUnreadCount` / `getAllUnreadCounts` |
| `src/db/updateQueries.ts` | Add `markFailed` with `failedAt`, `updateRoom` helper |
| `src/db/insertQueries.ts` | Set `cachedAt` / `updatedAt` on room upsert; set `failedAt` on message insert |
| `src/db/MessageStore.ts` | Add `getByServerId`, `getOldestCursor`, `confirm` preserves `localId` mapping, `markFailed` stores `failedAt`, `markDelivered` / `markRead` store timestamps, `deleteAll` clears messages + rooms |
| `src/db/RoomStore.ts` | Add `deleteAll`, `updateRoom` |
| `src/db/deleteQueries.ts` | Add `deleteAll` for rooms |
| `src/services/MessageService.ts` | Add `retryCount` to optimistic rows; `syncFromServer` uses cursor-based params instead of offset page |
| `src/services/SocketReceiver.ts` | Already fixed: reconnect-only sync, clear ackSet on disconnect |
| `src/hooks/useRooms.ts` | Load local rooms first, then background sync; fix unreadCount increments |
| `src/hooks/useChat.ts` | Optimize `reload()` to avoid full reload on every receipt; expose `isOffline`, `syncError`; debounce `message:new` reloads |
| `src/app/_layout.tsx` | Call `messageStore.deleteAll()` + `roomStore.deleteAll()` on logout |
| `src/services/AuthService.ts` | Ensure logout clears local caches |

---

## 6. Migration Plan

1. **Run migrations on app startup** (`migrations.ts`) — idempotent, safe.
2. **Update schema types** — new columns are nullable/defaulted, backward compatible.
3. **Update `RoomStore` / `MessageStore`** — add `deleteAll` for rooms, preserve `localId` in `confirm`.
4. **Update `useRooms`** — load local first, then sync.
5. **Update `useChat`** — optimize reloads, expose offline state.
6. **Update `AuthService.logout`** — clear caches.
7. **Test offline open → offline send → reconnect → sync**.

---

## 7. Test Matrix

| Test | Expected Result |
|---|---|
| **Offline open conversation** | Cached messages visible immediately, no crash |
| **Offline send** | Message appears with `SENDING`, then `FAILED` if REST fails |
| **Offline retry** | Status returns to `SENDING`, then `SENT` on success |
| **Reconnect** | `syncPendingDelivery` ACKs delivery; missed `message:new` NOT auto-synced (by design — user must open room) |
| **Status update (delivered)** | Only the specific message status changes; no full reload |
| **Status update (read)** | Same as delivered; no downgrade possible |
| **Pagination** | `loadMore` uses local SQLite first, then cursor-based server fetch |
| **Account switch** | Old account's messages/rooms are cleared; new account sees only own data |
| **Duplicate event** | `message:new` + `message:notification` do not create duplicate rows |
| **Stale sync response** | `newerStatus` prevents downgrade; `dedupeMessages` prevents duplicates |

---

## 8. Clarifying Questions

1. Should `cachedAt` trigger a forced server refresh after N minutes?
2. Should `syncPendingDelivery` also fetch missed `message:new` events, or remain delivery-ACK only?
3. Should unread counts be stored in `rooms` table or calculated dynamically from `messages`?
4. Should `muted` / `pinned` / `archived` be synced to the backend, or local-only?
5. Should `retryCount` have a max (e.g., 3) before permanently failing?
6. Should `useRooms` show a "stale cache" indicator when data is older than X minutes?
