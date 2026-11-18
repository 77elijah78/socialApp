import * as Google from "expo-auth-session/providers/google";
import { useCallback, useEffect, useRef, useState } from "react";

import { authService } from "@/services/AuthService";
import { RateLimitError } from "@/services/api";
import { useAppDispatch } from "@/store/hooks";

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";

export const googleAuthConfigured = Boolean(
  WEB_CLIENT_ID || IOS_CLIENT_ID || ANDROID_CLIENT_ID,
);

/**
 * System-browser OAuth with PKCE, Expo's supported flow for managed apps.
 * Only an ID token is requested; the backend verifies it and returns the app's
 * own access/refresh pair, so this never creates a parallel session model.
 */
export function useGoogleAuth() {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [request, , promptAsync] = Google.useIdTokenAuthRequest(
    {
      clientId: WEB_CLIENT_ID || ANDROID_CLIENT_ID || IOS_CLIENT_ID || "unconfigured",
      webClientId: WEB_CLIENT_ID || undefined,
      androidClientId: ANDROID_CLIENT_ID || undefined,
      iosClientId: IOS_CLIENT_ID || undefined,
      scopes: ["openid", "email", "profile"],
      selectAccount: false,
    },
    { scheme: "yoursocialapp", path: "oauth2redirect" },
  );

  const signIn = useCallback(async () => {
    if (inFlight.current || loading) return;
    if (!googleAuthConfigured) {
      setError(
        "Google sign-in isn’t configured in this build. Add an Expo public Google client ID and rebuild.",
      );
      return;
    }
    if (!request) {
      setError("Google sign-in is still preparing. Try again in a moment.");
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setCancelled(false);
    try {
      const result = await promptAsync({ showInRecents: true });
      if (result.type === "cancel" || result.type === "dismiss") {
        if (mounted.current) setCancelled(true);
        return;
      }
      if (result.type !== "success") {
        throw new Error(
          result.type === "error"
            ? result.error?.description || "Google sign-in failed."
            : "Google sign-in was not completed.",
        );
      }
      const idToken =
        result.params?.id_token ??
        result.authentication?.idToken ??
        result.params?.idToken;
      if (!idToken) throw new Error("Google did not return an ID token.");
      await authService.loginWithGoogle(idToken, dispatch);
      // The auth layout redirects once Redux credentials commit.
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        failure instanceof RateLimitError
          ? failure.message
          : failure instanceof Error && failure.message
            ? failure.message
            : "Google sign-in failed. Please try again.",
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [dispatch, loading, promptAsync, request]);

  const clearError = useCallback(() => {
    setError(null);
    setCancelled(false);
  }, []);

  return { signIn, loading, error, cancelled, clearError };
}
