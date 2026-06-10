import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";


export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#f5f5f5",
          borderTopColor: "#f5f5f5",
        },
        tabBarInactiveBackgroundColor: "#f5f5f5",
        tabBarActiveBackgroundColor: "#f5f5f5",
        headerStyle: { backgroundColor: "#f5f5f5",
          elevation: 10,
         },
        headerTintColor: "#4F46E5",
        tabBarActiveTintColor: "#4F46E5",
      }}
    >
      <Tabs.Screen
        name="index"
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
