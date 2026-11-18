import type { ActionMenuItem } from "@/providers/OverlayProvider";
import { showAppDialog } from "@/services/AppDialogService";
import type { SocialPost } from "@/types";

type PostMenuOptions = {
  post: SocialPost;
  currentUserId?: string;
  onSave: () => void | Promise<void>;
  onUnsave: () => void | Promise<void>;
  onShare: () => void;
  onEdit?: () => void;
  /** Confirmed delete callback; the sheet owns confirmation and error copy. */
  onDelete?: () => Promise<void>;
};

/**
 * One action sheet for the home feed and post/profile collections. Keeping the
 * item order, labels and destructive flow identical avoids the profile detail
 * menu drifting away from the feed menu.
 */
export function buildPostMenu({
  post,
  currentUserId,
  onSave,
  onUnsave,
  onShare,
  onEdit,
  onDelete,
}: PostMenuOptions): ActionMenuItem[] {
  const run = (action: () => void | Promise<void>, title: string) => {
    void Promise.resolve()
      .then(action)
      .catch((cause) =>
        showAppDialog({
          title,
          message: cause instanceof Error ? cause.message : "Please try again.",
          tone: "error",
        }),
      );
  };
  const isOwnPost = Boolean(post.author.id && post.author.id === currentUserId);
  const actions: ActionMenuItem[] = [
    {
      key: "save",
      icon: "bookmark-outline",
      label: post.isBookmarked ? "Remove from saved" : "Save post",
      onPress: () =>
        run(
          post.isBookmarked ? onUnsave : onSave,
          "Couldn’t update bookmark",
        ),
    },
    {
      key: "share",
      icon: "share-outline",
      label: "Share",
      onPress: onShare,
    },
  ];

  if (isOwnPost) {
    if (onEdit)
      actions.push({
        key: "edit",
        icon: "create-outline",
        label: "Edit post",
        onPress: onEdit,
      });
    if (onDelete)
      actions.push({
        key: "delete",
        icon: "trash-outline",
        label: "Delete post",
        destructive: true,
        onPress: () =>
          showAppDialog({
            title: "Delete this post?",
            message: "This post will be removed from your profile and feeds.",
            tone: "warning",
            buttons: [
              { key: "cancel", label: "Cancel", cancel: true },
              {
                key: "delete",
                label: "Delete post",
                destructive: true,
                onPress: () => run(onDelete, "Couldn’t delete post"),
              },
            ],
          }),
      });
  } else {
    actions.push(
      {
        key: "report",
        icon: "flag-outline",
        label: "Report",
        onPress: () => {
          // TODO: implement report.
        },
      },
      {
        key: "hide",
        icon: "eye-off-outline",
        label: "Hide post",
        onPress: () => {
          // TODO: implement hide.
        },
      },
      {
        key: "unfollow",
        icon: "person-remove-outline",
        label: "Unfollow",
        onPress: () => {
          // TODO: implement unfollow.
        },
      },
    );
  }

  return actions;
}
