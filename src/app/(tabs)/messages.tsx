import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { icons } from "@/constants";
import { router } from "expo-router";
import { View, Text, Image, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";



const messages = [
  {
    id: "1",
    avatar:
      "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    name: "John Doe",
    time: "11:15",
    Message: "Hi there!",
    type: "Image",
  },
  {
    id: "2",
    avatar:
      "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
    name: "Jane Smith",
    time: "11:12",
    Message: "Hey, how are you?",
    type: "Voice",
  },
];

export default function Messages() {
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
  data={messages}
  keyExtractor={(item) => item.id}              // ✅ add this
  ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
  renderItem={({ item }) => (                   // ✅ destructure properly
    <PrivateMessageCard
      message={item.Message}
      time={item.time}
      sender={item.name}
      isRead={false}
      isSent={true}
      avatar={{ uri: item.avatar }}
      type={item.type}
      duaration="0:20"
      newMessages={false}
      onPress={() =>
        router.push({
          pathname: "/(chatRoom)/privateRoom",
          params: {
            receiverId: item.name,
            roomId:     item.id,
          },
        })
      }
    />
  )}
/>
    </SafeAreaView>
  );
}
