import { MessageCardProps } from "@/types";
import theme from "@/constants/theme";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Image,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useState, useMemo } from "react";
import VoiceMessageBubble from "./VoiceMessage";
import VideoPlayer from "./Videoplayer";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { presentActionMenu, ActionMenuItem } from "@/components/ui/ActionMenu";

function StatusCheckmarks({
  status,
  isSent,
}: {
  status: string;
  isSent: boolean;
}) {
  if (!isSent) return null;

  if (status === "READ") {
    return (
      <View style={{ flexDirection: "row", marginLeft: 4 }}>
        <Ionicons name="checkmark-sharp" size={12} color="#2196F3" />
        <Ionicons name="checkmark-sharp" size={12} color="#2196F3" style={{ marginLeft: -6 }} />
      </View>
    );
  }

  if (status === "DELIVERED") {
    return (
      <View style={{ flexDirection: "row", marginLeft: 4 }}>
        <Ionicons name="checkmark-sharp" size={12} color="#9E9E9E" />
        <Ionicons name="checkmark-sharp" size={12} color="#9E9E9E" style={{ marginLeft: -6 }} />
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", marginLeft: 4 }}>
      <Ionicons name="checkmark-sharp" size={12} color="#9E9E9E" />
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
  onLongPress,
  repliedTo,
}: MessageCardProps) {
  const { width } = useWindowDimensions();
  const maxContentWidth = width * 0.7;
  const maxContentHeight = width * 0.55;
  const [aspectRatio, setAspectRatio] = useState(1);

  const safeTime = useMemo(() => {
    if (time == null) return null;
    const d = new Date(time);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [time]);

  const handleDownload = () => {
    const items: ActionMenuItem[] = [
      { key: 'open', icon: 'open-outline', label: 'Open in browser', onPress: () => Linking.openURL(uri) },
      { key: 'cancel', icon: 'close-outline', label: 'Cancel', onPress: () => {} },
    ];
    presentActionMenu(items);
  };

  const sentBubble = {
    backgroundColor: theme.COLORS.primary,
    borderBottomRightRadius: theme.BORDER_RADIUS.sm,
    borderBottomLeftRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
    borderTopLeftRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
    borderTopRightRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
  };

  const receivedBubble = {
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomLeftRadius: theme.BORDER_RADIUS.sm,
    borderBottomRightRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
    borderTopLeftRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
    borderTopRightRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
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
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={onLongPress}
        delayLongPress={200}
      >
        <View
          style={[
            styles.bubble,
            isSent ? sentBubble : receivedBubble,
            type === "text" && styles.textBubblePadding,
          ]}
        >
          {repliedTo && (
            <View style={styles.repliedPreview}>
              <Text style={styles.repliedName}>
                {repliedTo.sender?.username ?? "Message"}
              </Text>
              <Text style={styles.repliedText} numberOfLines={1}>
                {repliedTo.content ?? "Media"}
              </Text>
            </View>
          )}

          {type === "text" && (
            <Text style={[styles.text, { color: textColor }]}>{message}</Text>
          )}

          {type === "image/jpeg" && (
            <View>
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
                        e.nativeEvent.source.width /
                          e.nativeEvent.source.height,
                      )
                    }
                  />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={handleDownload}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={theme.COLORS.textWhite}
                />
              </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.downloadButtonOverlay}
                onPress={handleDownload}
              >
                <Ionicons
                  name="download-outline"
                  size={22}
                  color={theme.COLORS.textWhite}
                />
              </TouchableOpacity>
            </View>
          )}

          {type === "audio/mpeg" && (
            <View style={[styles.mediaWrapper, { maxWidth: maxContentWidth }]}>
              <VoiceMessageBubble audioUri={uri} duration={30} isOwn={isSent} />
              <TouchableOpacity
                style={styles.downloadButtonOverlay}
                onPress={handleDownload}
              >
                <Ionicons
                  name="download-outline"
                  size={22}
                  color={theme.COLORS.textWhite}
                />
              </TouchableOpacity>
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
            {safeTime ? (
              <Text style={[styles.time, { color: timeColor }]}>
                {safeTime.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            ) : (
              <Text style={[styles.time, { color: timeColor }]} />
            )}
            <StatusCheckmarks status={status} isSent={isSent} />
          </View>
        </View>
      </TouchableOpacity>
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
    position: "relative",
  },
  time: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: theme.SPACING.xs,
    marginHorizontal: theme.SPACING.sm,
  },
  repliedPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.sm,
    paddingLeft: theme.SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.COLORS.primaryGhostBorder,
  },
  repliedName: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
    marginRight: theme.SPACING.sm,
  },
  repliedText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textMuted,
    flex: 1,
  },
  downloadButton: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: theme.BORDER_RADIUS.full,
    padding: 6,
  },
  downloadButtonOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: theme.BORDER_RADIUS.full,
    padding: 8,
  },
});
