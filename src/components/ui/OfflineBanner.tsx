import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";

const OFFLINE_DEBOUNCE_MS = 2500;

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOnlineRef = useRef<boolean | null>(null);

  const setOnline = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastOnlineRef.current = true;
    setIsConnected(true);
    setIsOffline(false);
  }, []);

  const setOffline = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastOnlineRef.current = false;
    debounceRef.current = setTimeout(() => {
      setIsConnected(false);
      setIsOffline(true);
    }, OFFLINE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    isConnected,
    isOffline,
    setOnline,
    setOffline,
    lastOnlineRef,
  };
}

export function OfflineBanner({
  isOffline,
  onRetry,
  visible = true,
}: {
  isOffline: boolean;
  onRetry?: () => void;
  visible?: boolean;
}) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible && isOffline ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [anim, isOffline, visible]);

  if (!isOffline) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 0],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }], opacity: anim },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Ionicons name="wifi-outline" size={18} color={theme.COLORS.textWhite} />
      <Text style={styles.text}>No internet connection</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.COLORS.danger,
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    zIndex: 9999,
    elevation: 4,
  },
  text: {
    color: theme.COLORS.textWhite,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  retryBtn: {
    marginLeft: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: theme.BORDER_RADIUS.full,
  },
  retryText: {
    color: theme.COLORS.textWhite,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
});
