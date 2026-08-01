import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { useRooms } from "@/hooks/useRooms";
import { api } from "@/services/api";
import { router } from "expo-router";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import theme from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useAppSelector } from "@/store/hooks";

export default function Messages() {
  const { rooms, loading } = useRooms();
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);

  const handleMessageYourself = async () => {
    if (!token || !currentUserId) return;

    try {
      const profileResp = await api.get<{
        success: boolean;
        data: {
          id: string;
          username: string;
          displayName: string | null;
          avatarUrl: string | null;
        };
      }>("/users/bob", token);

      const bob = profileResp.data;

      const response = await api.post<{
        success: boolean;
        data: {
          id: string;
          participants: {
            user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
          }[];
        };
      }>("/messages/conversations", { userId: bob.id }, token);

      const conversation = response.data;

      router.push({
        pathname: "/(chatRoom)/privateRoom",
        params: {
          conversationId: conversation.id,
          roomId: conversation.id,
          receiverName: bob.displayName || bob.username || "bob",
          receiverAvatar: bob.avatarUrl || "",
          receiverId: bob.id,
        },
      });
    } catch (err: any) {
      console.log("Failed to start conversation:", err);
    }
  };

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
        <Pressable onPress={handleMessageYourself} style={{ marginRight: theme.SPACING.md }}>
          <Ionicons name="person-add-outline" size={22} color={theme.COLORS.textPrimary} />
        </Pressable>
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
              <Pressable onPress={handleMessageYourself} style={{ marginTop: theme.SPACING.md }}>
              <Text style={{ color: theme.COLORS.primary, fontWeight: theme.TYPOGRAPHY.fontWeight.semibold }}>
                Start a chat
              </Text>
              </Pressable>
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
