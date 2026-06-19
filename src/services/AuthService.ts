import { LoginResponse } from "@/types";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setCredentials, logout } from "../store/slices/authSlice";
import { AppDispatch } from "@/store";

export class AuthService {
  private baseUrl = 'http://192.168.1.3:3000/api/v1/auth';
  private readonly loginEndpoint = "/login";
  private readonly registerEndpoint = "/register";

  private validate(email: string, password: string): void {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
  }

  async register(email: string, password: string): Promise<any> {
    this.validate(email, password);

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL}${this.registerEndpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );

    if (!response.ok) {
      throw new Error("Registration failed.");
    }
  }

  async login(email: string, password: string,dispatch:AppDispatch): Promise<any> {
    const email2 = "alice"
    this.validate(email, password);

    const response = await fetch(
      `${this.baseUrl}${this.loginEndpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password,email2 }),
      },
    );


    const data:  LoginResponse = await response.json();
    console.log("data",data)
    dispatch(
      setCredentials({
        user: { id: "1", username: data.data.user.email, email:data.data.user.email },
        token: data.data.accesstoken,
      }),
    );

    if (!response.ok) {
      throw new Error("Login failed.");
    }
  }
}

export const authService = new AuthService();
