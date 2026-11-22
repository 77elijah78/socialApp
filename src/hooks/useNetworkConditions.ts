import { useEffect, useSyncExternalStore } from "react";
import { networkStatus, type NetworkSnapshot } from "@/services/NetworkConditions";

export function useNetworkConditions(): NetworkSnapshot {
  const snapshot = useSyncExternalStore(
    networkStatus.subscribe,
    networkStatus.getSnapshot,
    networkStatus.getSnapshot,
  );
  useEffect(() => networkStatus.start(), []);
  return snapshot;
}
