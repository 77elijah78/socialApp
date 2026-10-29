import type { NewMessageRow } from "../../db/schema";

export interface RemoteMessage {
  id: string;
  conversationId: string;
  senderId?: string;
  sender?: { id: string; username?: string; avatarUrl?: string };
  receiverId?: string | null;
  content?: string | null;
  text?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string;
  status?: string;
  isRead?: boolean;
  createdAt?: string | number;
  timestamp?: string | number;
  editedAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  duration?: number | null;
  repliedToId?: string | null;
  forwardedFromId?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  updatedAt?: string | null;
}

export function normalizeRemoteMessage(
  payload: RemoteMessage,
  userId: string,
): NewMessageRow {
  const senderId = payload.senderId ?? payload.sender?.id;
  const createdAt = payload.createdAt ?? payload.timestamp;
  const timestamp =
    typeof createdAt === "number" ? createdAt : Date.parse(createdAt ?? "");
  if (
    !payload.id ||
    !payload.conversationId ||
    !senderId ||
    !Number.isFinite(timestamp)
  ) {
    throw new Error("Invalid server message identity or timestamp");
  }
  const status = (
    payload.status ?? (senderId === userId ? "SENT" : "DELIVERED")
  ).toUpperCase();
  return {
    localId: payload.id,
    id: payload.id,
    content: payload.content ?? payload.text ?? null,
    mediaUrl: payload.mediaUrl ?? null,
    thumbnailUrl: payload.thumbnailUrl ?? null,
    type: (payload.type ?? "TEXT").toUpperCase(),
    status,
    senderId,
    receiverId: payload.receiverId ?? (senderId === userId ? null : userId),
    conversationId: payload.conversationId,
    isRead: payload.isRead === true || status === "READ",
    timestamp,
    editedAt: payload.editedAt ?? null,
    deletedAt: payload.deletedAt ?? null,
    deletedBy: payload.deletedBy ?? null,
    duration: payload.duration ?? null,
    repliedToId: payload.repliedToId ?? null,
    forwardedFromId: payload.forwardedFromId ?? null,
    deliveredAt: payload.deliveredAt ?? null,
    readAt: payload.readAt ?? null,
    failedAt: null,
    retryCount: 0,
    updatedAt: payload.updatedAt ?? null,
  };
}
