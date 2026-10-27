import React, { useRef } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";

interface ChatHeaderProps {
  receiverName: string;
  avatarUri: string;
  isOnline?: boolean;
  isTyping?: boolean;
  onBack: () => void;
  onProfilePress?: () => void;
  onMenuPress?: (anchor?: { x: number; y: number; width: number; height: number }) => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  receiverName,
  avatarUri,
  isOnline = false,
  isTyping = false,
  onBack,
  onProfilePress,
  onMenuPress,
}) => {
  const menuButtonRef = useRef<View>(null);
  const initial = receiverName?.trim().charAt(0).toUpperCase() || "?";

  const handleMenuPress = () => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      onMenuPress?.({ x, y, width, height });
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Go back to messages"
        onPress={onBack}
        style={styles.iconButton}
        activeOpacity={0.75}
      >
        <Ionicons name="chevron-back" size={23} color={theme.COLORS.textPrimary} />
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole={onProfilePress ? "button" : undefined}
        onPress={onProfilePress}
        disabled={!onProfilePress}
        style={styles.avatarWrap}
        activeOpacity={0.78}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        {isOnline ? <View style={styles.onlineDot} /> : null}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole={onProfilePress ? "button" : undefined}
        onPress={onProfilePress}
        disabled={!onProfilePress}
        style={styles.infoContainer}
        activeOpacity={0.78}
      >
        <Text style={styles.userName} numberOfLines={1}>{receiverName || "Conversation"}</Text>
        <View style={styles.statusRow}>
          {isTyping ? <View style={styles.typingDot} /> : null}
          {isOnline && !isTyping ? <View style={styles.onlineStatusDot} /> : null}
          <Text
            style={[
              styles.statusText,
              (isOnline || isTyping) && styles.activeStatusText,
              isTyping && styles.typingText,
            ]}
          >
            {isTyping ? "Typing…" : isOnline ? "Active now" : "Direct message"}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        ref={menuButtonRef}
        accessibilityRole="button"
        accessibilityLabel="Conversation options"
        onPress={handleMenuPress}
        style={styles.iconButton}
        activeOpacity={0.75}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={theme.COLORS.textPrimary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: "#ECEAF4",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F5FA",
    borderWidth: 1,
    borderColor: "#EFEDF5",
  },
  avatarWrap: {
    width: 48,
    height: 48,
    marginLeft: theme.SPACING.md,
    borderRadius: 17,
    padding: 2,
    backgroundColor: "#E9E5FA",
    position: "relative",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 15,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEEAFE",
  },
  avatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  onlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: theme.COLORS.bgWhite,
    backgroundColor: theme.COLORS.online,
  },
  infoContainer: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: theme.SPACING.md,
  },
  userName: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  activeStatusText: {
    color: theme.COLORS.online,
  },
  typingText: {
    color: theme.COLORS.primary,
  },
  onlineStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.COLORS.online,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.COLORS.primary,
  },
});

export default React.memo(ChatHeader);
