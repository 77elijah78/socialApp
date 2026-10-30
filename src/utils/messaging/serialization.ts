import type { MessageAuthorInfo, ReplyPreviewModel } from "./presentation";
import type { NewMessageRow } from "../../db/schema";

export interface RemoteMessage {
  id: string;
  conversationId: string;
  senderId?: string;
  sender?: MessageAuthorInfo & { id: string };
  repliedTo?: ReplyPreviewModel | null;
  receiverId?: string | null;
  content?: string | null;
  text?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string;
  status?: string;
  isRead?: boolean;
  // Optional v2 backend contract; old servers keep the conservative fallback.
  readByMe?: boolean;
  isGroup?: boolean;
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
  groupHint = false,
  authors?: Map<string, MessageAuthorInfo>,
): NewMessageRow {
  const isGroup =
    typeof payload.isGroup === "boolean" ? payload.isGroup : groupHint;
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
  const remoteStatus = (
    payload.status ?? (senderId === userId ? "SENT" : "DELIVERED")
  ).toUpperCase();
  const receiverId =
    payload.receiverId !== undefined
      ? payload.receiverId
      : isGroup || senderId === userId
        ? null
        : userId;
  // A group/global READ is not evidence this individual recipient viewed it.
  const individualRead = !isGroup && receiverId === userId;
  const personalRead =
    senderId !== userId &&
    (typeof payload.readByMe === "boolean"
      ? payload.readByMe
      : individualRead && (payload.isRead === true || remoteStatus === "READ"));
  const status =
    senderId === userId
      ? remoteStatus
      : personalRead
        ? "READ"
        : remoteStatus === "READ"
          ? "DELIVERED"
          : remoteStatus;
  return {
    localId: payload.id,
    id: payload.id,
    content: payload.content ?? payload.text ?? null,
    senderData:
      payload.sender || authors?.has(senderId)
        ? JSON.stringify({
            ...authors?.get(senderId),
            ...payload.sender,
            id: senderId,
          })
        : null,
    replyData: payload.repliedTo
      ? JSON.stringify({
          id: payload.repliedTo.id,
          content: (payload.repliedTo.content ?? "").slice(0, 180),
          type: payload.repliedTo.type,
          senderId: payload.repliedTo.senderId,
          sender: {
            ...authors?.get(payload.repliedTo.senderId),
            ...payload.repliedTo.sender,
          },
          mediaUrl: payload.repliedTo.mediaUrl,
          thumbnailUrl: payload.repliedTo.thumbnailUrl,
          duration: payload.repliedTo.duration,
          deleted: payload.repliedTo.deleted,
        })
      : null,
    attachmentData: null,
    mediaUrl: payload.mediaUrl ?? null,
    thumbnailUrl: payload.thumbnailUrl ?? null,
    type: (payload.type ?? "TEXT").toUpperCase(),
    status,
    senderId,
    receiverId,
    conversationId: payload.conversationId,
    isRead:
      senderId === userId
        ? payload.isRead === true || status === "READ"
        : personalRead,
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
