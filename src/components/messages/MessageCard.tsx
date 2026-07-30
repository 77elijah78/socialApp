import { images } from "@/constants";
import { messagesCardProps } from "@/types";
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
import ImageViewer from "./ImageViewer";

export default function MessageCard({
  type,
  message,
  time,
  isSent,
  isRead,
  uri,
}: messagesCardProps) {
  const { width } = useWindowDimensions();
  const maxContentWidth = width * 0.72;
  const [viewerVisible, setViewerVisible] = useState(false);

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
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setViewerVisible(true)}
          >
            <View style={styles.imageWrapper}>
              <Image
                source={{ uri }}
                style={[
                  styles.thumbnail,
                  { maxWidth: maxContentWidth },
                ]}
                resizeMode="cover"
              />
              <View style={styles.zoomOverlay}>
                <Text style={styles.zoomIcon}>🔍</Text>
              </View>
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

      <ImageViewer
        visible={viewerVisible}
        uri={uri}
        onClose={() => setViewerVisible(false)}
      />
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
    height: 200,
  },
  zoomOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomIcon: {
    fontSize: 16,
    color: theme.COLORS.textWhite,
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
