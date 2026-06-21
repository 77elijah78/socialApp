import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { icons } from "@/constants";
import { useRooms } from "@/hooks/useRooms";
import { router } from "expo-router";
import { View, Text, Image, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Messages() {
  const { rooms } = useRooms();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View>
        <View
          style={{
            flexDirection: "row",
            paddingVertical: 10,
            paddingHorizontal: 15,
            borderBottomWidth: 1,
            borderBottomColor: "#e0e0e0",
            alignItems: "center",
            height: 60,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <Image source={icons.leftArrow} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "bold",
              color: "#6366f1",
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
        style={{ flex: 1, marginTop: 20, paddingHorizontal: 15 }}
        data={rooms}
        keyExtractor={(item) => item.id} // ✅ add this
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={(
          { item }, // ✅ destructure properly
        ) => (
          <PrivateMessageCard
            message={item.lastMessage}
            time={item.lastMessageTimestamp}
            sender={item.name}
            isRead={false}
            isSent={true}
            avatar={{ uri: item.avatarUrl }}
            type={item.lastMessageType}
            duaration="0:20"
            newMessages={false}
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
