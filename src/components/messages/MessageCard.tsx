import { MessageCardProps } from "@/types";
import theme from "@/constants/theme";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  TouchableOpacity,
  Linking,
} from "react-native";
import { memo, useMemo, useRef } from "react";
import { Image } from "expo-image";
import VoiceMessageBubble from "./VoiceMessage";
import VideoPlayer from "./Videoplayer";
import SharedPostCard from "./SharedPostCard";
import SharedStoryCard from "./SharedStoryCard";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useOverlay, type ActionMenuItem } from "@/providers/OverlayProvider";

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
        <Ionicons
          name="checkmark-sharp"
          size={12}
          color="#2196F3"
          style={{ marginLeft: -6 }}
        />
      </View>
    );
  }

  if (status === "DELIVERED") {
    return (
      <View style={{ flexDirection: "row", marginLeft: 4 }}>
        <Ionicons name="checkmark-sharp" size={12} color="#9E9E9E" />
        <Ionicons
          name="checkmark-sharp"
          size={12}
          color="#9E9E9E"
          style={{ marginLeft: -6 }}
        />
      </View>
    );
  }

  if (status === "SENDING")
    return <Ionicons name="time-outline" size={12} color="#9E9E9E" />;
  if (status === "FAILED")
    return (
      <Ionicons
        name="alert-circle-outline"
        size={14}
        color={theme.COLORS.danger}
      />
    );
  return (
    <View style={{ flexDirection: "row", marginLeft: 4 }}>
      <Ionicons name="checkmark-sharp" size={12} color="#9E9E9E" />
    </View>
  );
}

function MessageCard({
  type,
  message,
  time,
  sender,
  isSent,
  status,
  uri,
  onLongPress,
  repliedTo,
  thumbnailUri,
  playbackId,
  duration,
  onRetry,
}: MessageCardProps) {
  const { width } = useWindowDimensions();
  const { openActionMenu } = useOverlay();
  const maxContentWidth = width * 0.7;
  const maxContentHeight = width * 0.55;
  const downloadButtonRef = useRef<View>(null);

  const safeTime = useMemo(() => {
    if (time == null) return null;
    const d = new Date(time);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [time]);

  const shared = useMemo(() => {
    if (type !== "SHARED_POST" && type !== "SHARED_STORY") return null;
    try {
      return JSON.parse(message ?? "{}") as Record<string, string | null>;
    } catch {
      return null;
    }
  }, [message, type]);

  const handleDownload = () => {
    const items: ActionMenuItem[] = [
      {
        key: "open",
        icon: "open-outline",
        label: "Open in browser",
        onPress: () => Linking.openURL(uri),
      },
      {
        key: "cancel",
        icon: "close-outline",
        label: "Cancel",
        onPress: () => {},
      },
    ];
    downloadButtonRef.current?.measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        openActionMenu(items, { x, y, width, height });
      },
    );
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
                    params: {
                      uri,
                      name:
                        sender || (isSent ? "Your photo" : "Received image"),
                    },
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
                    source={{ uri: thumbnailUri || uri }}
                    style={[styles.thumbnail, { height: maxContentHeight }]}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    recyclingKey={thumbnailUri || uri}
                    transition={0}
                    allowDownscaling
                  />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                ref={downloadButtonRef}
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
                playbackId={playbackId}
                width={maxContentWidth}
                uri={uri}
                thumbnail={thumbnailUri}
                borderRadius={theme.BORDER_RADIUS.lg}
              />
              <TouchableOpacity
                ref={downloadButtonRef}
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
              <VoiceMessageBubble
                playbackId={playbackId}
                audioUri={uri}
                duration={duration ?? 0}
                isOwn={isSent}
              />
              <TouchableOpacity
                ref={downloadButtonRef}
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

          {type === "document" && (
            <TouchableOpacity
              ref={downloadButtonRef}
              onPress={handleDownload}
              style={{ maxWidth: maxContentWidth, padding: theme.SPACING.md }}
            >
              <Text style={{ color: textColor }}>
                📄 {message || "Document · Tap to open"}
              </Text>
            </TouchableOpacity>
          )}
          {type === "SHARED_POST" &&
            (shared ? (
              <SharedPostCard
                content={shared.content ?? "Shared post"}
                authorName={shared.authorName ?? "User"}
                authorAvatarUrl={shared.authorAvatarUrl ?? null}
                imageUrl={shared.imageUrl ?? null}
                onPress={() => {
                  const id = shared.sharedPostId ?? shared.postId;
                  if (id) router.push(`/posts/${id}/comments`);
                }}
              />
            ) : (
              <Text style={{ color: textColor }}>Shared post</Text>
            ))}
          {type === "SHARED_STORY" &&
            (shared ? (
              <SharedStoryCard
                mediaUrl={shared.mediaUrl ?? ""}
                mediaType={shared.mediaType ?? "image"}
                caption={shared.caption ?? null}
                authorName={shared.authorName ?? "User"}
                authorAvatarUrl={shared.authorAvatarUrl ?? null}
                onPress={() => {
                  const id = shared.sharedStoryId ?? shared.storyId;
                  if (id)
                    router.push(
                      `/stories/viewer?storyId=${encodeURIComponent(id)}`,
                    );
                }}
              />
            ) : (
              <Text style={{ color: textColor }}>Shared story</Text>
            ))}

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
            {isSent && status === "FAILED" && (
              <TouchableOpacity
                onPress={onRetry}
                accessibilityLabel="Retry failed message"
                style={{ marginLeft: theme.SPACING.sm }}
              >
                <Text style={{ color: timeColor, fontWeight: "600" }}>
                  Retry
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default memo(MessageCard);

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
