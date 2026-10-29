import { openDatabaseAsync, type SQLiteBindValue } from "expo-sqlite";
import { drizzle, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

// The Expo Drizzle driver is synchronous even when awaited. The async proxy
// keeps the same query builders/schema/database, but executes native async IO.
const connection = openDatabaseAsync("app.db").then(async (sqlite) => {
  await sqlite.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );
  return sqlite;
});
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}

const execute: AsyncRemoteCallback = async (query, params, method) => {
  const sqlite = await connection;
  const statement = await sqlite.prepareAsync(query);
  try {
    const result = await statement.executeForRawResultAsync(
      params as SQLiteBindValue[],
    );
    const rows = method === "run" ? [] : await result.getAllAsync();
    return { rows: method === "get" ? rows[0] : rows };
  } finally {
    await statement.finalizeAsync();
  }
};

export const db = drizzle((...args) => exclusive(() => execute(...args)), {
  schema,
});
const transactionDb = drizzle(execute, { schema });

/** Transactions own the queue; callers MUST use the supplied tx, not global db. */
export function withDatabaseTransaction<T>(
  work: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return exclusive(async () => {
    const sqlite = await connection;
    await sqlite.execAsync("BEGIN IMMEDIATE");
    try {
      const result = await work(transactionDb);
      await sqlite.execAsync("COMMIT");
      return result;
    } catch (error) {
      await sqlite.execAsync("ROLLBACK");
      throw error;
    }
  });
}
