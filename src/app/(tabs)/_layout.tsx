import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";


export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: theme.COLORS.bgLight,
          borderTopColor: theme.COLORS.bgLight,
        },
        tabBarInactiveBackgroundColor: theme.COLORS.bgLight,
        tabBarActiveBackgroundColor: theme.COLORS.bgLight,
        headerStyle: { backgroundColor: theme.COLORS.bgLight,
          ...theme.SHADOWS.xl,
         },
        headerTintColor: theme.COLORS.indigo,
        tabBarActiveTintColor: theme.COLORS.indigo,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          headerShown: false,
          title: "Feed",
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          headerShown: false,
          title: "Explore",
          tabBarIcon: ({ color }) => (
            <Ionicons name="search" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          headerShown: false,
          title: "Messages",
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbox-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          headerShown: false,
          title: "Notifications",
          tabBarIcon: ({ color }) => (
            <Ionicons name="notifications" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
