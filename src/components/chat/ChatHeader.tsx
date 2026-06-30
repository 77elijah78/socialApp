// components/chat/ChatHeader.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { icons } from "@/constants";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/constants/theme";

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
          style={[styles.backIcon, { tintColor: COLORS.primary }]}
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
          style={[styles.menuIcon, { tintColor: COLORS.textSecondary }]}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryGhostBorder,
    ...SHADOW.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    width: 20,
    height: 20,
  },
  avatarContainer: {
    marginLeft: SPACING.md,
    position: "relative",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.primaryGhostBorder,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.online,
    borderWidth: 2.5,
    borderColor: COLORS.bgWhite,
  },
  infoContainer: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  userName: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  statusText: {
    fontSize: 13,
    fontWeight: FONT.medium,
    color: COLORS.online,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: {
    width: 20,
    height: 20,
  },
});

export default React.memo(ChatHeader);
