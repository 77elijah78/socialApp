import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  TouchableWithoutFeedback,
  Animated,
  PanResponder,
} from "react-native";
import theme from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ImageViewerProps {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

export default function ImageViewer({ visible, uri, onClose }: ImageViewerProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(1);
  const [isAnimating, setIsAnimating] = useState(false);

  const resetTransform = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
    ]).start(() => {
      scaleValue.current = 1;
      setIsAnimating(false);
    });
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => {
      return Math.abs(gesture.dy) > 10 || Math.abs(gesture.dx) > 10;
    },
    onPanResponderGrant: () => {
      resetTransform();
    },
    onPanResponderMove: (_, gesture) => {
      if (scaleValue.current === 1) {
        translateY.setValue(gesture.dy);
        translateX.setValue(gesture.dx);
      }
    },
    onPanResponderRelease: (_, gesture) => {
      if (scaleValue.current === 1) {
        if (Math.abs(gesture.dy) > 100 || Math.abs(gesture.dx) > 100) {
          onClose();
        } else {
          Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          ]).start();
        }
      }
    },
  });

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.container} {...panResponder.panHandlers}>
        <Animated.Image
          source={{ uri }}
          style={[
            styles.image,
            {
              transform: [
                { scale },
                { translateY },
                { translateX },
              ],
            },
          ]}
          resizeMode="contain"
        />
      </View>

      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.closeArea} />
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  closeArea: {
    position: "absolute",
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    zIndex: 10000,
  },
});
