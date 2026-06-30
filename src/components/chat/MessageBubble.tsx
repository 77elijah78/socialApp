// components/chat/MessageBubble.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/constants/theme";

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
                        ? "rgba(255,255,255,0.5)"
                        : COLORS.primaryLight,
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
    marginVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  wrapperSent: {
    alignItems: "flex-end",
  },
  wrapperReceived: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.xl,
  },
  bubbleSent: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: SPACING.xs,
    ...SHADOW.primary,
  },
  bubbleReceived: {
    backgroundColor: COLORS.bgWhite,
    borderBottomLeftRadius: SPACING.xs,
    ...SHADOW.sm,
  },
  voiceIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  voiceIcon: {
    fontSize: 16,
  },
  voiceWaves: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  miniBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: FONT.regular,
  },
  textSent: {
    color: COLORS.textWhite,
  },
  textReceived: {
    color: COLORS.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  timeText: {
    fontSize: 11,
    fontWeight: FONT.medium,
  },
  timeSent: {
    color: "rgba(255,255,255,0.6)",
  },
  timeReceived: {
    color: COLORS.textMuted,
  },
  checkMark: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
  },
});

export default React.memo(MessageBubble);
