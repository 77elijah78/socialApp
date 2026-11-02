import { memo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

type Icon = keyof typeof Ionicons.glyphMap;
interface Props {
  count: number;
  busy: boolean;
  canCopy: boolean;
  canDelete: boolean;
  canForward: boolean;
  canReply: boolean;
  canRetry: boolean;
  onCancel: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onForward: () => void;
  onReply: () => void;
  onRetry: () => void;
}
function MessageSelectionBar(props: Props) {
  const action = (
    label: string,
    icon: Icon,
    onPress: () => void,
    enabled = true,
    destructive = false,
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={props.busy || !enabled}
      accessibilityState={{ disabled: props.busy || !enabled }}
      style={[styles.button, (!enabled || props.busy) && styles.disabled]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={21}
        color={destructive ? COLORS.danger : COLORS.primaryDark}
      />
    </TouchableOpacity>
  );
  return (
    <View style={styles.container} testID="message-selection-toolbar">
      {action("Cancel message selection", "close-outline", props.onCancel)}
      <Text
        style={styles.count}
        accessibilityLiveRegion="polite"
        numberOfLines={1}
      >
        {props.count} selected
      </Text>
      {props.busy && <ActivityIndicator size="small" color={COLORS.primary} />}
      {props.canReply &&
        action(
          "Reply to selected message",
          "arrow-undo-outline",
          props.onReply,
        )}
      {props.canRetry &&
        action("Retry selected message", "refresh-outline", props.onRetry)}
      {action(
        "Copy selected text",
        "copy-outline",
        props.onCopy,
        props.canCopy,
      )}
      {action(
        "Forward selected messages",
        "arrow-redo-outline",
        props.onForward,
        props.canForward,
      )}
      {action(
        "Delete selected messages",
        "trash-outline",
        props.onDelete,
        props.canDelete,
        true,
      )}
    </View>
  );
}
export default memo(MessageSelectionBar);
const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryGhostBorder,
    backgroundColor: COLORS.bgWhite,
  },
  button: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.35 },
  count: {
    flex: 1,
    minWidth: 0,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
  },
});
