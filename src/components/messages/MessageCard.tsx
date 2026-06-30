import { images } from "@/constants";
import { messagesCardProps } from "@/types";
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
      {type === "Text" && (
        <View style={styles.contentContainer}>
          <Text>{message}</Text>
        </View>
      )}
      {type === "Image" && (
        <View style={styles.imageContainer}>
          <Image
            source={images.signUpImage}
            style={{
              flex: 1,
              width: "100%",
              minHeight: 250,
              maxHeight: 250,
              borderTopLeftRadius: 15,
              borderTopRightRadius: 15,
            }}
          />
          <Text style={{ padding: 10 }}>{message}</Text>
        </View>
      )}
      {type === "Video" && (
        <View>
          <VideoPlayer
            style={{}}
            uri="https://dl.biamusic.ir/Video/Artist/Ragheb/Ragheb%20-%20Dena%20-%20480%20[BiaMusic].mp4"
            thumbnail=""
            borderRadius={12}
          />
        </View>
      )}
      {type === "Voice" && (
        <View>
          <VoiceMessageBubble
            audioUri={
              "Audio recorded at: file:///data/user/0/com.elijah77.social/cache/Audio/recording-b6b914e5-781d-42b5-a874-e7bd3b63de9a.m4a"
            }
            duration={30}
            isOwn={isSent}
          />
        </View>
      )}
      <Text
        style={{
          fontSize: 14,
          color: "#646464",
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
    backgroundColor: "transparent",
    width: "100%",
    marginVertical: 15,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  contentContainer: {
    flexGrow: 1,
    backgroundColor: "#f0ecf9",
    width: "70%",
    borderRadius: 10,
    padding: 10,
    justifyContent: "center",
    marginTop: 10,
    alignItems: "flex-start",
  },
  imageContainer: {
    flex: 1,
    flexGrow: 1,
    alignItems: "flex-start",
    backgroundColor: "#f0ecf9",
    width: "80%",
    borderRadius: 15,
    justifyContent: "flex-start",
  },
});
