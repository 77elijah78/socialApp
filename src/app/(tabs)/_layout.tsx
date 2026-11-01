import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { LiquidGlassTabBar } from "@/components/navigation/LiquidGlassTabBar";
import * as theme from "@/constants/theme";
import { useAppSelector } from "@/store/hooks";

export default function TabLayout() {
  const unread = useAppSelector(state => state.notifications.accountId === state.auth.user?.id
    ? state.notifications.unreadCount : 0);

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.COLORS.bgLight,
          ...theme.SHADOWS.xl,
        },
        headerTintColor: theme.COLORS.primary,
        tabBarActiveTintColor: theme.COLORS.primary,
        tabBarInactiveTintColor: theme.COLORS.textMuted,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          headerShown: false,
          title: "Home",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          headerShown: false,
          title: "Explore",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          headerShown: false,
          title: "Messages",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? "chatbubble" : "chatbubble-outline"}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          headerShown: false,
          title: "Activity",
          tabBarBadge: unread > 99 ? "99+" : unread || undefined,
          tabBarAccessibilityLabel: unread ? `Activity, ${unread} unread` : "Activity",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? "heart" : "heart-outline"}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          title: "Profile",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={21}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
