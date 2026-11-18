import { useSyncExternalStore } from "react";
import {
  autoDownloadSettings,
  type AutoDownloadSettings,
} from "@/services/AutoDownloadSettings";

export function useAutoDownloadSettings(): AutoDownloadSettings {
  return useSyncExternalStore(
    autoDownloadSettings.subscribe,
    autoDownloadSettings.getSnapshot,
    autoDownloadSettings.getSnapshot,
  );
}
