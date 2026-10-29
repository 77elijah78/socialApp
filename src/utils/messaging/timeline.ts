import type { MessageRow, NewMessageRow } from "../../db/schema";

export interface MessageCursor {
  timestamp: number;
  localId: string;
}

export function compareMessages(a: MessageCursor, b: MessageCursor): number {
  return (
    a.timestamp - b.timestamp ||
    (a.localId < b.localId ? -1 : a.localId > b.localId ? 1 : 0)
  );
}

export function cursorFor(message: MessageRow): MessageCursor {
  return { timestamp: message.timestamp, localId: message.localId };
}

export function statusRank(status: string): number {
  switch (status) {
    case "READ":
      return 3;
    case "DELIVERED":
      return 2;
    case "SENT":
      return 1;
    default:
      return 0;
  }
}

export function newerStatus(local: string, incoming: string): string {
  return statusRank(local) > statusRank(incoming) ? local : incoming;
}

export function sameMessage(a: MessageRow, b: MessageRow): boolean {
  return (
    a === b ||
    (Object.keys(b) as (keyof MessageRow)[]).every((key) => a[key] === b[key])
  );
}

/** All fields are scalar. Preserve local identity, insertion order and monotonic receipts. */
export function mergePersistedMessage(
  existing: MessageRow | NewMessageRow | undefined,
  incoming: NewMessageRow,
  requestStartedAt?: number,
): NewMessageRow {
  if (!existing) return incoming;
  const staleContent = Boolean(
    (requestStartedAt !== undefined &&
      Date.parse(existing.updatedAt ?? "") >= requestStartedAt) ||
      (existing.editedAt &&
        Date.parse(existing.editedAt) > Date.parse(incoming.editedAt ?? "")) ||
      (existing.editedAt && !incoming.editedAt),
  );
  return {
    ...existing,
    ...incoming,
    localId: existing.localId,
    // An outgoing row's insertion key must not change when the server clock differs.
    // Remote rows also keep their first observed server timestamp across duplicate events.
    timestamp: existing.timestamp,
    ...(staleContent
      ? {
          content: existing.content,
          editedAt: existing.editedAt,
          updatedAt: existing.updatedAt,
        }
      : {}),
    status: newerStatus(
      existing.status ?? "SENT",
      incoming.status ?? existing.status ?? "SENT",
    ),
    isRead:
      existing.isRead ||
      existing.status === "READ" ||
      incoming.isRead ||
      incoming.status === "READ",
    deliveredAt: incoming.deliveredAt ?? existing.deliveredAt,
    readAt: incoming.readAt ?? existing.readAt,
    deletedAt: existing.deletedAt ?? incoming.deletedAt,
    deletedBy: existing.deletedBy ?? incoming.deletedBy,
  };
}

/**
 * Incremental sorted merge: metadata changes don't sort the conversation, clone
 * untouched rows, or even return a new array for duplicate/no-op socket events.
 */
export function mergeMessageRows(
  current: MessageRow[],
  incoming: MessageRow[],
): MessageRow[] {
  if (!incoming.length) return current;
  const byIdentity = new Map<string, MessageRow>();
  for (const row of current) {
    byIdentity.set(row.localId, row);
    if (row.id) byIdentity.set(row.id, row);
  }
  const replacements = new Map<string, MessageRow>();
  const additionMap = new Map<string, MessageRow>();
  const removedKeys = new Set<string>();
  let changed = false;
  for (const row of incoming) {
    const local = byIdentity.get(row.localId);
    const server = row.id ? byIdentity.get(row.id) : undefined;
    const existing = local ?? server;
    if (local && server && local.localId !== server.localId) {
      removedKeys.add(server.localId);
      changed = true;
    }
    if (existing) {
      const merged = mergePersistedMessage(existing, row) as MessageRow;
      if (!sameMessage(existing, merged)) {
        if (additionMap.has(existing.localId))
          additionMap.set(existing.localId, merged);
        else replacements.set(existing.localId, merged);
        byIdentity.set(existing.localId, merged);
        if (merged.id) byIdentity.set(merged.id, merged);
        changed = true;
      }
    } else if (!row.deletedAt) {
      additionMap.set(row.localId, row);
      byIdentity.set(row.localId, row);
      if (row.id) byIdentity.set(row.id, row);
      changed = true;
    }
  }
  if (!changed) return current;
  const base = current
    .map((row) => replacements.get(row.localId) ?? row)
    .filter((row) => !row.deletedAt && !removedKeys.has(row.localId));
  const additions = [...additionMap.values()].filter((row) => !row.deletedAt);
  if (!additions.length) return base;
  additions.sort(compareMessages);
  const result: MessageRow[] = [];
  let i = 0;
  let j = 0;
  while (i < base.length && j < additions.length) {
    if (compareMessages(base[i], additions[j]) <= 0) result.push(base[i++]);
    else result.push(additions[j++]);
  }
  return result.concat(base.slice(i), additions.slice(j));
}
