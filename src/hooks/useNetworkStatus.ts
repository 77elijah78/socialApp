import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

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
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? state.isInternetReachable ?? false;
      if (connected) {
        markOnline();
      } else {
        markOffline();
      }
    });

    NetInfo.fetch().then((state) => {
      const connected = state.isConnected ?? state.isInternetReachable ?? false;
      setIsConnected(connected);
      setIsOffline(!connected);
      lastKnownOnlineRef.current = connected;
    });

    return () => {
      unsubscribe();
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
