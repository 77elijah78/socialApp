import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs/types";

import theme from "@/constants/theme";

export function LiquidGlassTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(insets.bottom, theme.SPACING.sm) },
      ]}
    >
      <View style={styles.surface}>
        {Platform.OS === "ios" ? (
          <BlurView
            pointerEvents="none"
            intensity={48}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const color = focused ? theme.COLORS.primary : theme.COLORS.textMutedGray;
            const label =
              typeof options.tabBarLabel === "string"
                ? options.tabBarLabel
                : options.title ?? route.name;
            const badge = options.tabBarBadge;
            const icon = options.tabBarIcon?.({ focused, color, size: 21 });

            const handlePress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const handleLongPress = () => {
              navigation.emit({ type: "tabLongPress", target: route.key });
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
                testID={options.tabBarButtonTestID}
                onPress={handlePress}
                onLongPress={handleLongPress}
                style={({ pressed }) => [
                  styles.tab,
                  focused && styles.tabActive,
                  pressed && styles.tabPressed,
                ]}
              >
                <View style={styles.iconWrap}>
                  {icon}
                  {badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        {typeof badge === "string" || typeof badge === "number"
                          ? badge
                          : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.label, focused && styles.labelActive]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: "transparent",
  },
  surface: {
    position: "relative",
    minHeight: 66,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(108, 92, 231, 0.12)",
    backgroundColor: Platform.OS === "ios" ? "rgba(255,255,255,0.76)" : "#FFFFFF",
    shadowColor: "rgba(35, 28, 75, 0.16)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 12,
  },
  row: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    marginHorizontal: 2,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabActive: {
    backgroundColor: theme.COLORS.primaryGhost,
  },
  tabPressed: {
    opacity: 0.72,
  },
  iconWrap: {
    width: 26,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    maxWidth: "100%",
    color: theme.COLORS.textMutedGray,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -8,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.secondary,
    borderWidth: 1.5,
    borderColor: theme.COLORS.bgWhite,
  },
  badgeText: {
    color: theme.COLORS.white,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
});
