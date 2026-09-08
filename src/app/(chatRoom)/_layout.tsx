import { Stack } from "expo-router";
import theme from "@/constants/theme";

const chatRoomLayout = () => (
  <Stack>
    <Stack.Screen name="privateRoom" options={{ headerShown: false }} />
  </Stack>
);

export default chatRoomLayout;