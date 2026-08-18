import { useEffect, useRef, useState, useCallback } from "react";
import NetInfo from "@react-native-community/netinfo";

const DEBOUNCE_MS = 2500;

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

  const [data, setData] = useState<T | null>(() => getCachedData());
  const [state, setState] = useState<ScreenState>(() => (getCachedData() ? "cached" : "initial"));
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

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
  }, [JSON.stringify(queryKey)]);

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const connected = state.isConnected ?? state.isInternetReachable ?? false;
    setIsOffline(!connected);

    if (connected) {
      const cached = getCachedData();
      if (error) {
        setState(cached ? "failureWithCache" : "ready");
      } else if (cached && data) {
        setState("cached");
      }
      if (Date.now() - lastFetchSuccessRef.current > staleTimeMs) {
        fetchData();
      }
    } else {
      const cached = getCachedData();
      if (cached) {
        setState("offlineWithCache");
      } else {
        setState("offlineWithoutCache");
      }
    }
  });

  useEffect(() => {
    return () => {
      unsubscribeNetInfo();
    };
  }, [unsubscribeNetInfo]);

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
