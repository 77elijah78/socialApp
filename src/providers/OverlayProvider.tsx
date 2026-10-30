import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import ActionMenu from "@/components/ui/ActionMenu";
import AppAlert from "@/components/ui/AppAlert";
import ShareModal from "@/components/ui/ShareModal";
import { CommentBottomSheet } from "@/components/posts/CommentBottomSheet";
import {
  registerAppDialogHandler,
  type AppDialogButton,
  type AppDialogOptions,
} from "@/services/AppDialogService";

export interface ActionMenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export type AlertOptions = AppDialogOptions;

export interface ShareOptions {
  postId?: string;
  storyId?: string;
}

type OverlayContextValue = {
  openActionMenu: (
    items: ActionMenuItem[],
    anchor?: { x: number; y: number; width: number; height: number },
  ) => void;
  closeActionMenu: () => void;
  showAlert: (options: AlertOptions) => void;
  closeAlert: () => void;
  openComments: (postId: string) => void;
  closeComments: () => void;
  openShare: (options: ShareOptions) => void;
  closeShare: () => void;
};

const OverlayContext = React.createContext<OverlayContextValue | null>(null);
// Separate from action callbacks so opening a sheet does not rerender every
// memoized message card that merely needs openActionMenu.
const OverlayVisibility = React.createContext(false);
export const useOverlayVisible = () => React.useContext(OverlayVisibility);

export function useOverlay(): OverlayContextValue {
  const ctx = React.useContext(OverlayContext);
  if (!ctx) {
    throw new Error("useOverlay must be used within an OverlayProvider");
  }
  return ctx;
}

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [actionMenuItems, setActionMenuItems] = useState<ActionMenuItem[]>([]);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<
    { x: number; y: number; width: number; height: number } | undefined
  >();

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertOptions, setAlertOptions] = useState<AlertOptions>({
    title: "",
    buttons: [],
  });

  const [shareVisible, setShareVisible] = useState(false);
  const [sharePostId, setSharePostId] = useState<string | null>(null);
  const [shareStoryId, setShareStoryId] = useState<string | null>(null);

  const commentSheetRef = React.useRef<{
    open: (postId: string) => void;
    close: () => void;
  }>(null);

  const openActionMenu = useCallback(
    (
      items: ActionMenuItem[],
      anchor?: { x: number; y: number; width: number; height: number },
    ) => {
      setActionMenuItems(items);
      setActionMenuAnchor(anchor);
      setActionMenuVisible(true);
    },
    [],
  );

  const closeActionMenu = useCallback(() => {
    setActionMenuVisible(false);
  }, []);

  const showAlert = useCallback((options: AlertOptions) => {
    const buttons: AppDialogButton[] = options.buttons?.length
      ? options.buttons
      : [{ key: "dismiss", label: "Got it", bold: true }];
    setAlertOptions({ ...options, buttons });
    setAlertVisible(true);
  }, []);

  useEffect(() => registerAppDialogHandler(showAlert), [showAlert]);

  const closeAlert = useCallback(() => {
    setAlertVisible(false);
  }, []);

  const openComments = useCallback((postId: string) => {
    commentSheetRef.current?.open(postId);
  }, []);

  const closeComments = useCallback(() => {
    commentSheetRef.current?.close();
  }, []);

  const openShare = useCallback((options: ShareOptions) => {
    setSharePostId(options.postId ?? null);
    setShareStoryId(options.storyId ?? null);
    setShareVisible(true);
  }, []);

  const closeShare = useCallback(() => {
    setShareVisible(false);
  }, []);

  const value = useMemo(
    () => ({
      openActionMenu,
      closeActionMenu,
      showAlert,
      closeAlert,
      openComments,
      closeComments,
      openShare,
      closeShare,
    }),
    [
      openActionMenu,
      closeActionMenu,
      showAlert,
      closeAlert,
      openComments,
      closeComments,
      openShare,
      closeShare,
    ],
  );

  return (
    <OverlayContext.Provider value={value}>
      <OverlayVisibility.Provider value={actionMenuVisible || alertVisible || shareVisible}>
        {children}
      </OverlayVisibility.Provider>
      <ActionMenu
        visible={actionMenuVisible}
        items={actionMenuItems}
        anchor={actionMenuAnchor}
        onClose={closeActionMenu}
      />
      <AppAlert
        visible={alertVisible}
        title={alertOptions.title}
        message={alertOptions.message}
        buttons={alertOptions.buttons ?? []}
        tone={alertOptions.tone}
        presentation={alertOptions.presentation}
        icon={alertOptions.icon}
        onClose={closeAlert}
      />
      <CommentBottomSheet ref={commentSheetRef} />
      <ShareModal
        visible={shareVisible}
        postId={sharePostId ?? undefined}
        storyId={shareStoryId ?? undefined}
        onClose={closeShare}
      />
    </OverlayContext.Provider>
  );
}
