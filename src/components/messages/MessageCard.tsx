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
  const { width } = useWindowDimensions();
  const maxContentWidth = width * 0.85;

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

  const textColor = isSent
    ? theme.COLORS.textWhite
    : theme.COLORS.textPrimary;

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
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri }}
              style={[
                styles.image,
                { maxWidth: maxContentWidth },
              ]}
              resizeMode="contain"
            />
            {!!message && (
              <Text style={[styles.caption, { color: textColor }]}>
                {message}
              </Text>
            )}
          </View>
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
            <VoiceMessageBubble
              audioUri={uri}
              duration={30}
              isOwn={isSent}
            />
          </View>
        )}

        <Text
          style={[
            styles.time,
            { color: timeColor, alignSelf: isSent ? "flex-end" : "flex-start" },
          ]}
        >
          {new Date(time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
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
  },
  image: {
    width: "100%",
    height: theme.SIZING.messageMaxImage,
  },
  caption: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
    padding: theme.SPACING.md,
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