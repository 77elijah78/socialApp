import { images } from "@/constants";
import { messagesCardProps } from "@/types";
import theme from "@/constants/theme";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Image,
} from "react-native";
import VoiceMessageBubble from "./VoiceMessage";
import VideoPlayer from "./Videoplayer";

export default function MessageCard({
  type,
  message,
  time,
  isSent,
  isRead,
  uri,
}: messagesCardProps) {
  const { width, height } = useWindowDimensions();
  return (
    <View
      style={
        isSent
          ? styles.container
          : [styles.container, { alignItems: "flex-end" }]
      }
    >
      {type === "text" && (
        <View style={styles.contentContainer}>
          <Text>{message}</Text>
        </View>
      )}
      {type === "image/jpeg" && (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: uri }}
            style={{
              flex: 1,
              width: "100%",
              minHeight: theme.SIZING.messageMaxImage,
              maxHeight: theme.SIZING.messageMaxImage,
              borderTopLeftRadius: theme.BORDER_RADIUS.xxxxl,
              borderTopRightRadius: theme.BORDER_RADIUS.xxxxl,
            }}
          />
          <Text style={{ padding: 10 }}>{message}</Text>
        </View>
      )}
      {type === "video/mp4" && (
        <View>
          <VideoPlayer style={{}} uri={uri} thumbnail="" borderRadius={theme.BORDER_RADIUS.xxl} />
        </View>
      )}
      {type === "audio/mpeg" && (
        <View>
          <VoiceMessageBubble audioUri={uri} duration={30} isOwn={isSent} />
        </View>
      )}
      <Text
        style={{
          fontSize: theme.TYPOGRAPHY.fontSize.xl,
          color: theme.COLORS.textGray,
          alignSelf: isSent ? "flex-start" : "flex-end",
          marginHorizontal: 10,
        }}
      >
        {new Date(time).toLocaleTimeString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: theme.COLORS.transparent,
    width: "100%",
    marginVertical: 15,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  contentContainer: {
    flexGrow: 1,
    backgroundColor: theme.COLORS.bubbleBg,
    width: theme.SIZING.contentWidth,
    borderRadius: theme.BORDER_RADIUS.xl,
    padding: 10,
    justifyContent: "center",
    marginTop: 10,
    alignItems: "flex-start",
  },
  imageContainer: {
    flex: 1,
    flexGrow: 1,
    alignItems: "flex-start",
    backgroundColor: theme.COLORS.bubbleBg,
    width: theme.SIZING.messageWidth,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    justifyContent: "flex-start",
  },
});