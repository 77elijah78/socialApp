import { apiUrl, API_ORIGIN } from "../config/api";
import { LoginResponse, RegisterResponse } from "@/types";
import { useAppDispatch } from "../store/hooks";
import { setCredentials } from "../store/slices/authSlice";
import { setTokens } from "@/services/api";
import { prepareMessagingAccount } from "./MessagingCache";
import { mediaService } from "./MediaService";
import { revokePushBeforeLogout } from "./notifications/PushLogout";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class AuthService {

  private validate(email: string, password: string): void {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
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

    const response = await fetch(apiUrl("/auth/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, username, displayName }),
    });

    const data: RegisterResponse = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Registration failed.");
    }

    const { user, accessToken, refreshToken } = data.data;
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
          avatarUrl: user.avatarUrl ?? null,
        },
        token: accessToken,
        refreshToken,
      }),
    );
  }

  async login(email: string, password: string, dispatch: ReturnType<typeof useAppDispatch>): Promise<void> {
    this.validate(email, password);

    const response = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data: LoginResponse = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Login failed.");
    }

    const { user, accessToken, refreshToken } = data.data;
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
          displayName: user.displayName,
          bio: user.bio ?? null,
          avatarUrl: user.avatarUrl ?? null,
        },
        token: accessToken,
        refreshToken,
      }),
    );
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
