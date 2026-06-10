import { Stack } from "expo-router";

const chatRoomLayout = () => (
  <Stack>
    <Stack.Screen name="privateRoom" options={{ headerShown: false }} />
  </Stack>
);


export default chatRoomLayout;