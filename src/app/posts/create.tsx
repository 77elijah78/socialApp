import { Stack } from "expo-router";

import CreatePostScreen from "@/components/posts/CreatePostScreen";

export default function CreatePostRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <CreatePostScreen />
    </>
  );
}
