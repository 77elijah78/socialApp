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
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/constants/theme";

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
          style={[styles.icon, { tintColor: COLORS.primary }]}
        />
      </TouchableOpacity>

      {/* Input field */}
      <View style={styles.inputWrapper}>
        <TouchableOpacity onPress={onEmoji} style={styles.emojiButton}>
          <Image source={icons.emoji} style={styles.emojiIcon} />
        </TouchableOpacity>
        <TextInput
          placeholder="Type a message..."
          placeholderTextColor={COLORS.textMuted}
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
              style={[styles.actionIcon, { tintColor: COLORS.textWhite }]}
            />
          </View>
        </Animated.View>
      ) : (
        <TouchableOpacity style={styles.actionButton} onPress={onSend}>
          <Image
            source={icons.send}
            style={[styles.actionIcon, { tintColor: COLORS.textWhite }]}
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.bgWhite,
    borderTopWidth: 1,
    borderTopColor: COLORS.primaryGhostBorder,
    gap: SPACING.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  icon: {
    width: 22,
    height: 22,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    minHeight: 40,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
  },
  emojiButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emojiIcon: {
    width: 22,
    height: 22,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginLeft: SPACING.xs,
    paddingVertical: 0,
    maxHeight: 100,
    lineHeight: 20,
  },
  micOuter: {
    width: 42,
    height: 42,
    marginBottom: 1,
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.primary,
  },
  actionIcon: {
    width: 20,
    height: 20,
  },
});

export default React.memo(ChatInput);
