// components/chat/ChatInput.tsx
import React from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from "react-native";
import { icons } from "@/constants";
import theme from "@/constants/theme";

interface ChatInputProps {
  inputText: string;
  showMic: boolean;
  micScaleAnim: Animated.Value;
  panHandlers: any;
  marginBottom: number;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onEmoji?: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  showMic,
  micScaleAnim,
  panHandlers,
  marginBottom,
  onChangeText,
  onSend,
  onAttach,
  onEmoji,
}) => {
  return (
    <View style={[styles.container, { marginBottom }]}>
      {/* Attach */}
      <TouchableOpacity onPress={onAttach} style={styles.iconButton}>
        <Image
          source={icons.add}
          style={[styles.icon, { tintColor: theme.COLORS.primary }]}
        />
      </TouchableOpacity>

      {/* Input field */}
      <View style={styles.inputWrapper}>
        <TouchableOpacity onPress={onEmoji} style={styles.emojiButton}>
          <Image source={icons.emoji} style={styles.emojiIcon} />
        </TouchableOpacity>
        <TextInput
          placeholder="Type a message..."
          placeholderTextColor={theme.COLORS.textMuted}
          style={styles.textInput}
          multiline
          numberOfLines={4}
          value={inputText}
          onChangeText={onChangeText}
        />
      </View>

      {/* Mic or Send */}
      {showMic ? (
        <Animated.View
          style={[styles.micOuter, { transform: [{ scale: micScaleAnim }] }]}
          {...panHandlers}
        >
          <View style={styles.actionButton}>
            <Image
              source={icons.mic}
              style={[styles.actionIcon, { tintColor: theme.COLORS.textWhite }]}
            />
          </View>
        </Animated.View>
      ) : (
        <TouchableOpacity style={styles.actionButton} onPress={onSend}>
          <Image
            source={icons.send}
            style={[styles.actionIcon, { tintColor: theme.COLORS.textWhite }]}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgWhite,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.primaryGhostBorder,
    gap: theme.SPACING.sm,
  },
  iconButton: {
    width: theme.SIZING.bottomBar,
    height: theme.SIZING.bottomBar,
    borderRadius: 20,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.xs,
  },
  icon: {
    width: 22,
    height: 22,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.COLORS.bgInput,
    borderRadius: theme.BORDER_RADIUS.xl,
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: 6,
    minHeight: theme.SIZING.bottomBar,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  emojiButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.xs,
  },
  emojiIcon: {
    width: 22,
    height: 22,
  },
  textInput: {
    flex: 1,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    color: theme.COLORS.textPrimary,
    marginLeft: theme.SPACING.xs,
    paddingVertical: 0,
    maxHeight: 100,
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
  micOuter: {
    width: theme.SIZING.iconXl,
    height: theme.SIZING.iconXl,
    marginBottom: 1,
  },
  actionButton: {
    width: theme.SIZING.iconXl,
    height: theme.SIZING.iconXl,
    borderRadius: 21,
    backgroundColor: theme.COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...theme.SHADOWS.primary,
  },
  actionIcon: {
    width: theme.SIZING.iconXs,
    height: theme.SIZING.iconXs,
  },
});

export default React.memo(ChatInput);
