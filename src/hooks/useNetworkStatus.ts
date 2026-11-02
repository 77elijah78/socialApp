import { requireApiOrigin } from "@/config/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

const OFFLINE_DEBOUNCE_MS = 2500;

export interface NetworkState {
  isConnected: boolean | null;
  isOffline: boolean;
}

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKnownOnlineRef = useRef<boolean | null>(null);

  const markOffline = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setIsConnected(false);
      setIsOffline(true);
    }, OFFLINE_DEBOUNCE_MS);
  }, []);

  const markOnline = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastKnownOnlineRef.current = true;
    setIsConnected(true);
    setIsOffline(false);
  }, []);

  const checkNetwork = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${requireApiOrigin()}/health`, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        markOnline();
      } else {
        markOffline();
      }
    } catch {
      markOffline();
    } finally {
      clearTimeout(timeout);
    }
  }, [markOffline, markOnline]);

  useEffect(() => {
    // Start the existing external health poll; no new startup fetch owner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkNetwork();

    const interval = setInterval(checkNetwork, 15000);

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        checkNetwork();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      clearInterval(interval);
      subscription.remove();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [checkNetwork]);

  return {
    isConnected,
    isOffline,
    setIsConnected,
    setIsOffline,
    markOnline,
    markOffline,
  };
}
