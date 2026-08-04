import React from "react";
import { View, StyleSheet, StatusBar, TouchableOpacity } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StoryViewer from "@/components/stories/StoryViewer";
import { useStories } from "@/hooks/useStories";
import theme from "@/constants/theme";

export default function StoryViewerScreen() {
  const params = useLocalSearchParams<{ index?: string }>();
  const initialIndex = params.index ? parseInt(params.index, 10) : 0;
  const { stories, updateStoryViewed } = useStories();

  const handleClose = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />
      <StoryViewer
        stories={stories}
        initialIndex={initialIndex}
        onStoryViewed={updateStoryViewed}
        onClose={handleClose}
      />
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
      >
        <Ionicons name="close" size={28} color={theme.COLORS.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 16,
    zIndex: 20,
  },
});
