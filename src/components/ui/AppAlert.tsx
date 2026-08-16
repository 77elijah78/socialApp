import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import theme from "@/constants/theme";

export interface AppAlertButton {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  bold?: boolean;
}

export interface AppAlertRef {
  show: (options: { title: string; message?: string; buttons: AppAlertButton[] }) => void;
}

const AppAlertComponent = () => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [title, setTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [buttons, setButtons] = React.useState<AppAlertButton[]>([]);

  const snapPoints = useMemo(() => ["30%"], []);

  const show = useCallback((options: { title: string; message?: string; buttons: AppAlertButton[] }) => {
    setTitle(options.title);
    setMessage(options.message ?? "");
    setButtons(options.buttons);
    bottomSheetRef.current?.present();
  }, []);

  const dismiss = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  React.useEffect(() => {
    registerAppAlert(show);
  }, [show]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnDemand
        onPress={dismiss}
        enablePanThroughBackdrop
        opacity={0.5}
      />
    ),
    [dismiss],
  );

  const handlePress = (item: AppAlertButton) => {
    dismiss();
    setTimeout(() => item.onPress(), 250);
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose={false}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: theme.COLORS.borderGray, width: 36 }}
      handleStyle={{ backgroundColor: theme.COLORS.bgLight, paddingTop: 12 }}
      backgroundStyle={{ backgroundColor: theme.COLORS.bgLight }}
    >
      <View style={styles.container}>
        <View style={styles.handle} />

        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.COLORS.primary} />
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
    </BottomSheetModal>
  );
};

let globalShow: ((options: { title: string; message?: string; buttons: AppAlertButton[] }) => void) | null = null;

export function registerAppAlert(showFn: (options: { title: string; message?: string; buttons: AppAlertButton[] }) => void) {
  globalShow = showFn;
}

export function appAlert(options: { title: string; message?: string; buttons: AppAlertButton[] }) {
  if (globalShow) {
    globalShow(options);
  }
}

export default AppAlertComponent;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.SPACING.lg,
    paddingBottom: theme.SPACING.xxl,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: theme.COLORS.borderGray,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    marginBottom: 16,
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
    paddingHorizontal: theme.SPACING.md,
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
