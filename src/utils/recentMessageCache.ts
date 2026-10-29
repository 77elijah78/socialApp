import type { MessageRow } from "@/db/schema";

interface RecentMessageEntry {
  messages: MessageRow[];
  cachedAt: number;
}

const recentMessagesByConversation = new Map<string, RecentMessageEntry>();

export function getRecentMessageCache(
  conversationId: string,
): RecentMessageEntry | null {
  return recentMessagesByConversation.get(conversationId) ?? null;
}

export function setRecentMessageCache(
  conversationId: string,
  messages: MessageRow[],
): void {
  if (!conversationId) return;
  recentMessagesByConversation.delete(conversationId);
  recentMessagesByConversation.set(conversationId, {
    messages: messages.slice(-30),
    cachedAt: Date.now(),
  });
  if (recentMessagesByConversation.size > 20) {
    const oldestConversation = recentMessagesByConversation.keys().next().value;
    if (oldestConversation) recentMessagesByConversation.delete(oldestConversation);
  }
}

export function invalidateRecentMessageCache(conversationId: string): void {
  recentMessagesByConversation.delete(conversationId);
}

export function clearRecentMessageCache(): void {
  recentMessagesByConversation.clear();
}
