import { LoginResponse } from "@/types";
import { useAppDispatch } from "../store/hooks";
import { setCredentials } from "../store/slices/authSlice";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class AuthService {
  private readonly baseUrl = `${process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.3:3000"}/api/v1/auth`;

  private validate(email: string, password: string): void {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
  }

  async register(email: string, password: string): Promise<void> {
    this.validate(email, password);

    const response = await fetch(`${this.baseUrl}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Registration failed.");
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
      }),
    );

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
  }
}

export const authService = new AuthService();
