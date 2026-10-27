import type { Ionicons } from "@expo/vector-icons";

export type AppDialogIcon = keyof typeof Ionicons.glyphMap;
export type AppDialogTone = "info" | "success" | "warning" | "error" | "action";
export type AppDialogPresentation = "dialog" | "sheet";

export interface AppDialogButton {
  key: string;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  bold?: boolean;
  cancel?: boolean;
  icon?: AppDialogIcon;
}

export interface AppDialogOptions {
  title: string;
  message?: string;
  tone?: AppDialogTone;
  presentation?: AppDialogPresentation;
  icon?: AppDialogIcon;
  buttons?: AppDialogButton[];
}

type AppDialogHandler = (options: AppDialogOptions) => void;

let activeHandler: AppDialogHandler | null = null;

export function registerAppDialogHandler(handler: AppDialogHandler): () => void {
  activeHandler = handler;

  return () => {
    if (activeHandler === handler) {
      activeHandler = null;
    }
  };
}

export function showAppDialog(options: AppDialogOptions): void {
  if (!activeHandler) {
    if (__DEV__) {
      console.warn("App dialog requested before the overlay provider was ready.");
    }
    return;
  }

  activeHandler({
    ...options,
    buttons: options.buttons?.length
      ? options.buttons
      : [{ key: "dismiss", label: "Got it", bold: true }],
  });
}
