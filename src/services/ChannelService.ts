import { api, ApiError } from "./api";

export type ChannelRole = "owner" | "admin" | "member" | "subscriber";
export type ChannelPostType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "STICKER";

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  isPrivate: boolean;
  subscriberCount: number;
  isSubscribed: boolean;
  role: ChannelRole;
  canPost: boolean;
  createdAt?: string | null;
}

export interface ChannelAdmin {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ChannelRole;
}

export interface ChannelDetail extends Channel {
  admins: ChannelAdmin[];
  postCount?: number;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  content: string;
  type: ChannelPostType;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  duration: number | null;
  pinned: boolean;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface ChannelPostInput {
  content?: string;
  type?: ChannelPostType;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  pinned?: boolean;
}

export class ChannelFeatureUnavailableError extends Error {
  constructor() {
    super("Channels aren’t available on this server yet.");
    this.name = "ChannelFeatureUnavailableError";
  }
}

function unavailable(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 405 || error.status === 501)
  );
}

interface ChannelDTO {
  id: string;
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  isPrivate?: boolean;
  subscriberCount?: number;
  membersCount?: number;
  isSubscribed?: boolean;
  subscribed?: boolean;
  role?: ChannelRole;
  canPost?: boolean;
  canManage?: boolean;
  admins?: ChannelAdmin[];
  createdAt?: string | null;
}

interface PostDTO {
  id: string;
  channelId?: string;
  content?: string | null;
  type?: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  pinned?: boolean;
  isPinned?: boolean;
  createdAt?: string;
  author?: ChannelPost["author"];
  user?: ChannelPost["author"];
}

function normalizeChannel(dto: ChannelDTO): ChannelDetail {
  const role = dto.role ?? (dto.canManage ? "admin" : "subscriber");
  const canPost =
    dto.canPost ?? (role === "owner" || role === "admin");
  return {
    id: dto.id,
    name: dto.name ?? "Channel",
    description: dto.description ?? null,
    avatarUrl: dto.avatarUrl ?? null,
    isPrivate: Boolean(dto.isPrivate),
    subscriberCount: dto.subscriberCount ?? dto.membersCount ?? 0,
    isSubscribed: dto.isSubscribed ?? dto.subscribed ?? Boolean(dto.role),
    role,
    canPost,
    admins: dto.admins ?? [],
    createdAt: dto.createdAt ?? null,
  };
}

function normalizePost(dto: PostDTO): ChannelPost {
  const rawType = (dto.type ?? "TEXT").toUpperCase();
  const type = (
    ["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER"].includes(rawType)
      ? rawType
      : dto.mediaUrl
        ? "IMAGE"
        : "TEXT"
  ) as ChannelPostType;
  return {
    id: dto.id,
    channelId: dto.channelId ?? "",
    content: dto.content ?? "",
    type,
    mediaUrl: dto.mediaUrl ?? null,
    thumbnailUrl: dto.thumbnailUrl ?? null,
    fileName: dto.fileName ?? null,
    fileMimeType: dto.fileMimeType ?? null,
    fileSize: dto.fileSize ?? null,
    duration: dto.duration ?? null,
    pinned: dto.pinned ?? dto.isPinned ?? false,
    createdAt: dto.createdAt ?? new Date().toISOString(),
    author: dto.author ?? dto.user ?? null,
  };
}

function asList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["items", "channels", "posts", "results"]) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

export const channelService = {
  async list(query: string, scope: "discover" | "subscribed" = "discover", page = 1): Promise<Channel[]> {
    try {
      const response = await api.get<{ data: unknown; meta?: { hasNext?: boolean } }>(
        `/channels?query=${encodeURIComponent(query.trim())}&scope=${scope}&page=${page}&limit=20`,
      );
      return asList<ChannelDTO>(response.data).map(normalizeChannel);
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },

  async get(id: string): Promise<ChannelDetail> {
    try {
      const response = await api.get<{ data: ChannelDTO }>(`/channels/${encodeURIComponent(id)}`);
      return normalizeChannel(response.data);
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },

  async create(input: { name: string; description?: string; avatarUrl?: string | null; isPrivate: boolean }): Promise<ChannelDetail> {
    try {
      const response = await api.post<{ data: ChannelDTO }>("/channels", {
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        avatarUrl: input.avatarUrl ?? undefined,
        isPrivate: input.isPrivate,
      });
      return normalizeChannel(response.data);
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },

  async subscribe(id: string, subscribed: boolean): Promise<ChannelDetail> {
    try {
      const path = `/channels/${encodeURIComponent(id)}/subscribe`;
      const response = subscribed
        ? await api.post<{ data: ChannelDTO }>(path, {})
        : await api.delete<{ data: ChannelDTO }>(path);
      return normalizeChannel(response.data ?? { id });
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },

  async listPosts(id: string, cursor?: string | null): Promise<{ posts: ChannelPost[]; nextCursor: string | null }> {
    try {
      const response = await api.get<{
        data: unknown;
        meta?: { nextCursor?: string; hasNext?: boolean };
        nextCursor?: string;
      }>(
        `/channels/${encodeURIComponent(id)}/posts?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      return {
        posts: asList<PostDTO>(response.data).map(normalizePost),
        nextCursor: response.meta?.nextCursor ?? response.nextCursor ?? null,
      };
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },

  async createPost(id: string, input: ChannelPostInput): Promise<ChannelPost> {
    try {
      const response = await api.post<{ data: PostDTO }>(
        `/channels/${encodeURIComponent(id)}/posts`,
        input,
      );
      return normalizePost(response.data);
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },

  async updatePost(id: string, postId: string, patch: { content?: string; pinned?: boolean }): Promise<ChannelPost> {
    try {
      const response = await api.patch<{ data: PostDTO }>(
        `/channels/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}`,
        patch,
      );
      return normalizePost(response.data);
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },

  async deletePost(id: string, postId: string): Promise<void> {
    try {
      await api.delete(
        `/channels/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}`,
      );
    } catch (error) {
      if (unavailable(error)) throw new ChannelFeatureUnavailableError();
      throw error;
    }
  },
};
