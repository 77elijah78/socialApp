import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { isPushUuid } from "./PushInstallation";
import { notificationReplyRequest, type NotificationReplyRecord } from "./NotificationReplyContract";

// The database contains only account/installation/action identifiers and state.
// Reply bodies are stored separately in Android Keystore-backed SecureStore.
const DB = "notification-actions-v2.db";
const key = (account: string, action: string) => `reply-v2-${account}-${action}`;
type Row = { action_id: string; account_id: string; device_id: string; origin: string; state: string };
let database: Promise<SQLite.SQLiteDatabase> | null = null;
async function db() {
  if (!database) database = (async () => {
    const value = await SQLite.openDatabaseAsync(DB);
    await value.execAsync(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS reply_actions (
      account_id TEXT NOT NULL, action_id TEXT NOT NULL, device_id TEXT NOT NULL,
      origin TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(account_id, action_id));
      CREATE TABLE IF NOT EXISTS displayed_messages (account_id TEXT NOT NULL, notification_id TEXT NOT NULL,
      PRIMARY KEY(account_id, notification_id));
      CREATE TABLE IF NOT EXISTS blocked_accounts (account_id TEXT PRIMARY KEY);`);
    return value;
  })().catch(error => { database = null; throw error; });
  return database;
}
function validate(record: NotificationReplyRecord) { notificationReplyRequest(record); }
function same(a: NotificationReplyRecord, b: NotificationReplyRecord) {
  return (["actionId", "recipientUserId", "deviceId", "notificationId", "conversationId", "messageId", "content"] as const).every(field => a[field] === b[field]);
}
/** Persist before sending; SQLite serializes separate JS runtime writers. */
export async function persistReply(record: NotificationReplyRecord, origin: string): Promise<void> {
  validate(record);
  if (!origin) throw new Error("Missing API origin");
  const database = await db();
  await database.withExclusiveTransactionAsync(async tx => {
    const result = await tx.runAsync("INSERT OR IGNORE INTO reply_actions VALUES (?, ?, ?, ?, 'pending')", record.recipientUserId, record.actionId, record.deviceId, origin);
    if (await tx.getFirstAsync("SELECT 1 FROM blocked_accounts WHERE account_id=?", record.recipientUserId)) throw new Error("Notification account is closed");
    if (result.changes) {
      await SecureStore.setItemAsync(key(record.recipientUserId, record.actionId), JSON.stringify(record));
    } else {
      const row = await tx.getFirstAsync<Row>("SELECT * FROM reply_actions WHERE account_id=? AND action_id=?", record.recipientUserId, record.actionId);
      if (!row || row.device_id !== record.deviceId || row.origin !== origin) throw new Error("Conflicting notification reply action");
      // Completed tombstones suppress callback redelivery without retaining text.
      if (row.state !== "pending") return;
      const raw = await SecureStore.getItemAsync(key(record.recipientUserId, record.actionId));
      if (!raw || !same(JSON.parse(raw), record)) throw new Error("Conflicting notification reply action");
    }
  });
}
export async function pendingReplies(account: string, device: string, origin: string): Promise<NotificationReplyRecord[]> {
  if (![account, device].every(isPushUuid)) return [];
  const rows = await (await db()).getAllAsync<Row>("SELECT * FROM reply_actions WHERE account_id=? AND device_id=? AND origin=? AND state='pending'", account, device, origin);
  const result: NotificationReplyRecord[] = [];
  for (const row of rows) {
    const raw = await SecureStore.getItemAsync(key(account, row.action_id));
    if (!raw) continue;
    const value: NotificationReplyRecord = JSON.parse(raw); validate(value);
    if (value.recipientUserId === account && value.deviceId === device && value.actionId === row.action_id) result.push(value);
  }
  return result;
}
export async function finishReply(record: NotificationReplyRecord, state: "sent" | "failed") {
  await (await db()).runAsync("UPDATE reply_actions SET state=? WHERE account_id=? AND action_id=? AND device_id=?", state, record.recipientUserId, record.actionId, record.deviceId);
  // The status tombstone persists for duplicate callbacks; the text does not.
  await SecureStore.deleteItemAsync(key(record.recipientUserId, record.actionId)).catch(() => {});
}
export async function clearReplyAccount(account: string) {
  if (!isPushUuid(account)) return;
  const database = await db();
  const keys: string[] = [];
  await database.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync("INSERT OR IGNORE INTO blocked_accounts VALUES (?)", account);
    await tx.runAsync("DELETE FROM displayed_messages WHERE account_id=?", account);
    const rows = await tx.getAllAsync<Row>("SELECT * FROM reply_actions WHERE account_id=?", account);
    keys.push(...rows.map(row => key(account, row.action_id)));
    await tx.runAsync("DELETE FROM reply_actions WHERE account_id=?", account);
  });
  await Promise.all(keys.map(value => SecureStore.deleteItemAsync(value)));
}
export async function unblockReplyAccount(account: string) {
  if (isPushUuid(account)) await (await db()).runAsync("DELETE FROM blocked_accounts WHERE account_id=?", account);
}
export async function replyAccountBlocked(account: string) {
  return !!await (await db()).getFirstAsync("SELECT 1 FROM blocked_accounts WHERE account_id=?", account);
}
export async function alreadyDisplayed(account: string, notification: string) {
  return !!await (await db()).getFirstAsync("SELECT 1 FROM displayed_messages WHERE account_id=? AND notification_id=?", account, notification);
}
export async function markDisplayed(account: string, notification: string) {
  await (await db()).runAsync("INSERT OR IGNORE INTO displayed_messages VALUES (?, ?)", account, notification);
}
