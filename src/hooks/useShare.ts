import { useState, useCallback } from "react";
import { useAppSelector } from "@/store/hooks";
import { shareService } from "@/services/ShareService";
import { mediaService } from "@/services/MediaService";
import { presentShareSheet, ShareItem } from "@/components/ui/ShareSheet";
import { getPostDeepLink, getStoryDeepLink, copyToClipboard } from "@/utils/deepLinks";
import { SocialPost } from "@/types";
import { router } from "expo-router";

interface ShareOptions {
  post?: SocialPost;
  story?: {
    id: string;
    mediaUrl: string;
    mediaType: string;
    caption: string | null;
    expiresAt: string | Date;
    user: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  };
}

export function useShare() {
  const [sharing, setSharing] = useState(false);
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const sharePost = useCallback(async (post: SocialPost) => {
    if (!token || !currentUserId) return;
    if (post.author.id === currentUserId) {
      return;
    }

    setSharing(true);
    try {
      const result = await shareService.sharePost(token, post.id, "");

      const deepLink = getPostDeepLink(post.id);
      const message = `Check out this post by ${post.author.displayName ?? post.author.username}`;

      const items: ShareItem[] = [
        {
          key: "copy-link",
          icon: "link-outline",
          label: "Copy link",
          onPress: async () => {
            await copyToClipboard(deepLink);
          },
        },
      ];

      presentShareSheet({
        title: "Share post",
        message,
        url: deepLink,
        canExternalShare: true,
        items,
      });
    } catch (err) {
      console.error("Share post failed:", err);
    } finally {
      setSharing(false);
    }
  }, [token, currentUserId]);

  const shareStory = useCallback(async (story: ShareOptions["story"]) => {
    if (!token || !currentUserId || !story) return;
    if (story.user.id === currentUserId) {
      return;
    }

    setSharing(true);
    try {
      const isExpired = shareService.isStoryExpired(story.expiresAt);
      if (isExpired) {
        return;
      }

      await shareService.shareStory(token, story.id, "");

      const deepLink = getStoryDeepLink(story.id);
      const message = `Check out this story by ${story.user.displayName ?? story.user.username}`;

      const items: ShareItem[] = [
        {
          key: "copy-link",
          icon: "link-outline",
          label: "Copy link",
          onPress: async () => {
            await copyToClipboard(deepLink);
          },
        },
      ];

      presentShareSheet({
        title: "Share story",
        message,
        url: deepLink,
        canExternalShare: true,
        items,
      });
    } catch (err) {
      console.error("Share story failed:", err);
    } finally {
      setSharing(false);
    }
  }, [token, currentUserId]);

  return {
    sharing,
    sharePost,
    shareStory,
  };
}
