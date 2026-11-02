import { Stack } from "expo-router";
import { DETAIL_STACK_OPTIONS } from "@/constants/navigation";

const chatRoomLayout = () => (
  <Stack screenOptions={DETAIL_STACK_OPTIONS}>
    <Stack.Screen name="privateRoom" options={{ headerShown: false }} />
  </Stack>
);

export default chatRoomLayout;