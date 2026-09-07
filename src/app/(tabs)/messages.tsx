import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { useRooms } from "@/hooks/useRooms";
import { router } from "expo-router";
import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import theme from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { mediaService } from "@/services/MediaService";
import { useFocusEffect } from "expo-router";
import ActionMenu, { presentActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";
import { ConversationRowSkeleton, OfflineBanner } from "@/components/ui";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export default function Messages() {
  const { rooms, loading, error, reload, deleteRoom } = useRooms();
  const { isOffline } = useNetworkStatus();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const [searchQuery, setSearchQuery] = useState("");

  const handleRetry = useCallback(() => {
    reload();
  }, [reload]);

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

  const skeletonData = useMemo(() => Array.from({ length: 6 }), []);

  const renderSkeleton = useCallback((info: { item: any; index: number }) => (
    <ConversationRowSkeleton key={`skeleton-${info.index}`} testID="conversation-skeleton" />
  ), []);

  useFocusEffect(
    useCallback(() => {
      void reloadRef.current();
    }, [])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.COLORS.bgLight }}>
      <OfflineBanner isOffline={isOffline} onRetry={handleRetry} />

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

      {loading && rooms.length === 0 ? (
        <FlatList
          style={{ flex: 1, paddingHorizontal: theme.LAYOUT.listPaddingHorizontal }}
          data={skeletonData as any}
          keyExtractor={(_, i) => `skeleton-${i}`}
          ItemSeparatorComponent={() => <View style={{ height: theme.SPACING.sm }} />}
          contentContainerStyle={{ paddingVertical: theme.SPACING.md }}
          renderItem={renderSkeleton}
        />
      ) : error && rooms.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.LAYOUT.contentPadding }}>
          <Text style={{ color: theme.COLORS.textMuted, marginBottom: theme.SPACING.md }}>{error.message}</Text>
          <TouchableOpacity onPress={handleRetry} style={{ padding: theme.SPACING.md, backgroundColor: theme.COLORS.primaryGhost, borderRadius: theme.BORDER_RADIUS.full }}>
            <Text style={{ color: theme.COLORS.primary, fontWeight: theme.TYPOGRAPHY.fontWeight.semibold }}>Retry</Text>
          </TouchableOpacity>
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
