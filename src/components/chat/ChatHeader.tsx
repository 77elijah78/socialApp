// components/chat/ChatHeader.tsx
/* eslint-disable import/no-named-as-default-member */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { icons } from "@/constants";
import theme from "@/constants/theme";

interface ChatHeaderProps {
  receiverName: string;
  avatarUri: string;
  isOnline?: boolean;
  onBack: () => void;
  onProfilePress?: () => void;
  onMenuPress?: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  receiverName,
  avatarUri,
  isOnline = true,
  onBack,
  onProfilePress,
  onMenuPress,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Image
          source={icons.leftArrow}
          style={[styles.backIcon, { tintColor: theme.COLORS.primary }]}
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={onProfilePress} style={styles.avatarContainer}>
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
        {isOnline && <View style={styles.onlineDot} />}
      </TouchableOpacity>

      <TouchableOpacity onPress={onProfilePress} style={styles.infoContainer}>
        <Text style={styles.userName} numberOfLines={1}>
          {receiverName}
        </Text>
        <Text style={styles.statusText}>
          {isOnline ? "Online" : "Last seen recently"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onMenuPress} style={styles.menuButton}>
        <Image
          source={icons.dots}
          style={[styles.menuIcon, { tintColor: theme.COLORS.textSecondary }]}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.primaryGhostBorder,
    ...theme.SHADOWS.sm,
  },
  backButton: {
    width: theme.SIZING.buttonHeight,
    height: theme.SIZING.buttonHeight,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    width: theme.SIZING.iconXs,
    height: theme.SIZING.iconXs,
  },
  avatarContainer: {
    marginLeft: theme.SPACING.md,
    position: "relative",
  },
  avatar: {
    width: theme.SIZING.avatarSm,
    height: theme.SIZING.avatarSm,
    borderRadius: theme.SIZING.avatarSm / 2,
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: theme.SIZING.dot,
    height: theme.SIZING.dot,
    borderRadius: theme.SIZING.dot / 2,
    backgroundColor: theme.COLORS.online,
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.bgWhite,
  },
  infoContainer: {
    flex: 1,
    marginLeft: theme.SPACING.md,
  },
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    marginBottom: theme.SPACING.xs,
  },
  statusText: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: theme.COLORS.online,
  },
  menuButton: {
    width: theme.SIZING.buttonHeight,
    height: theme.SIZING.buttonHeight,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: {
    width: theme.SIZING.iconXs,
    height: theme.SIZING.iconXs,
  },
});

export default React.memo(ChatHeader);
