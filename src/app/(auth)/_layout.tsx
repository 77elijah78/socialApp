import { Stack } from "expo-router";

const authLayout = () => (
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

export default authLayout;
