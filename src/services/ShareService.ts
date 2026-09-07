import { api } from "@/services/api";

export interface FollowedUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ConversationResponse {
  conversationId: string;
}

export class ShareService {
  async getMyFollowing(token: string): Promise<{ users: FollowedUser[]; total: number }> {
    const resp = await api.get<{
      success: boolean;
      data: FollowedUser[];
      meta?: { total: number };
    }>("/users/me/following?page=1&limit=50", token);
    return {
      users: resp.data ?? [],
      total: resp.meta?.total ?? 0,
    };
  }

  async getSuggestedUsers(token: string): Promise<{ users: FollowedUser[]; total: number }> {
    const resp = await api.get<{
      success: boolean;
      data: FollowedUser[];
      meta?: { total: number };
    }>("/users/me/suggested?page=1&limit=50", token);
    return {
      users: resp.data ?? [],
      total: resp.meta?.total ?? 0,
    };
  }

  async startConversation(token: string, otherUserId: string): Promise<ConversationResponse> {
    const resp = await api.post<{ success: boolean; data: { id: string } }>(
      "/conversations",
      { userId: otherUserId },
      token,
    );
    return { conversationId: resp.data.id };
  }

  async sharePost(token: string, postId: string, conversationId: string): Promise<void> {
    await api.post(`/posts/${postId}/share`, { conversationId }, token);
  }

  async shareStory(token: string, storyId: string, conversationId: string): Promise<void> {
    await api.post(`/posts/stories/${storyId}/share`, { conversationId }, token);
  }

  isStoryExpired(expiresAt: string | Date): boolean {
    return new Date(expiresAt).getTime() < Date.now();
  }
}

export const shareService = new ShareService();
