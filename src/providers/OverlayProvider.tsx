import React, { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import ActionMenu from "@/components/ui/ActionMenu";
import AppAlert from "@/components/ui/AppAlert";
import { CommentBottomSheet } from "@/components/posts/CommentBottomSheet";

export interface ActionMenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface AlertOptions {
  title: string;
  message?: string;
  buttons: {
    key: string;
    label: string;
    onPress: () => void;
    destructive?: boolean;
    bold?: boolean;
  }[];
}

type OverlayContextValue = {
  openActionMenu: (
    items: ActionMenuItem[],
    anchor?: { x: number; y: number; width: number; height: number }
  ) => void;
  closeActionMenu: () => void;
  showAlert: (options: AlertOptions) => void;
  closeAlert: () => void;
  openComments: (postId: string) => void;
  closeComments: () => void;
};

const OverlayContext = React.createContext<OverlayContextValue | null>(null);

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
  const [actionMenuAnchor, setActionMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | undefined>(undefined);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertButtons, setAlertButtons] = useState<AlertOptions["buttons"]>([]);

  const commentSheetRef = React.useRef<{ open: (postId: string) => void; close: () => void }>(null);

  const openActionMenu = useCallback((items: ActionMenuItem[], anchor?: { x: number; y: number; width: number; height: number }) => {
    console.log("[OverlayProvider] openActionMenu called, items:", items.length, "anchor:", !!anchor);
    setActionMenuItems(items);
    setActionMenuAnchor(anchor);
    setActionMenuVisible(true);
  }, []);

  const closeActionMenu = useCallback(() => {
    console.log("[OverlayProvider] closeActionMenu called");
    setActionMenuVisible(false);
  }, []);

  const showAlert = useCallback((options: AlertOptions) => {
    console.log("[OverlayProvider] showAlert called, title:", options.title);
    setAlertTitle(options.title);
    setAlertMessage(options.message ?? "");
    setAlertButtons(options.buttons);
    setAlertVisible(true);
  }, []);

  const closeAlert = useCallback(() => {
    console.log("[OverlayProvider] closeAlert called");
    setAlertVisible(false);
  }, []);

  const openComments = useCallback((postId: string) => {
    console.log("[OverlayProvider] openComments called, postId:", postId);
    commentSheetRef.current?.open(postId);
  }, []);

  const closeComments = useCallback(() => {
    console.log("[OverlayProvider] closeComments called");
    commentSheetRef.current?.close();
  }, []);

  const value = useMemo(() => ({
    openActionMenu,
    closeActionMenu,
    showAlert,
    closeAlert,
    openComments,
    closeComments,
  }), [openActionMenu, closeActionMenu, showAlert, closeAlert, openComments, closeComments]);

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <ActionMenu
        visible={actionMenuVisible}
        items={actionMenuItems}
        anchor={actionMenuAnchor}
        onClose={closeActionMenu}
      />
      <AppAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onClose={closeAlert}
      />
      <CommentBottomSheet ref={commentSheetRef} />
    </OverlayContext.Provider>
  );
}
