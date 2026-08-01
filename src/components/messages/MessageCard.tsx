import { MessageCardProps } from "@/types";
import theme from "@/constants/theme";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Image,
  TouchableOpacity,
} from "react-native";
import { useState } from "react";
import VoiceMessageBubble from "./VoiceMessage";
import VideoPlayer from "./Videoplayer";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

function StatusCheckmarks({
  status,
  isSent,
}: {
  status: string;
  isSent: boolean;
}) {
  if (!isSent) return null;

  const color =
    status === "READ" ? theme.COLORS.textTimeRead : theme.COLORS.textTimeRead;

  const marks = status === "READ" || status === "DELIVERED" ? 2 : 1;

  return (
    <View style={{ flexDirection: "row", marginLeft: 4 }}>
      {Array.from({ length: marks }).map((_, i) => (
        <Ionicons key={i} name="checkmark-sharp" size={12} color={color} />
      ))}
    </View>
  );
}

export default function MessageCard({
  type,
  message,
  time,
  isSent,
  isRead,
  status,
  uri,
}: MessageCardProps) {
  const { width } = useWindowDimensions();
  const maxContentWidth = width * 0.7;
  const maxContentHeight = width * 0.55;
  const [aspectRatio, setAspectRatio] = useState(1);

  const sentBubble = {
    backgroundColor: theme.COLORS.primary,
    borderBottomRightRadius: theme.BORDER_RADIUS.sm,
    borderBottomLeftRadius: theme.BORDER_RADIUS.xxxl,
    borderTopLeftRadius: theme.BORDER_RADIUS.xxxl,
    borderTopRightRadius: theme.BORDER_RADIUS.xxxl,
  };

  const receivedBubble = {
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomLeftRadius: theme.BORDER_RADIUS.sm,
    borderBottomRightRadius: theme.BORDER_RADIUS.xxxl,
    borderTopLeftRadius: theme.BORDER_RADIUS.xxxl,
    borderTopRightRadius: theme.BORDER_RADIUS.xxxl,
  };

  const textColor = isSent ? theme.COLORS.textWhite : theme.COLORS.textPrimary;

  const timeColor = isSent
    ? theme.COLORS.voiceIndicator
    : theme.COLORS.textTimeRead;

  return (
    <View
      style={[
        styles.container,
        isSent ? styles.sentContainer : styles.receivedContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isSent ? sentBubble : receivedBubble,
          type === "text" && styles.textBubblePadding,
        ]}
      >
        {type === "text" && (
          <Text style={[styles.text, { color: textColor }]}>{message}</Text>
        )}

        {type === "image/jpeg" && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() =>
              router.push({
                pathname: "/(chatRoom)/imageViewer",
                params: { uri },
              })
            }
          >
            <View
              style={[
                styles.imageWrapper,
                {
                  width: maxContentWidth,
                  alignSelf: isSent ? "flex-end" : "flex-start",
                },
              ]}
            >
              <Image
                source={{ uri }}
                style={[styles.thumbnail, { aspectRatio }]}
                resizeMode="contain"
                onLoad={(e) =>
                  setAspectRatio(
                    e.nativeEvent.source.width / e.nativeEvent.source.height,
                  )
                }
              />
            </View>
          </TouchableOpacity>
        )}

        {type === "video/mp4" && (
          <View style={[styles.mediaWrapper, { maxWidth: maxContentWidth }]}>
            <VideoPlayer
              style={{}}
              uri={uri}
              thumbnail=""
              borderRadius={theme.BORDER_RADIUS.lg}
            />
          </View>
        )}

        {type === "audio/mpeg" && (
          <View style={[styles.mediaWrapper, { maxWidth: maxContentWidth }]}>
            <VoiceMessageBubble audioUri={uri} duration={30} isOwn={isSent} />
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: isSent ? "flex-end" : "flex-start",
            marginTop: theme.SPACING.xs,
          }}
        >
          <Text style={[styles.time, { color: timeColor }]}>
            {new Date(time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <StatusCheckmarks status={status} isSent={isSent} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginVertical: theme.SPACING.xs,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },
  sentContainer: {
    alignItems: "flex-end",
  },
  receivedContainer: {
    alignItems: "flex-start",
  },
  bubble: {
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    maxWidth: "100%",
    ...theme.SHADOWS.sm,
  },
  textBubblePadding: {
    paddingVertical: theme.SPACING.sm,
  },
  text: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
  },
  imageWrapper: {
    borderRadius: theme.BORDER_RADIUS.xxxl,
    overflow: "hidden",
    backgroundColor: theme.COLORS.bgImageWrapper,
    position: "relative",
  },
  thumbnail: {
    width: "100%",
  },
  caption: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
    padding: theme.SPACING.md,
    color: theme.COLORS.textWhite,
  },
  mediaWrapper: {
    borderRadius: theme.BORDER_RADIUS.xxxl,
    overflow: "hidden",
  },
  time: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: theme.SPACING.xs,
    marginHorizontal: theme.SPACING.sm,
  },
});
