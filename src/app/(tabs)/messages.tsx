import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { useRooms } from "@/hooks/useRooms";
import { router } from "expo-router";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import theme from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

export default function Messages() {
  const { rooms, loading } = useRooms();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.COLORS.bgLight }}>
      <View
        style={{
          flexDirection: "row",
          paddingVertical: theme.SPACING.md,
          paddingHorizontal: theme.LAYOUT.contentPadding,
          borderBottomWidth: theme.BORDER.width.xs,
          borderBottomColor: theme.COLORS.borderDivider,
          alignItems: "center",
          height: theme.SIZING.headerHeight,
          backgroundColor: theme.COLORS.bgLight,
        }}
      >
        <Text
          style={{
            fontSize: theme.TYPOGRAPHY.fontSize.xl7,
            fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
            color: theme.COLORS.textPrimary,
          }}
        >
          Messages
        </Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="search-outline" size={22} color={theme.COLORS.textPrimary} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.COLORS.primary} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1, paddingHorizontal: theme.LAYOUT.listPaddingHorizontal }}
          data={rooms}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: theme.SPACING.sm }} />}
          contentContainerStyle={{ paddingVertical: theme.SPACING.md }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: theme.SPACING.xxxxl }}>
              <Text style={{ color: theme.COLORS.textMuted }}>No conversations yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <PrivateMessageCard
              message={item.lastMessage}
              time={item.lastMessageTimestamp}
              sender={item.name}
              isRead={false}
              isSent={false}
              avatar={{ uri: item.avatarUrl ?? "" }}
              type={item.lastMessageType}
              duration="0:00"
              newMessages={item.unreadCount > 0}
              onPress={() =>
                router.push({
                  pathname: "/(chatRoom)/privateRoom",
                  params: {
                    conversationId: item.conversationId,
                    roomId: item.id,
                    receiverName: item.name,
                    receiverAvatar: item.avatarUrl,
                    receiverId: item.receiverId ?? "",
                  },
                })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
