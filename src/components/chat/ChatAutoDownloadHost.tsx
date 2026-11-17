import { useEffect } from "react";
import { messageStore } from "@/db/MessageStore";
import { useAppSelector } from "@/store/hooks";
import { useAutoDownloadSettings } from "@/hooks/useAutoDownloadSettings";
import { useNetworkConditions } from "@/hooks/useNetworkConditions";
import { autoDownloadRunner } from "@/services/AutoDownloadRunner";

/** Applies Auto Download to incoming messages while the app is running. The
 * chat screen also considers its loaded rows, which covers history restored
 * from SQLite before this host receives a live socket change. */
export default function ChatAutoDownloadHost() {
  const userId = useAppSelector((state) => state.auth.user?.id ?? "");
  const settings = useAutoDownloadSettings();
  const network = useNetworkConditions();

  useEffect(() => {
    autoDownloadRunner.sync(
      `${network.kind}:${JSON.stringify(settings.networks)}:${JSON.stringify(settings.media)}`,
    );
  }, [network.kind, settings]);

  useEffect(() => {
    if (!userId) return;
    return messageStore.subscribe((change) => {
      if (change.type !== "upsert") return;
      autoDownloadRunner.considerAll(
        change.rows.filter((row) => row.senderId !== userId),
        userId,
        settings,
        network.kind,
      );
    });
  }, [network.kind, settings, userId]);

  return null;
}
