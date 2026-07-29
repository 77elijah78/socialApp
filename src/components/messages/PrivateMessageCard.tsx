import { icons } from "@/constants";
import { privateMessagesCardProps } from "@/types";
import theme from "@/constants/theme";
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
    backgroundColor: theme.COLORS.white,
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 15,
    height: theme.SIZING.privateMessageCard,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
  },
  avatar: {
    width: theme.SIZING.avatarXl,
    height: theme.SIZING.avatarXl,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxxl,
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
  time: { color: theme.COLORS.textTimeRead, position: "absolute", right: 10, bottom: 5 },
  senderName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    position: "absolute",
    bottom: 5,
  },
  messageRead: { color: theme.COLORS.textTimeRead, fontSize: theme.TYPOGRAPHY.fontSize.xl },
  lastImage: {
    width: theme.SIZING.iconXs,
    height: theme.SIZING.iconXs,
    borderRadius: theme.BORDER_RADIUS.xl,
    marginRight: 5,
    marginBottom: 5,
  },
  read: {
    width: theme.SIZING.iconXs,
    height: theme.SIZING.iconXs,
    position: "absolute",
    right: 5,
    top: 4,
  },
  messageNotRead: {
    color: theme.COLORS.textBlack,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
});