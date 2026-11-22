import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/services/api";
import { useDebounce } from "@/hooks/useDebounce";
import { useAppSelector } from "@/store/hooks";
import { normalizeMediaUrl } from "@/utils/mediaUrls";

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio?: string | null;
  isVerified?: boolean;
}

export function useUserSearch(query: string, limit = 20) {
  const token = useAppSelector((state) => state.auth.token) ?? undefined;
  const userId = useAppSelector((state) => state.auth.user?.id);
  const debounced = useDebounce(query.trim(), 300);
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (!debounced) {
      setUsers([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ data: UserSearchResult[] }>(
        `/users/search?q=${encodeURIComponent(debounced)}`,
        token,
      );
      if (requestId.current !== id) return;
      setUsers(
        (Array.isArray(response.data) ? response.data : [])
          .filter((user) => user.id !== userId)
          .slice(0, limit)
          .map((user) => ({
            ...user,
            avatarUrl: normalizeMediaUrl(user.avatarUrl),
          })),
      );
    } catch (failure) {
      if (requestId.current !== id) return;
      setUsers([]);
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t search for people right now.",
      );
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [debounced, limit, token, userId]);

  useEffect(() => {
    // Defer so a debounce tick never triggers a synchronous cascade during commit.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return { users, loading, error, retry: load, query: debounced };
}
