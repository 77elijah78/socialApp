import { Redirect, Stack } from "expo-router";
import { useAppSelector } from "@/store/hooks";

export default function AuthLayout() {
  const isAuthenticated = useAppSelector(
    (state) =>
      state.auth.isAuthenticated &&
      Boolean(state.auth.user?.id && state.auth.token),
  );

  // Navigation follows the committed session, not a form's async callback.
  // This also handles re-entering an auth route with an existing session.
  if (isAuthenticated) return <Redirect href="/(tabs)/home" />;

  return (
    <Stack>
      <Stack.Screen
        name="login"
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen
        name="register"
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="verify-otp" options={{ headerShown: false }} />
    </Stack>
  );
}
