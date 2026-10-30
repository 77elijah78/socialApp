import { memo, useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";
interface Props {
  time: string | number;
  status: string;
  isSent: boolean;
  onRetry?: () => void;
}
function MessageMeta({ time, status, isSent, onRetry }: Props) {
  const formatted = useMemo(() => {
    const value = new Date(time);
    return Number.isNaN(value.getTime())
      ? ""
      : value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [time]);
  const icon =
    status === "FAILED"
      ? "alert-circle-outline"
      : status === "SENT"
        ? "checkmark"
        : "checkmark-done";
  const label =
    status === "READ"
      ? "Read"
      : status === "DELIVERED"
        ? "Delivered"
        : status === "FAILED"
          ? "Failed to send"
          : status === "SENDING"
            ? "Sending"
            : "Sent";
  return (
    <View style={styles.row}>
      <Text style={styles.time}>{formatted}</Text>
      {isSent && (
        <View style={styles.receipt} accessible accessibilityLabel={label}>
          {status === "SENDING" ? (
            <ActivityIndicator size={11} color={COLORS.textGray} />
          ) : (
            <Ionicons
              name={icon}
              size={15}
              color={
                status === "READ"
                  ? COLORS.primaryDark
                  : status === "FAILED"
                    ? COLORS.red
                    : COLORS.textGray
              }
            />
          )}
        </View>
      )}
      {isSent && status === "FAILED" && (
        <TouchableOpacity
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry failed message"
          style={styles.retry}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
export default memo(MessageMeta);
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: SPACING.sm,
    minHeight: 18,
    paddingTop: SPACING.xs,
  },
  time: { color: COLORS.textGray, fontSize: TYPOGRAPHY.fontSize.sm },
  receipt: { minWidth: 16, alignItems: "center" },
  retry: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: "600",
  },
});
