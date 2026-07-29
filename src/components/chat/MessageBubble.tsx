// components/chat/MessageBubble.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import theme from "@/constants/theme";

interface MessageBubbleProps {
  message: string;
  time: string | number;
  isSent: boolean;
  isRead?: boolean;
  type?: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  time,
  isSent,
  isRead = false,
  type,
}) => {
  const formatTime = (t: string | number): string => {
    if (!t) return "";
    const date = new Date(t);
    if (isNaN(date.getTime())) return String(t);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <View
      style={[
        styles.wrapper,
        isSent ? styles.wrapperSent : styles.wrapperReceived,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isSent ? styles.bubbleSent : styles.bubbleReceived,
        ]}
      >
        {type === "Voice" && (
          <View style={styles.voiceIndicator}>
            <Text style={styles.voiceIcon}>🎤</Text>
            <View style={styles.voiceWaves}>
              {[0.4, 0.7, 1, 0.6, 0.8, 0.5, 0.9, 0.3, 0.7, 0.5].map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.miniBar,
                    {
                      height: h * 16,
                      backgroundColor: isSent
                        ? theme.COLORS.voiceIndicator
                        : theme.COLORS.primaryLight,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        )}

        <Text
          style={[
            styles.messageText,
            isSent ? styles.textSent : styles.textReceived,
          ]}
        >
          {message}
        </Text>

        <View style={styles.metaRow}>
          <Text
            style={[
              styles.timeText,
              isSent ? styles.timeSent : styles.timeReceived,
            ]}
          >
            {formatTime(time)}
          </Text>
          {isSent && (
            <Text style={styles.checkMark}>{isRead ? "✓✓" : "✓"}</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
  },
  wrapperSent: {
    alignItems: "flex-end",
  },
  wrapperReceived: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xl,
  },
  bubbleSent: {
    backgroundColor: theme.COLORS.primary,
    borderBottomRightRadius: theme.SPACING.xs,
    ...theme.SHADOWS.primary,
  },
  bubbleReceived: {
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomLeftRadius: theme.SPACING.xs,
    ...theme.SHADOWS.sm,
  },
  voiceIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.xs,
    gap: theme.SPACING.sm,
  },
  voiceIcon: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
  },
  voiceWaves: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
  },
  miniBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  messageText: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.regular,
  },
  textSent: {
    color: theme.COLORS.textWhite,
  },
  textReceived: {
    color: theme.COLORS.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: theme.SPACING.xs,
    gap: theme.SPACING.xs,
  },
  timeText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  timeSent: {
    color: theme.COLORS.timeSent,
  },
  timeReceived: {
    color: theme.COLORS.textMuted,
  },
  checkMark: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.checkMark,
  },
});

export default React.memo(MessageBubble);