import type { db } from "./db";
import {
  messageInvalidations,
  receiptOutbox,
  type NewMessageRow,
} from "./schema";
import { and, eq, inArray, or, sql, ne } from "drizzle-orm";

export interface DeletionScope {
  conversationId: string;
  deleteFor?: "me" | "everyone";
  deletedAt?: string;
  deletedBy?: string;
}

export function clearedDeletedContent<T extends NewMessageRow>(row: T): T {
  return row.deletedAt
    ? {
        ...row,
        content: null,
        mediaUrl: null,
        thumbnailUrl: null,
        duration: null,
        attachmentData: null,
        replyData: null,
      }
    : row;
}

/** Scope every key to its room. A late history/echo can neither resurrect an
 * uncached original nor apply a deletion from a different conversation. */
export async function applyMessageInvalidations<T extends NewMessageRow>(
  tx: Pick<typeof db, "select">,
  rows: T[],
): Promise<T[]> {
  if (!rows.length) return rows;
  const rooms = new Map<string, Set<string>>();
  for (const row of rows) {
    const ids = rooms.get(row.conversationId) ?? new Set<string>();
    ids.add(row.localId);
    if (row.id) ids.add(row.id);
    rooms.set(row.conversationId, ids);
  }
  const invalidations = await tx
    .select()
    .from(messageInvalidations)
    .where(
      or(
        ...[...rooms].map(([room, ids]) =>
          and(
            eq(messageInvalidations.conversationId, room),
            inArray(messageInvalidations.messageId, [...ids]),
          ),
        ),
      ),
    );
  const byKey = new Map(
    invalidations.map((row) => [
      `${row.conversationId}\0${row.messageId}`,
      row,
    ]),
  );
  return rows.map((row) => {
    const deleted =
      byKey.get(`${row.conversationId}\0${row.id ?? row.localId}`) ??
      byKey.get(`${row.conversationId}\0${row.localId}`);
    return clearedDeletedContent(
      deleted
        ? {
            ...row,
            deletedAt: deleted.deletedAt,
            deletedBy: deleted.deletedBy,
          }
        : row,
    );
  });
}

/** Server history contains persisted everyone-tombstones too. Keep their IDs
 * even if body-cache reclamation later removes the original row. Call this
 * BEFORE applying personal invalidations: a stale visible body must never
 * manufacture everyone-deletion proof from a local hide. */
export async function recordMessageTombstones(
  tx: Pick<typeof db, "insert" | "delete">,
  rows: NewMessageRow[],
) {
  const tombstones = rows
    .filter((row) => row.deletedAt)
    .map((row) => ({
      conversationId: row.conversationId,
      messageId: row.id ?? row.localId,
      deletedAt: row.deletedAt!,
      deletedBy: row.deletedBy ?? null,
      deletionMode: "everyone",
    }));
  if (tombstones.length) {
    await tx
      .insert(messageInvalidations)
      .values(tombstones)
      .onConflictDoUpdate({
        target: [
          messageInvalidations.conversationId,
          messageInvalidations.messageId,
        ],
        set: {
          deletionMode: "everyone",
          deletedAt: sql`excluded.deleted_at`,
          deletedBy: sql`excluded.deleted_by`,
        },
        where: ne(messageInvalidations.deletionMode, "everyone"),
      });
    await tx
      .delete(receiptOutbox)
      .where(
        or(
          ...tombstones.map((row) =>
            and(
              eq(receiptOutbox.conversationId, row.conversationId),
              eq(receiptOutbox.messageId, row.messageId),
            ),
          ),
        ),
      );
  }
}
