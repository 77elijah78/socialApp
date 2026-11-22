import { normalizeMediaUrl } from "@/utils/mediaUrls";
import { apiUrl, API_ORIGIN } from "../config/api";
import { LoginResponse } from "@/types";
import { useAppDispatch } from "../store/hooks";
import { setCredentials } from "../store/slices/authSlice";
import { applyRateLimitResponse, setTokens } from "@/services/api";
import { prepareMessagingAccount } from "./MessagingCache";
import { mediaService } from "./MediaService";
import { revokePushBeforeLogout } from "./notifications/PushLogout";
import AsyncStorage from "@react-native-async-storage/async-storage";

type AuthUser = LoginResponse["data"]["user"];
type AuthPayload = LoginResponse["data"];

export class AuthService {
  private validate(email: string, password: string): void {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
  }

  /** Single commit path for email/password and Google so both preserve the
   * existing JWT, refresh-token, push revocation and cache lifecycle. */
  private async completeAuthentication(
    payload: AuthPayload,
    dispatch: ReturnType<typeof useAppDispatch>,
  ): Promise<void> {
    const { user, accessToken, refreshToken } = payload;
    await revokePushBeforeLogout(user.id).catch(() => {});
    await prepareMessagingAccount(user.id);
    if (refreshToken) {
      await AsyncStorage.setItem("refreshToken", refreshToken);
    }
    // Activate the HTTP identity before Redux subscribers mount authenticated
    // screens/socket providers. Nothing fallible remains after this commit.
    setTokens(accessToken, refreshToken);

    dispatch(
      setCredentials({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName ?? null,
          bio: user.bio ?? null,
          avatarUrl: normalizeMediaUrl(user.avatarUrl),
        },
        token: accessToken,
        refreshToken,
      }),
    );
  }

  private async authenticate(
    path: string,
    body: Record<string, unknown>,
  ): Promise<AuthPayload> {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));

    // The auth endpoints predate the api helper, so they must opt into the same
    // global 429 cooldown instead of leaving the user with a generic failure.
    if (response.status === 429) {
      throw applyRateLimitResponse(response, path, data);
    }
    if (!response.ok || !data?.success) {
      // Capability detection: the current server may not deploy the Google
      // exchange route yet. Say so instead of sending users into a retry loop.
      if (
        path.endsWith("/google") &&
        (response.status === 404 ||
          response.status === 405 ||
          response.status === 501)
      ) {
        throw new Error(
          "Google sign-in isn’t supported by this server yet. Use email and password, or ask the server owner to enable it.",
        );
      }
      throw new Error(
        data?.message ||
          (path.endsWith("/google")
            ? "Google sign-in failed. Please try again."
            : "Authentication failed."),
      );
    }
    return data.data as AuthPayload;
  }

  async register(
    email: string,
    password: string,
    username: string,
    displayName: string | undefined,
    dispatch: ReturnType<typeof useAppDispatch>,
  ): Promise<void> {
    if (!email || !password || !username) {
      throw new Error("Email, username, and password are required.");
    }
    const payload = await this.authenticate("/auth/register", {
      email,
      password,
      username,
      displayName,
    });
    await this.completeAuthentication(payload, dispatch);
  }

  async login(
    email: string,
    password: string,
    dispatch: ReturnType<typeof useAppDispatch>,
  ): Promise<void> {
    this.validate(email, password);
    const payload = await this.authenticate("/auth/login", { email, password });
    await this.completeAuthentication(payload, dispatch);
  }

  /**
   * Exchanges a Google-issued ID token for the app's own JWT pair. The backend
   * is the sole verifier of the token and owns account linking; this client
   * never trusts profile data without a returned app session.
   */
  async loginWithGoogle(
    idToken: string,
    dispatch: ReturnType<typeof useAppDispatch>,
  ): Promise<void> {
    if (!idToken) throw new Error("Google did not return an ID token.");
    const payload = await this.authenticate("/auth/google", { idToken });
    await this.completeAuthentication(payload, dispatch);
  }

  async logout(): Promise<void> {
    // Revoke while this account still owns the HTTP identity; local native
    // unregister also prevents an offline logout from leaving FCM active.
    await revokePushBeforeLogout().catch(() => {});
    setTokens(null, null);
    mediaService.message.resetSession();
    mediaService.disconnectSocket();
    await prepareMessagingAccount(null);
    const token = await AsyncStorage.getItem("refreshToken");
    if (token && API_ORIGIN) {
      await fetch(apiUrl("/auth/logout"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: token }),
      }).catch(() => {});
    }
    await AsyncStorage.removeItem("refreshToken");
    setTokens(null, null);
  }
}

export const authService = new AuthService();
export type { AuthPayload, AuthUser };
