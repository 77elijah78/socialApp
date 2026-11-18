import { api, ApiError } from "./api";
import type { BackendConversation } from "./ConversationService";

export type GroupRole = "owner" | "admin" | "member";

export interface GroupMember {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt?: string | null;
}

export interface GroupInfo {
  id: string;
  name: string;
  avatarUrl: string | null;
  description?: string | null;
  memberCount: number;
  members: GroupMember[];
  myRole: GroupRole;
  canManage: boolean;
  managementAvailable: boolean;
  createdAt?: string | null;
}

export interface CreateGroupInput {
  name: string;
  memberIds: string[];
  avatarUrl?: string | null;
  description?: string | null;
}

interface GroupMemberDTO {
  userId?: string;
  role?: GroupRole;
  joinedAt?: string | null;
  user?: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
}

interface GroupDTO {
  id?: string;
  conversationId?: string;
  name?: string;
  groupName?: string;
  avatarUrl?: string | null;
  groupAvatar?: string | null;
  description?: string | null;
  memberCount?: number;
  members?: GroupMemberDTO[];
  participants?: { user: GroupMemberDTO["user"]; role?: GroupRole; joinedAt?: string | null }[];
  myRole?: GroupRole;
  canManage?: boolean;
  createdAt?: string | null;
}

export class GroupFeatureUnavailableError extends Error {
  constructor() {
    super(
      "Group management isn’t available on this server yet. Chat still works for existing groups.",
    );
    this.name = "GroupFeatureUnavailableError";
  }
}

function isUnavailable(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 405 || error.status === 501)
  );
}

const envelope = <T>(response: { data: T }): T => response.data;

function normalizeMember(dto: GroupMemberDTO): GroupMember | null {
  const user = dto.user ?? (dto.userId ? { id: dto.userId, username: dto.userId, displayName: null, avatarUrl: null } : null);
  if (!user) return null;
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    role: dto.role ?? "member",
    joinedAt: dto.joinedAt ?? null,
  };
}

export function normalizeGroup(dto: GroupDTO, currentUserId?: string): GroupInfo {
  const id = dto.id ?? dto.conversationId ?? "";
  const rawMembers =
    dto.members ??
    dto.participants?.map((participant) => ({
      user: participant.user,
      role: participant.role,
      joinedAt: participant.joinedAt,
    })) ??
    [];
  const members = rawMembers
    .map(normalizeMember)
    .filter((member): member is GroupMember => Boolean(member));
  const me = members.find((member) => member.userId === currentUserId);
  const myRole = dto.myRole ?? me?.role ?? "member";
  return {
    id,
    name: dto.name ?? dto.groupName ?? "Group",
    avatarUrl: dto.avatarUrl ?? dto.groupAvatar ?? null,
    description: dto.description ?? null,
    memberCount: dto.memberCount ?? members.length,
    members,
    myRole,
    canManage: dto.canManage ?? (myRole === "owner" || myRole === "admin"),
    managementAvailable: true,
    createdAt: dto.createdAt ?? null,
  };
}

export const groupService = {
  async createGroup(input: CreateGroupInput): Promise<GroupInfo> {
    try {
      const response = await api.post<{ data: GroupDTO }>("/messages/groups", {
        name: input.name.trim(),
        memberIds: input.memberIds,
        avatarUrl: input.avatarUrl ?? undefined,
        description: input.description?.trim() || undefined,
      });
      return normalizeGroup(envelope(response));
    } catch (error) {
      if (isUnavailable(error)) throw new GroupFeatureUnavailableError();
      throw error;
    }
  },

  /** Falls back to the existing conversation payload when management routes are
   * not deployed, so existing groups still show their real members. */
  async getGroup(conversationId: string, currentUserId?: string): Promise<GroupInfo> {
    try {
      const response = await api.get<{ data: GroupDTO }>(
        `/messages/groups/${encodeURIComponent(conversationId)}`,
      );
      return normalizeGroup(envelope(response), currentUserId);
    } catch (error) {
      if (!isUnavailable(error)) throw error;
      const response = await api.get<{ data: BackendConversation[] }>(
        "/messages/conversations",
      );
      const conversation = response.data.find((item) => item.id === conversationId);
      if (!conversation) throw new Error("This group is no longer available.");
      const participants = conversation.participants.map(({ user }) => ({
        user,
        role: "member" as const,
      }));
      return {
        ...normalizeGroup(
          {
            id: conversation.id,
            name: conversation.groupName ?? "Group",
            avatarUrl: conversation.groupAvatar,
            participants,
            createdAt: conversation.updatedAt,
          },
          currentUserId,
        ),
        managementAvailable: false,
        canManage: false,
        myRole: "member",
      };
    }
  },

  async updateGroup(
    conversationId: string,
    patch: { name?: string; avatarUrl?: string | null; description?: string | null },
  ): Promise<GroupInfo> {
    try {
      const response = await api.patch<{ data: GroupDTO }>(
        `/messages/groups/${encodeURIComponent(conversationId)}`,
        patch,
      );
      return normalizeGroup(envelope(response));
    } catch (error) {
      if (isUnavailable(error)) throw new GroupFeatureUnavailableError();
      throw error;
    }
  },

  async addMembers(conversationId: string, userIds: string[]): Promise<GroupInfo> {
    try {
      const response = await api.post<{ data: GroupDTO }>(
        `/messages/groups/${encodeURIComponent(conversationId)}/members`,
        { userIds },
      );
      return normalizeGroup(envelope(response));
    } catch (error) {
      if (isUnavailable(error)) throw new GroupFeatureUnavailableError();
      throw error;
    }
  },

  async removeMember(conversationId: string, userId: string): Promise<void> {
    try {
      await api.delete(
        `/messages/groups/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
      );
    } catch (error) {
      if (isUnavailable(error)) throw new GroupFeatureUnavailableError();
      throw error;
    }
  },

  async setRole(conversationId: string, userId: string, role: Exclude<GroupRole, "owner">): Promise<GroupInfo> {
    try {
      const response = await api.patch<{ data: GroupDTO }>(
        `/messages/groups/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/role`,
        { role },
      );
      return normalizeGroup(envelope(response));
    } catch (error) {
      if (isUnavailable(error)) throw new GroupFeatureUnavailableError();
      throw error;
    }
  },

  async leaveGroup(conversationId: string): Promise<void> {
    try {
      await api.post(
        `/messages/groups/${encodeURIComponent(conversationId)}/leave`,
        {},
      );
    } catch (error) {
      if (isUnavailable(error)) throw new GroupFeatureUnavailableError();
      throw error;
    }
  },
};
