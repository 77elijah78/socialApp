import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { icons } from "@/constants";
import { useRooms } from "@/hooks/useRooms";
import { router } from "expo-router";
import { useEffect } from "react";
import { View, Text, Image, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import theme from "@/constants/theme";

export default function Messages() {
  const { rooms, addRoom } = useRooms();

  const room = {
    id: "123",
    name: "reza",
    conversationId: "123",
    avatarUrl: "reza",
    lastMessage: "Hi",
    lastMessageType: "Image",
    lastMessageTimestamp: Date.now(),
    unreadCount: 2,
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View>
        <View
          style={{
            flexDirection: "row",
            paddingVertical: 10,
            paddingHorizontal: theme.LAYOUT.contentPadding,
            borderBottomWidth: theme.BORDER.width.xs,
            borderBottomColor: theme.COLORS.borderDivider,
            alignItems: "center",
            height: theme.SIZING.headerHeight,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <Image source={icons.leftArrow} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: theme.TYPOGRAPHY.fontSize.xl6,
              fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
              color: theme.COLORS.primary,
              position: "absolute",
              left: 70,
            }}
          >
            Messages
          </Text>
          <TouchableOpacity style={{ position: "absolute", right: 60 }}>
            <Image source={icons.search} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ position: "absolute", right: 10, width: 30, height: 30 }}
          >
            <Image source={icons.dots} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        style={{ flex: 1, marginTop: theme.SPACING.xxl, paddingHorizontal: theme.LAYOUT.listPaddingHorizontal }}
        data={rooms}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={(
          { item },
        ) => (
          <PrivateMessageCard
            message={item.lastMessage}
            time={item.lastMessageTimestamp}
            sender={item.name}
            isRead={false}
            isSent={true}
            avatar={{ uri: item.avatarUrl }}
            type={item.lastMessageType}
            duration="0:20"
            newMessages={true}
            onPress={() =>
              router.push({
                pathname: "/(chatRoom)/privateRoom",
                params: {
                  conversationId: item.conversationId,
                  receiverName: item.name,
                  roomId: item.id,
                },
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}
