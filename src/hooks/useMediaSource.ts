import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useAppSelector } from "@/store/hooks";
import { getAuthGeneration, refreshMediaAccessToken } from "@/services/api";
import { isAuthenticatedMediaUrl, mediaHttpStatus, mediaTokenExpired, mediaRequestSource } from "@/utils/mediaRequests";

/** One identity/URI-scoped auth retry, sharing the HTTP client's refresh flight.
 * optionalAuth on /uploads turns missing/expired JWTs into 403. A second denial
 * stays a failure; never fall back to an anonymous request or a public URL. */
export function useMediaSource(uri: string | null | undefined) {
  const token = useAppSelector(state => state.auth.token);
  const ownerId = useAppSelector(state => state.auth.user?.id) ?? null;
  const generation = getAuthGeneration();
  const source = useMemo(() => mediaRequestSource(uri, ownerId ? token : null), [uri, ownerId, token]);
  const authenticated = isAuthenticatedMediaUrl(source.uri);
  const scopeKey = `${ownerId ?? "anonymous"}:${generation}:${source.uri}`;
  const cacheKey = authenticated ? `private:${scopeKey}` : source.uri;
  const scopeIdentity = useMemo(() => ({ key: scopeKey }), [scopeKey]);
  const lifetime = useRef({ identity: scopeIdentity, active: true, tried: false, work: null as Promise<boolean> | null });
  useLayoutEffect(() => {
    const scope = { identity: scopeIdentity, active: true, tried: false, work: null as Promise<boolean> | null };
    lifetime.current = scope;
    return () => { scope.active = false; };
  }, [scopeIdentity]);
  const isCurrent = useCallback(() => lifetime.current.active && lifetime.current.identity === scopeIdentity &&
    generation === getAuthGeneration(), [scopeIdentity, generation]);
  const retryAfterAuthError = useCallback((error: unknown, retry: () => void): Promise<boolean> => {
    if (!isCurrent() || !authenticated || !ownerId || !token || (!mediaHttpStatus(error) && !mediaTokenExpired(token)))
      return Promise.resolve(false);
    const scope = lifetime.current;
    if (scope.work) return scope.work;
    if (scope.tried) return Promise.resolve(false);
    scope.tried = true;
    const work = (async () => {
      const fresh = await refreshMediaAccessToken(token, generation);
      if (!fresh || !scope.active || lifetime.current !== scope || !isCurrent()) return false;
      // A synchronously failing native retry is a second denial, not another
      // subscriber to the refresh that has already completed.
      scope.work = null;
      retry();
      return true;
    })();
    scope.work = work;
    void work.finally(() => { if (scope.work === work) scope.work = null; }).catch(() => {});
    return work;
  }, [authenticated, ownerId, token, generation, isCurrent]);
  const imageSourceFor = useCallback((value: string | null | undefined) => {
    const request = mediaRequestSource(value, ownerId ? token : null);
    return { ...request, ...(isAuthenticatedMediaUrl(request.uri)
      ? { cacheKey: `private:${ownerId ?? "anonymous"}:${generation}:${request.uri}` } : {}) };
  }, [ownerId, token, generation]);
  const resetAuthRetry = useCallback(() => {
    if (isCurrent() && !lifetime.current.work) lifetime.current.tried = false;
  }, [isCurrent]);
  return {
    source, authenticated, ownerId, cacheKey, scopeKey,
    imageSource: useMemo(() => ({ ...source, ...(authenticated ? { cacheKey } : {}) }), [source, authenticated, cacheKey]),
    imageSourceFor, isCurrent, retryAfterAuthError, resetAuthRetry,
  };
}
