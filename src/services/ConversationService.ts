import type { RoomRow } from "../db/schema";

interface BackendParticipant {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface BackendConversation {
  id: string;
  isGroup: boolean;
  unreadCount?: number;
  groupName: string | null;
  groupAvatar: string | null;
  updatedAt: string;
  participants: BackendParticipant[];
  messages?: {
    id: string;
    content: string;
    mediaUrl: string | null;
    type: string;
    createdAt: string;
    senderId: string;
    status: string;
    isRead: boolean;
    deletedAt?: string | null;
  }[];
}

export interface RoomWithReceiver
  extends Omit<RoomRow, "receiverId" | "lastMessageStatus"> {
  receiverId?: string | null;
  receiverUsername?: string;
  lastMessageStatus?: string;
}

export function toRoomRow(
  conversation: BackendConversation,
  currentUserId?: string,
  locallyDeleted = false,
): RoomWithReceiver {
  const otherParticipant = conversation.participants.find(
    (p) => p.user.id !== currentUserId,
  );

  const lastMessage = conversation.messages?.[0];
  const name =
    conversation.isGroup && conversation.groupName
      ? conversation.groupName
      : otherParticipant?.user.displayName ||
        otherParticipant?.user.username ||
        "Unknown";

  const avatarUrl =
    conversation.isGroup && conversation.groupAvatar
      ? conversation.groupAvatar
      : otherParticipant?.user.avatarUrl || "";

  const receiverId = otherParticipant?.user.id;

  const deleted = locallyDeleted || Boolean(lastMessage?.deletedAt);
  const lastMessageContent = deleted ? "Deleted message" : lastMessage?.content || "";
  const type = lastMessage?.type;
  const lastMessageType = deleted ? "text" : lastMessage?.mediaUrl
    ? "media"
    : type === "SHARED_POST" || type === "SHARED_STORY"
      ? type
      : type?.toLowerCase() || "text";
  const lastMessageStatus = lastMessage?.status || "DELIVERED";
  const lastMessageTimestamp = lastMessage
    ? new Date(lastMessage.createdAt).getTime()
    : Date.now();

  const unreadCount =
    conversation.unreadCount ??
    conversation.messages?.filter(
      (m) => m.senderId !== currentUserId && m.status !== "READ",
    ).length ??
    0;

  return {
    id: conversation.id,
    name,
    isGroup: conversation.isGroup,
    participantsData: JSON.stringify(conversation.participants.map(({ user }) => ({ id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl }))),
    conversationId: conversation.id,
    avatarUrl,
    lastMessage: lastMessageContent,
    lastMessageType,
    lastMessageTimestamp,
    unreadCount,
    receiverId: receiverId ?? null,
    receiverUsername: otherParticipant?.user.username,
    lastMessageStatus,
    cachedAt: Date.now(),
    updatedAt: Date.now(),
    muted: false,
    pinned: false,
    archived: false,
    cursorOldestTs: null,
    cursorOldestId: null,
  };
}
