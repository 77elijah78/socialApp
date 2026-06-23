import { icons } from "@/constants";
import { privateMessagesCardProps } from "@/types";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";

export default function PrivateMessageCard({
  message,
  sender,
  avatar,
  time,
  onPress,
  isRead,
  isSent,
  isBookmarked,
  onBookmarkPress,
  type,
  duaration,
  newMessages,
}: privateMessagesCardProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Image source={avatar} style={styles.avatar} />
      <View style={styles.content}>
        <View style={styles.sender}>
          <Text style={styles.senderName}>{sender}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        {type === "image" && (
          <View style={{ flexDirection: "row", position: "absolute", top: 5 }}>
            <Image source={icons.image} style={styles.lastImage} />
            <Text
              style={newMessages ? styles.messageNotRead : styles.messageRead}
            >
              sent a photo
            </Text>
          </View>
        )}
        {type === "text" && (
          <Text
            style={newMessages ? styles.messageNotRead : styles.messageRead}
          >
            {message}
          </Text>
        )}
        {type === "video" && (
          <View style={{ flexDirection: "row", position: "absolute", top: 5 }}>
            <Image source={icons.video} style={styles.lastImage} />
            <Text
              style={newMessages ? styles.messageNotRead : styles.messageRead}
            >
              sent a video
            </Text>
          </View>
        )}
        {type === "voice" && (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              position: "absolute",
              top: 5,
            }}
          >
            <Image source={icons.mic} style={styles.lastImage} />
            <Text
              style={newMessages ? styles.messageNotRead : styles.messageRead}
            >
              Voice message {duaration}
            </Text>
          </View>
        )}
        {isRead && <Image source={icons.read} style={styles.read} />}
        {isSent && <Image source={icons.done} style={styles.read} />}
        {newMessages && <Image source={icons.newdot} style={styles.read} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 15,
    height: 90,
    borderRadius: 15,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 10,
  },
  content: {
    flexDirection: "column",
    flex: 1,
    justifyContent: "center",
    position: "relative",
  },
  sender: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: { color: "#bdbdbd", position: "absolute", right: 10, bottom: 5 },
  senderName: {
    fontSize: 16,
    fontWeight: "bold",
    position: "absolute",
    bottom: 5,
  },
  messageRead: { color: "#bdbdbd", fontSize: 14 },
  lastImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 5,
    marginBottom: 5,
  },
  read: {
    width: 20,
    height: 20,
    position: "absolute",
    right: 5,
    top: 4,
  },
  messageNotRead: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "bold",
  },
});
