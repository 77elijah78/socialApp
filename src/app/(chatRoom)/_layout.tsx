import { Stack } from "expo-router";
import { DETAIL_STACK_OPTIONS } from "@/constants/navigation";

const chatRoomLayout = () => (
  <Stack screenOptions={DETAIL_STACK_OPTIONS}>
    <Stack.Screen name="privateRoom" options={{ headerShown: false }} />
    <Stack.Screen name="newGroup" options={{ headerShown: false, presentation: "modal" }} />
    <Stack.Screen name="groupInfo" options={{ headerShown: false }} />
  </Stack>
);

export default chatRoomLayout;