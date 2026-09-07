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

export interface ActionMenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

const ActionMenuComponent = () => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [actions, setActions] = React.useState<ActionMenuItem[]>([]);

  const snapPoints = useMemo(() => ["40%"], []);

  const present = useCallback((items: ActionMenuItem[]) => {
    setActions(items);
    bottomSheetRef.current?.present();
  }, []);

  const dismiss = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  React.useEffect(() => {
    registerActionMenu(present);
  }, [present]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnDemand
        onPress={dismiss}
        enablePanThroughBackdrop
        opacity={0.4}
      />
    ),
    [dismiss],
  );

  const handleAction = (item: ActionMenuItem) => {
    dismiss();
    setTimeout(() => item.onPress(), 250);
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableOverDrag
      enableContentScrollings
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: theme.COLORS.borderGray, width: 36 }}
      handleStyle={{ backgroundColor: theme.COLORS.bgLight, paddingTop: 12 }}
      backgroundStyle={{ backgroundColor: theme.COLORS.bgLight }}
    >
      <View style={styles.sheetContainer}>
        <View style={styles.handle} />

        {actions.map((item, index) => (
          <React.Fragment key={item.key}>
            {index > 0 && <View style={styles.separator} />}
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => handleAction(item)}
              activeOpacity={0.6}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={item.destructive ? theme.COLORS.danger : theme.COLORS.textPrimary}
              />
              <Text
                style={[
                  styles.actionLabel,
                  item.destructive && styles.actionLabelDestructive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
    </BottomSheetModal>
  );
};

let globalPresent: ((items: ActionMenuItem[]) => void) | null = null;

export function registerActionMenu(presentFn: (items: ActionMenuItem[]) => void) {
  globalPresent = presentFn;
}

export function presentActionMenu(items: ActionMenuItem[]) {
  if (globalPresent) {
    globalPresent(items);
  }
}

export default ActionMenuComponent;

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: theme.COLORS.borderGray,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    marginBottom: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.COLORS.borderDivider,
    marginVertical: theme.SPACING.xs,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.md,
  },
  actionLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textPrimary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  actionLabelDestructive: {
    color: theme.COLORS.danger,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
});
