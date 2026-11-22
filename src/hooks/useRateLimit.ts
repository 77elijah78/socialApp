import { useEffect, useState } from "react";
import {
  formatCooldown,
  type RateLimitScope,
  rateLimitStore,
} from "@/services/RateLimitService";

export function useRateLimit(scope: RateLimitScope = "global") {
  const [remainingMs, setRemainingMs] = useState(() =>
    rateLimitStore.blockedFor(scope),
  );

  useEffect(() => {
    const update = () => setRemainingMs(rateLimitStore.blockedFor(scope));
    update();
    const unsubscribe = rateLimitStore.subscribe(update);
    const timer = setInterval(update, 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [scope]);

  return {
    blocked: remainingMs > 0,
    remainingMs,
    countdown: formatCooldown(remainingMs),
    notice: rateLimitStore.get(scope),
  };
}
