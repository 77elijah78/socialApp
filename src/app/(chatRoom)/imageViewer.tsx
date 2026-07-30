import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import theme from "@/constants/theme";

export default function ImageViewerScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();

  if (!uri) return null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <View style={styles.closeCircle}>
          <View style={styles.closeIcon} />
        </View>
      </TouchableOpacity>

      <View style={styles.imageContainer}>
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: "70%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  closeButton: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeIcon: {
    width: 14,
    height: 2,
    backgroundColor: "#fff",
    transform: [{ rotate: "45deg" }],
  },
});
