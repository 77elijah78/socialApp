import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useAppSelector } from "@/store/hooks";
import { shareIntentInbox } from "@/services/ShareIntentInbox";

/** Routes Android ACTION_SEND / ACTION_SEND_MULTIPLE content to the in-app
 * recipient picker. The files stay in the native module's cache until sent. */
export default function ShareIntentHost() {
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const authenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const handled = useRef("");

  useEffect(() => {
    if (!hasShareIntent || !authenticated) return;
    const signature = JSON.stringify(
      (shareIntent.files ?? []).map((file) => file.path),
    );
    if (!signature || signature === handled.current) return;
    handled.current = signature;
    if (shareIntentInbox.accept(shareIntent)) {
      router.push("/share");
      // Copies ACTION_SEND content URIs into app cache before the temporary
      // grant can expire, then swaps the picker over to the stable paths.
      void shareIntentInbox.stagePending();
    }
  }, [authenticated, hasShareIntent, shareIntent]);

  useEffect(() => {
    if (hasShareIntent) resetShareIntent();
    else handled.current = "";
  }, [hasShareIntent, resetShareIntent]);

  return null;
}
