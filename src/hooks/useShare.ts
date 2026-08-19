import { useState, useCallback } from "react";
import { useAppSelector } from "@/store/hooks";
import { shareService, FollowedUser } from "@/services/ShareService";
import { mediaService } from "@/services/MediaService";
import { presentShareSheet, ShareItem } from "@/components/ui/ShareSheet";
import { presentShareToUserSheet } from "@/components/ui/ShareToUserSheet";
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
  const [loadingUsers, setLoadingUsers] = useState(false);
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const sharePost = useCallback(async (post: SocialPost) => {
    if (!token || !currentUserId) return;
    if (post.author.id === currentUserId) {
      return;
    }

    setSharing(true);
    try {
      const deepLink = getPostDeepLink(post.id);
      const message = `Check out this post by ${post.author.displayName ?? post.author.username}`;

      const shareToUser = async () => {
        setLoadingUsers(true);
        try {
          const { users } = await shareService.getMyFollowing(token);
          presentShareToUserSheet({
            users,
            loading: false,
            onSelect: async (user: FollowedUser) => {
              try {
                const conversation = await shareService.startConversation(token, user.id);
                await shareService.sharePost(token, post.id, conversation.conversationId);
                await mediaService.message.sendSharedPost(
                  {
                    postId: post.id,
                    content: post.content,
                    authorName: post.author.displayName ?? post.author.username,
                    authorAvatarUrl: post.author.avatarUrl ?? null,
                    imageUrl: post.imageUrl ?? post.imageUrls?.[0] ?? null,
                  },
                  {
                    senderId: currentUserId,
                    receiverId: user.id,
                    conversationId: conversation.conversationId,
                  },
                );
              } catch (err) {
                console.error("Failed to share post to user:", err);
              }
            },
          });
        } catch (err) {
          console.error("Failed to load followed users:", err);
        } finally {
          setLoadingUsers(false);
        }
      };

      const items: ShareItem[] = [
        {
          key: "copy-link",
          icon: "link-outline",
          label: "Copy link",
          onPress: async () => {
            await copyToClipboard(deepLink);
          },
        },
        {
          key: "share-to-user",
          icon: "person-outline",
          label: "Share to user",
          onPress: shareToUser,
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

      const deepLink = getStoryDeepLink(story.id);
      const message = `Check out this story by ${story.user.displayName ?? story.user.username}`;

      const shareToUser = async () => {
        setLoadingUsers(true);
        try {
          const { users } = await shareService.getMyFollowing(token);
          presentShareToUserSheet({
            users,
            loading: false,
            onSelect: async (user: FollowedUser) => {
              try {
                const conversation = await shareService.startConversation(token, user.id);
                await shareService.shareStory(token, story.id, conversation.conversationId);
                await mediaService.message.sendSharedStory(
                  {
                    storyId: story.id,
                    mediaUrl: story.mediaUrl,
                    mediaType: story.mediaType,
                    caption: story.caption,
                    authorName: story.user.displayName ?? story.user.username,
                    authorAvatarUrl: story.user.avatarUrl ?? null,
                  },
                  {
                    senderId: currentUserId,
                    receiverId: user.id,
                    conversationId: conversation.conversationId,
                  },
                );
              } catch (err) {
                console.error("Failed to share story to user:", err);
              }
            },
          });
        } catch (err) {
          console.error("Failed to load followed users:", err);
        } finally {
          setLoadingUsers(false);
        }
      };

      presentShareSheet({
        title: "Share story",
        message,
        url: deepLink,
        canExternalShare: true,
        items: [
          {
            key: "copy-link",
            icon: "link-outline",
            label: "Copy link",
            onPress: async () => {
              await copyToClipboard(deepLink);
            },
          },
          {
            key: "share-to-user",
            icon: "person-outline",
            label: "Share to user",
            onPress: shareToUser,
          },
        ],
      });
    } catch (err) {
      console.error("Share story failed:", err);
    } finally {
      setSharing(false);
    }
  }, [token, currentUserId]);

  return {
    sharing,
    loadingUsers,
    sharePost,
    shareStory,
  };
}
