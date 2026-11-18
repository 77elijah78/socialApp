import { Stack } from "expo-router";

import CreateStoryScreen from "@/components/stories/CreateStoryScreen";

export default function CreateStoryRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <CreateStoryScreen />
    </>
  );
}
