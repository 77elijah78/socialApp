import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";

export interface AppAlertButton {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  bold?: boolean;
}

interface AppAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  onClose: () => void;
}

const AppAlertComponent = ({ visible, title, message, buttons, onClose }: AppAlertProps) => {
  const handlePress = (item: AppAlertButton) => {
    onClose();
    setTimeout(() => item.onPress(), 250);
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop}>
          <View style={styles.backdropFill} />
        </Pressable>

        <View style={styles.centeredContainer}>
          <View style={styles.dialogCard}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="alert-circle"
                size={48}
                color={theme.COLORS.primary}
              />
            </View>

            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <View style={styles.buttonContainer}>
              {buttons.map((item, index) => (
                <React.Fragment key={item.key}>
                  {index > 0 && <View style={styles.separator} />}
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => handlePress(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.buttonLabel,
                        item.destructive && styles.buttonLabelDestructive,
                        item.bold && styles.buttonLabelBold,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

AppAlertComponent.displayName = "AppAlert";

export default AppAlertComponent;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  backdropFill: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xl,
  },
  dialogCard: {
    backgroundColor: theme.COLORS.bgLight,
    borderRadius: theme.BORDER_RADIUS.lg,
    paddingVertical: theme.SPACING.lg,
    paddingHorizontal: theme.SPACING.lg,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
    alignItems: "center",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.md,
  },
  title: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    textAlign: "center",
    marginBottom: theme.SPACING.sm,
  },
  message: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textSecondary,
    textAlign: "center",
    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
    marginBottom: theme.SPACING.lg,
  },
  buttonContainer: {
    width: "100%",
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    overflow: "hidden",
    backgroundColor: theme.COLORS.bgWhite,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.COLORS.borderDivider,
  },
  button: {
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  buttonLabelDestructive: {
    color: theme.COLORS.danger,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  buttonLabelBold: {
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
});
