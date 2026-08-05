import { LoginResponse, RegisterResponse } from "@/types";
import { useAppDispatch } from "../store/hooks";
import { setCredentials } from "../store/slices/authSlice";
import api, { setTokens } from "@/services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class AuthService {
  private readonly baseUrl = `${process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.5:3000"}/api/v1/auth`;

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

    const response = await fetch(`${this.baseUrl}/register`, {
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

    dispatch(
      setCredentials({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName ?? null,
          avatarUrl: user.avatarUrl ?? null,
        },
        token: accessToken,
        refreshToken,
      }),
    );

    setTokens(accessToken, refreshToken);

    if (refreshToken) {
      await AsyncStorage.setItem("refreshToken", refreshToken);
    }
  }

  async login(email: string, password: string, dispatch: ReturnType<typeof useAppDispatch>): Promise<void> {
    this.validate(email, password);

    const response = await fetch(`${this.baseUrl}/login`, {
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

    dispatch(
      setCredentials({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl ?? null,
        },
        token: accessToken,
        refreshToken,
      }),
    );

    setTokens(accessToken, refreshToken);

    if (refreshToken) {
      await AsyncStorage.setItem("refreshToken", refreshToken);
    }
  }

  async logout(): Promise<void> {
    const token = await AsyncStorage.getItem("refreshToken");
    if (token) {
      await fetch(`${this.baseUrl}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: token }),
      }).catch(() => {});
      await AsyncStorage.removeItem("refreshToken");
    }
    setTokens(null, null);
  }
}

export const authService = new AuthService();
