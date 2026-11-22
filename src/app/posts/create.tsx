import { Stack } from "expo-router";

import CreatePostScreen from "@/components/posts/CreatePostScreen";

export default function CreatePostRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: "transparentModal",
          animation: "none",
          gestureEnabled: false,
        }}
      />
      <CreatePostScreen />
    </>
  );
}
