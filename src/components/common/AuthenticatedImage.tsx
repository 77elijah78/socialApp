import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image, type ImageProps } from "expo-image";
import { isAuthenticatedMediaUrl } from "@/utils/mediaRequests";
import { useMediaSource } from "@/hooks/useMediaSource";

interface Props extends Omit<ImageProps, "source" | "placeholder"> {
  uri: string | null | undefined;
  placeholderUri?: string | null;
}

/** Same native Expo image renderer, with scoped credentials for private uploads.
 * Keep auth recovery inside the loader so a temporary 403 doesn't permanently
 * hide the image/thumbnail before the refreshed request has a chance to finish. */
function AuthenticatedImage({ uri, placeholderUri, onError, onLoad, cachePolicy, ...props }: Props) {
  const { source, imageSource, cacheKey, scopeKey, imageSourceFor, authenticated, isCurrent, retryAfterAuthError } = useMediaSource(uri);
  const placeholder = placeholderUri ? imageSourceFor(placeholderUri) : undefined;
  const protectedRequest = authenticated || Boolean(placeholder && isAuthenticatedMediaUrl(placeholder.uri));
  const [attempt, setAttempt] = useState(0);
  const attemptKey = `${scopeKey}:${attempt}`;
  const activeAttempt = useRef(attemptKey);
  const handledError = useRef<string | null>(null);
  useLayoutEffect(() => { activeAttempt.current = attemptKey; handledError.current = null; }, [attemptKey]);
  useEffect(() => {
    if (!source.uri && isCurrent()) onError?.({ error: "This media address is unavailable." });
  }, [source.uri, isCurrent, onError]);
  return (
    <Image
      {...props}
      key={attemptKey}
      source={source.uri ? imageSource : null}
      placeholder={placeholder}
      recyclingKey={cacheKey}
      // Private decoded images may be reused by this account in RAM, not written
      // into an account-unscoped persistent native image cache.
      cachePolicy={protectedRequest ? "memory" : cachePolicy}
      onLoad={event => { if (isCurrent() && activeAttempt.current === attemptKey) onLoad?.(event); }}
      onError={event => {
        if (!isCurrent() || activeAttempt.current !== attemptKey || handledError.current === attemptKey) return;
        handledError.current = attemptKey;
        void retryAfterAuthError(event, () => setAttempt(value => value + 1))
          .then(retried => { if (!retried && isCurrent() && activeAttempt.current === attemptKey) onError?.(event); });
      }}
    />
  );
}
export default memo(AuthenticatedImage);
