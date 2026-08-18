import { api } from "./api";

export interface SharePostResponse {
  postId: string;
  shareCount: number;
}

export interface ShareStoryResponse {
  storyId: string;
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
}

export const shareService = new ShareService();
