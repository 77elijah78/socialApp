import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import theme from "@/constants/theme";
import type {
  AppDialogButton,
  AppDialogIcon,
  AppDialogPresentation,
  AppDialogTone,
} from "@/services/AppDialogService";

interface AppAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppDialogButton[];
  tone?: AppDialogTone;
  presentation?: AppDialogPresentation;
  icon?: AppDialogIcon;
  onClose: () => void;
}

const TONE_DETAILS: Record<
  AppDialogTone,
  { icon: AppDialogIcon; color: string; background: string }
> = {
  info: {
    icon: "information-circle",
    color: theme.COLORS.primary,
    background: theme.COLORS.primaryGhost,
  },
  success: {
    icon: "checkmark-circle",
    color: theme.COLORS.success,
    background: theme.COLORS.successLight,
  },
  warning: {
    icon: "alert-circle",
    color: "#D58A11",
    background: "#FFF5DC",
  },
  error: {
    icon: "close-circle",
    color: theme.COLORS.danger,
    background: theme.COLORS.dangerLight,
  },
  action: {
    icon: "sparkles",
    color: theme.COLORS.primary,
    background: theme.COLORS.primaryGhost,
  },
};

const AppAlert = ({
  visible,
  title,
  message,
  buttons,
  tone = "info",
  presentation = "dialog",
  icon,
  onClose,
}: AppAlertProps) => {
  const insets = useSafeAreaInsets();
  const toneDetails = TONE_DETAILS[tone];
  const isSheet = presentation === "sheet";
  const safeButtons = buttons.length
    ? buttons
    : [{ key: "dismiss", label: "Got it", bold: true }];

  const handlePress = (item: AppDialogButton) => {
    onClose();
    if (item.onPress) {
      setTimeout(item.onPress, 180);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={isSheet ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          style={styles.backdrop}
          onPress={onClose}
        />

        {isSheet ? (
          <View
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, theme.SPACING.lg) },
            ]}
          >
            <View style={styles.sheetCard}>
              <View style={styles.handle} />
              <View style={styles.sheetHeading}>
                <View
                  style={[
                    styles.sheetIcon,
                    { backgroundColor: toneDetails.background },
                  ]}
                >
                  <Ionicons
                    name={icon ?? toneDetails.icon}
                    size={22}
                    color={toneDetails.color}
                  />
                </View>
                <View style={styles.sheetHeadingText}>
                  <Text style={styles.sheetTitle}>{title}</Text>
                  {message ? <Text style={styles.sheetMessage}>{message}</Text> : null}
                </View>
              </View>

              <View style={styles.sheetOptions}>
                {safeButtons
                  .filter((item) => !item.cancel)
                  .map((item) => (
                    <TouchableOpacity
                      key={item.key}
                      accessibilityRole="button"
                      style={styles.sheetOption}
                      onPress={() => handlePress(item)}
                      activeOpacity={0.72}
                    >
                      <View
                        style={[
                          styles.optionIcon,
                          item.destructive && styles.optionIconDestructive,
                        ]}
                      >
                        <Ionicons
                          name={item.icon ?? (item.destructive ? "trash-outline" : "arrow-forward-outline")}
                          size={21}
                          color={item.destructive ? theme.COLORS.danger : theme.COLORS.primary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.optionLabel,
                          item.destructive && styles.destructiveText,
                          item.bold && styles.boldText,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={theme.COLORS.textMuted}
                      />
                    </TouchableOpacity>
                  ))}
              </View>

              {safeButtons.some((item) => item.cancel) ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.sheetCancel}
                  onPress={() =>
                    handlePress(safeButtons.find((item) => item.cancel)!)
                  }
                  activeOpacity={0.72}
                >
                  <Text style={styles.sheetCancelText}>
                    {safeButtons.find((item) => item.cancel)?.label ?? "Cancel"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.centeredContainer}>
            <View style={styles.dialogCard}>
              <View
                style={[
                  styles.dialogIcon,
                  { backgroundColor: toneDetails.background },
                ]}
              >
                <Ionicons
                  name={icon ?? toneDetails.icon}
                  size={31}
                  color={toneDetails.color}
                />
              </View>
              <Text style={styles.title}>{title}</Text>
              {message ? <Text style={styles.message}>{message}</Text> : null}

              <View style={styles.buttonContainer}>
                {safeButtons.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    accessibilityRole="button"
                    style={[
                      styles.button,
                      item.destructive && styles.destructiveButton,
                      item.cancel && styles.cancelButton,
                    ]}
                    onPress={() => handlePress(item)}
                    activeOpacity={0.78}
                  >
                    {item.icon ? (
                      <Ionicons
                        name={item.icon}
                        size={17}
                        color={
                          item.destructive
                            ? theme.COLORS.danger
                            : item.cancel
                              ? theme.COLORS.textSecondary
                              : theme.COLORS.white
                        }
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.buttonLabel,
                        item.destructive && styles.destructiveText,
                        item.cancel && styles.cancelText,
                        item.bold && styles.boldText,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

AppAlert.displayName = "AppAlert";

export default AppAlert;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "center",
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(20, 18, 42, 0.48)",
  },
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xxl,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 26,
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.xxxl,
    paddingBottom: theme.SPACING.xxl,
    shadowColor: "#17152B",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  dialogIcon: {
    width: 58,
    height: 58,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.lg,
  },
  title: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    textAlign: "center",
  },
  message: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    lineHeight: 22,
    textAlign: "center",
    marginTop: theme.SPACING.sm,
  },
  buttonContainer: {
    width: "100%",
    flexDirection: "row",
    gap: theme.SPACING.md,
    marginTop: theme.SPACING.xxl,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: theme.SPACING.lg,
    backgroundColor: theme.COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.SPACING.sm,
  },
  buttonLabel: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    textAlign: "center",
  },
  destructiveButton: {
    backgroundColor: theme.COLORS.dangerLight,
  },
  cancelButton: {
    backgroundColor: theme.COLORS.bgInput,
  },
  destructiveText: {
    color: theme.COLORS.danger,
  },
  cancelText: {
    color: theme.COLORS.textSecondary,
  },
  boldText: {
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sheetContainer: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: theme.SPACING.md,
  },
  sheetCard: {
    paddingTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.xl,
    paddingBottom: theme.SPACING.xl,
    backgroundColor: theme.COLORS.bgWhite,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: "#17152B",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 20,
  },
  handle: {
    width: 38,
    height: 4,
    alignSelf: "center",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "#D9D7E3",
    marginBottom: theme.SPACING.xxl,
  },
  sheetHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.xl,
  },
  sheetIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.SPACING.md,
  },
  sheetHeadingText: {
    flex: 1,
  },
  sheetTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sheetMessage: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    lineHeight: 19,
    marginTop: theme.SPACING.xs,
  },
  sheetOptions: {
    borderWidth: 1,
    borderColor: "#ECEAF4",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: theme.COLORS.white,
  },
  sheetOption: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.md,
    gap: theme.SPACING.md,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  optionIconDestructive: {
    backgroundColor: theme.COLORS.dangerLight,
  },
  optionLabel: {
    flex: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  sheetCancel: {
    minHeight: 50,
    marginTop: theme.SPACING.md,
    borderRadius: 16,
    backgroundColor: theme.COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCancelText: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
});
