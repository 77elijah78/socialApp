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

import { FEED } from "@/constants/feedTheme";
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
            const color = focused ? FEED.accent : FEED.muted;
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
    paddingHorizontal: 0,
    paddingTop: 0,
    backgroundColor: "transparent",
  },
  surface: {
    position: "relative",
    minHeight: 62,
    overflow: "hidden",
    borderTopWidth: 1,
    borderColor: FEED.border,
    backgroundColor: Platform.OS === "ios" ? "rgba(255,255,255,0.94)" : FEED.surface,
  },
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
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
    color: FEED.muted,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: FEED.accent,
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
