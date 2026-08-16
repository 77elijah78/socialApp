import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { useRooms } from "@/hooks/useRooms";
import { router } from "expo-router";
import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import theme from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { mediaService } from "@/services/MediaService";
import { useFocusEffect } from "expo-router";
import { presentActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";

export default function Messages() {
  const { rooms, loading, reload, deleteRoom } = useRooms();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const [searchQuery, setSearchQuery] = useState("");

  const handleDeleteRoom = useCallback(async (roomId: string, receiverName: string) => {
    const actions: ActionMenuItem[] = [
      { key: 'cancel', icon: 'close-outline', label: 'Cancel', onPress: () => {} },
      { key: 'delete', icon: 'trash-outline', label: `Delete conversation with ${receiverName}`, destructive: true, onPress: async () => {
        try {
          await mediaService.message.deleteConversation(roomId);
          await deleteRoom(roomId);
        } catch (err) {
          presentActionMenu([{ key: 'err', icon: 'alert-circle', label: 'Could not delete conversation', onPress: () => {} }]);
        }
      }},
    ];
    presentActionMenu(actions);
  }, [deleteRoom]);

  const filteredRooms = rooms.filter((room) =>
    (room.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (room.lastMessage ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  useFocusEffect(
    useCallback(() => {
      void reloadRef.current();
    }, [])
  );

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
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={theme.COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Ionicons name="search" size={22} color={theme.COLORS.textMuted} style={styles.searchIcon} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.COLORS.primary} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1, paddingHorizontal: theme.LAYOUT.listPaddingHorizontal }}
          data={filteredRooms}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: theme.SPACING.sm }} />}
          contentContainerStyle={{ paddingVertical: theme.SPACING.md }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: theme.SPACING.xxxxl }}>
              <Text style={{ color: theme.COLORS.textMuted }}>
                {searchQuery ? "No conversations found" : "No conversations yet"}
              </Text>
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
              unreadCount={item.unreadCount}
              lastMessageStatus="DELIVERED"
              onLongPress={() => handleDeleteRoom(item.id, item.name)}
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

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    paddingHorizontal: theme.SPACING.md,
    marginHorizontal: theme.LAYOUT.contentPadding,
    marginTop: theme.SPACING.sm,
    marginBottom: theme.SPACING.sm,
    height: 44,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: theme.SPACING.sm,
  },
  searchIcon: {
    marginRight: theme.SPACING.md,
  },
});
