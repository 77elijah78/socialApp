import { useCallback, useEffect, useRef, useState } from "react";
import * as Network from "expo-network";

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

  useEffect(() => {
    let cancelled = false;

    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const connected = state.isInternetReachable ?? state.isConnected ?? false;
        if (!cancelled) {
          if (connected) {
            markOnline();
          } else {
            markOffline();
          }
        }
      } catch {
        if (!cancelled) {
          markOffline();
        }
      }
    };

    checkNetwork();

    const interval = setInterval(checkNetwork, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [markOffline, markOnline]);

  return {
    isConnected,
    isOffline,
    setIsConnected,
    setIsOffline,
    markOnline,
    markOffline,
  };
}
