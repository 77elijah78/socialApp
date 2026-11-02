import { useEffect, useRef, useState, useCallback } from "react";
import { useNetworkStatus } from "./useNetworkStatus";

export type ScreenState = "initial" | "cached" | "offlineWithCache" | "offlineWithoutCache" | "failureWithCache" | "failureWithoutCache" | "ready";

export interface UseScreenStateOptions<T> {
  queryKey: string[];
  queryFn: () => Promise<T>;
  getCachedData: () => T | null;
  setCachedData: (data: T) => void;
  staleTimeMs?: number;
}

export interface UseScreenStateResult<T> {
  data: T | null;
  state: ScreenState;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isOffline: boolean;
  retry: () => void;
  refresh: () => Promise<void>;
}

export function useScreenState<T>(options: UseScreenStateOptions<T>): UseScreenStateResult<T> {
  const {
    queryKey,
    queryFn,
    getCachedData,
    setCachedData,
    staleTimeMs = 60_000,
  } = options;

  const queryIdentity = JSON.stringify(queryKey);
  const [data, setData] = useState<T | null>(() => getCachedData());
  const [state, setState] = useState<ScreenState>(() => (getCachedData() ? "cached" : "initial"));
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isConnected } = useNetworkStatus();
  const isOffline = isConnected === false;

  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const lastFetchSuccessRef = useRef<number>(0);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (!isRefresh) {
        setError(null);
      } else {
        setIsRefreshing(true);
      }

      try {
        const result = await queryFn();
        if (!mountedRef.current) return;

        lastFetchSuccessRef.current = Date.now();
        setCachedData(result);
        setData(result);

        const cached = getCachedData();
        if (cached) {
          setState(isRefresh ? "cached" : "ready");
        } else {
          setState("ready");
        }
        setError(null);
      } catch (err: any) {
        if (!mountedRef.current) return;
        const msg = err?.message ?? "Something went wrong";
        setError(msg);
        const cached = getCachedData();
        if (cached) {
          setState("failureWithCache");
        } else {
          setState("failureWithoutCache");
        }
      } finally {
        if (mountedRef.current) {
          fetchingRef.current = false;
          setIsRefreshing(false);
        }
      }
    },
    [queryFn, getCachedData, setCachedData],
  );

  useEffect(() => {
    mountedRef.current = true;
    const cached = getCachedData();
    if (cached) {
      // Sync this legacy hook to a new external query/cache identity.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(cached);
      setState("cached");
      fetchData();
    } else {
      setState("initial");
      fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  // Query identity, rather than unstable caller callbacks, owns a cache session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryIdentity]);

  useEffect(() => {
    if (isConnected === null) return;
    const cached = getCachedData();
    if (!isConnected) {
      // Connectivity is an external event from the existing shared hook.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(cached ? "offlineWithCache" : "offlineWithoutCache");
    } else if (Date.now() - lastFetchSuccessRef.current > staleTimeMs) {
      void fetchData();
    }
  }, [isConnected, getCachedData, staleTimeMs, fetchData]);

  const retry = useCallback(() => {
    setError(null);
    const cached = getCachedData();
    if (cached) {
      setState("cached");
      setData(cached);
    } else {
      setState("initial");
    }
    fetchData();
  }, [fetchData, getCachedData]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return {
    data,
    state,
    error,
    isLoading: state === "initial" && !data,
    isRefreshing,
    isOffline,
    retry,
    refresh,
  };
}
