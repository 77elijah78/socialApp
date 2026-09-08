import React, { useCallback, useEffect, useRef } from "react";

import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";

import theme from "@/constants/theme";

const GLASS_COLORS = {
  light: {
    surface: "rgba(255, 255, 255, 0.78)",
    border: "rgba(255, 255, 255, 0.68)",
    active: theme.COLORS.indigo,
    activeSoft: "rgba(79, 70, 229, 0.14)",
    text: theme.COLORS.textPrimary,
    textMuted: theme.COLORS.textMuted,
    shadow: "rgba(31, 41, 55, 0.18)",
  },
} as const;

type GlassColors = (typeof GLASS_COLORS)[keyof typeof GLASS_COLORS];

interface TabBarProps {
  state: any;
  descriptors: Record<string, any>;
  navigation: any;
  insets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

interface IconLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function LiquidGlassTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: TabBarProps) {
  /*
   * The app is light-themed only (see constants/theme.ts).
   * We do NOT use useColorScheme() here — that returns the OS
   * scheme, which can be dark on Android even when the app
   * forces light. Using it made the bar render dark.
   */
  const glass = GLASS_COLORS.light;

  const { width: screenWidth } = useWindowDimensions();

  const routes = state.routes;
  const activeIndex = state.index;

  const bottomInset = Math.max(insets?.bottom ?? 0, 0);

  const horizontalMargin = Math.max(14, Math.min(22, screenWidth * 0.045));

  /*
   * Animated position of the active circle.
   */
  const pillX = useRef(new Animated.Value(0)).current;

  const pillY = useRef(new Animated.Value(0)).current;

  /*
   * Store icon positions for every tab.
   */
  const iconLayouts = useRef<Record<number, IconLayout>>({});

  /*
   * Used while layouts are not ready.
   */
  const retryRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );

  /*
   * Size of the circle behind the icon.
   */
  const PILL_SIZE = 40;

  /*
   * Move the active circle to the selected icon.
   */
  const applyPill = useCallback(
    (index: number, animated = true) => {
      const layout = iconLayouts.current[index];

      /*
       * Layout isn't available yet.
       * Wait one frame and try again.
       */
      if (!layout) {
        if (!retryRef.current) {
          retryRef.current = requestAnimationFrame(() => {
            retryRef.current = null;
            applyPill(index, animated);
          });
        }

        return;
      }

      /*
       * Icon layout is relative to the tab.
       *
       * The tab itself is already positioned inside
       * the container, so we only need the icon's
       * position plus the tab's x coordinate.
       */
      const tabLayout = tabLayouts.current[index];

      if (!tabLayout) {
        if (!retryRef.current) {
          retryRef.current = requestAnimationFrame(() => {
            retryRef.current = null;
            applyPill(index, animated);
          });
        }

        return;
      }

      /*
       * Center the circle on the icon.
       */
      const targetX = tabLayout.x + layout.x + layout.width / 2 - PILL_SIZE / 2;

      const targetY =
        tabLayout.y + layout.y + layout.height / 2 - PILL_SIZE / 2;

      if (!animated) {
        pillX.setValue(targetX);
        pillY.setValue(targetY);
        return;
      }

      Animated.parallel([
        Animated.timing(pillX, {
          toValue: targetX,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(pillY, {
          toValue: targetY,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [pillX, pillY],
  );

  /*
   * Store Tab layouts separately from icon layouts.
   */
  const tabLayouts = useRef<
    Record<number, { x: number; y: number; width: number; height: number }>
  >({});

  /*
   * Move the circle whenever the active tab changes.
   */
  useEffect(() => {
    applyPill(activeIndex);

    return () => {
      if (retryRef.current) {
        cancelAnimationFrame(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [activeIndex, applyPill]);

  /*
   * Called when a Tab is measured.
   */
  const handleTabLayout = (index: number) => (event: any) => {
    const { x, y, width, height } = event.nativeEvent.layout;

    tabLayouts.current[index] = {
      x,
      y,
      width,
      height,
    };

    if (index === activeIndex) {
      applyPill(index, false);
    }
  };

  /*
   * Called when the icon wrapper is measured.
   */
  const handleIconLayout = (index: number) => (event: any) => {
    const { x, y, width, height } = event.nativeEvent.layout;

    iconLayouts.current[index] = {
      x,
      y,
      width,
      height,
    };

    if (index === activeIndex) {
      applyPill(index, false);
    }
  };

  /*
   * Navigate to the selected route.
   */
  const handlePress = (route: any) => {
    navigation.navigate(route.name, route.params);
  };

  /*
   * Long press event.
   */
  const handleLongPress = (route: any) => {
    navigation.emit({
      type: "tabLongPress",
      target: route.key,
    });
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          marginHorizontal: horizontalMargin,
          marginBottom: bottomInset + 10,
        },
      ]}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: glass.surface,
            borderColor: glass.border,

            ...(Platform.OS === "ios"
              ? {
                  shadowColor: glass.shadow,
                }
              : {}),
          },
        ]}
      >
{/*
          * iOS glass background
          */}
        {Platform.OS === "ios" ? (
          <BlurView
            pointerEvents="none"
            tint="light"
            intensity={55}
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: theme.BORDER_RADIUS.xxxxxxxxxxxl,
                overflow: "hidden",
              },
            ]}
          />
        ) : (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: theme.BORDER_RADIUS.xxxxxxxxxxxl,
              },
            ]}
          />
        )}

{/*
          * ACTIVE ICON CIRCLE
          *
          * This is now positioned using the actual
          * icon's layout instead of the entire tab.
          */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            {
              width: PILL_SIZE,
              height: PILL_SIZE,

              // eslint-disable-next-line react-hooks/refs
              transform: [
                {
                  translateX: pillX,
                },
                {
                  translateY: pillY,
                },
              ],

              backgroundColor: glass.activeSoft,
              borderColor: glass.border,
            },
          ]}
        />

        {routes.map((route: any, index: number) => {
          const focused = index === activeIndex;

          const descriptor = descriptors[route.key] ?? {};

          const options = descriptor.options ?? {};

          /*
           * Icon
           */
          const icon = options.tabBarIcon
            ? options.tabBarIcon({
                focused,
                color: focused ? glass.active : glass.textMuted,
                size: 22,
              })
            : null;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{
                selected: focused,
              }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
              onPress={() => handlePress(route)}
              onLongPress={() => handleLongPress(route)}
              onLayout={handleTabLayout(index)}
              android_ripple={{
                borderless: true,
              }}
              style={styles.tab}
            >
              {/*
               * ICON WRAPPER
               *
               * This is what we measure.
               * The active circle will be centered
               * exactly on this View.
               */}
              <View
                onLayout={handleIconLayout(index)}
                style={styles.iconContainer}
              >
                {icon}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "visible",
  },

  container: {
    position: "relative",

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",

    minHeight: 64,

    paddingVertical: 7,
    paddingHorizontal: 7,

    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxxxl,

    borderWidth: 1,

    shadowOffset: {
      width: 0,
      height: 10,
    },

    shadowRadius: 24,
    shadowOpacity: 1,

    ...(Platform.OS === "android"
      ? {
          elevation: 14,
        }
      : {}),

    overflow: "visible",
  },

  /*
   * Active circle.
   *
   * IMPORTANT:
   * left/top are 0 because pillX/pillY already
   * contain the complete position.
   */
  activePill: {
    position: "absolute",

    left: 0,
    top: 0,

    borderRadius: 999,

    borderWidth: 1,

    zIndex: 0,

    overflow: "hidden",
  },

  /*
   * Every tab has a predictable width.
   */
  tab: {
    flex: 1,

    minWidth: 64,

    paddingHorizontal: 8,
    paddingVertical: 6,

    alignItems: "center",
    justifyContent: "center",

    zIndex: 2,
  },

  /*
   * The icon gets its own layout box.
   *
   * The active circle is centered on THIS.
   */
  iconContainer: {
    width: 40,
    height: 40,

    alignItems: "center",
    justifyContent: "center",

    zIndex: 2,
  },
});
