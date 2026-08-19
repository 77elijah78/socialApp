import { api } from "./api";

export interface SharePostResponse {
  postId: string;
  shareCount: number;
}

export interface ShareStoryResponse {
  storyId: string;
}

export interface FollowedUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface StartConversationResponse {
  conversationId: string;
}

export class ShareService {
  async sharePost(token: string, postId: string, conversationId: string): Promise<SharePostResponse> {
    const resp = await api.post<{ success: boolean; data: SharePostResponse }>(
      `/posts/${postId}/share`,
      { conversationId },
      token,
    );
    return resp.data;
  }

  async shareStory(token: string, storyId: string, conversationId: string): Promise<ShareStoryResponse> {
    const resp = await api.post<{ success: boolean; data: ShareStoryResponse }>(
      `/stories/${storyId}/share`,
      { conversationId },
      token,
    );
    return resp.data;
  }

  isStoryExpired(expiresAt: string | Date): boolean {
    return new Date(expiresAt).getTime() < Date.now();
  }

  async getMyFollowing(token: string, page = 1, limit = 50): Promise<{ users: FollowedUser[]; total: number }> {
    const resp = await api.get<{
      success: boolean;
      data: { following: FollowedUser[]; total: number };
    }>(`/users/me/following?page=${page}&limit=${limit}`, token);
    return { users: resp.data.following ?? [], total: resp.data.total ?? 0 };
  }

  async startConversation(token: string, userId: string): Promise<StartConversationResponse> {
    const resp = await api.post<{ success: boolean; data: StartConversationResponse }>(
      `/messages/conversations`,
      { userId },
      token,
    );
    return resp.data;
  }
}

export const shareService = new ShareService();
