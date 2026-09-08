import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";

export interface ActionMenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionMenuProps {
  visible: boolean;
  items: ActionMenuItem[];
  anchor?: { x: number; y: number; width: number; height: number };
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const ActionMenuComponent = ({ visible, items, anchor, onClose }: ActionMenuProps) => {
  const [menuLayout, setMenuLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const handleLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setMenuLayout((prev) => ({ ...prev, width, height }));
  };

  const getMenuPosition = useCallback(() => {
    if (!anchor) {
      return {
        left: (SCREEN_WIDTH - (menuLayout.width || 200)) / 2,
        top: (SCREEN_HEIGHT - (menuLayout.height || 300)) / 2,
      };
    }

    const menuWidth = menuLayout.width || 220;
    const menuHeight = menuLayout.height || items.length * 48 + 16;
    const spacing = 8;

    let left = anchor.x;
    let top = anchor.y + anchor.height + spacing;

    if (left + menuWidth > SCREEN_WIDTH - spacing) {
      left = SCREEN_WIDTH - menuWidth - spacing;
    }
    if (left < spacing) {
      left = spacing;
    }

    if (top + menuHeight > SCREEN_HEIGHT - spacing) {
      top = anchor.y - menuHeight - spacing;
    }
    if (top < spacing) {
      top = spacing;
    }

    return { left, top };
  }, [anchor, items.length, menuLayout.width, menuLayout.height]);

  const handleAction = (item: ActionMenuItem) => {
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
        <Pressable style={styles.backdrop} onPress={onClose}>
          <View style={styles.backdropContent} />
        </Pressable>

        <View
          style={[
            styles.menuContainer,
            getMenuPosition(),
          ]}
          onLayout={handleLayout}
        >
          <View style={styles.menuCard}>
            <View style={styles.menuHandle} />
            {items.map((item, index) => (
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
                    color={
                      item.destructive
                        ? theme.COLORS.danger
                        : theme.COLORS.textPrimary
                    }
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
        </View>
      </View>
    </Modal>
  );
};

ActionMenuComponent.displayName = "ActionMenu";

export default ActionMenuComponent;

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
  backdropContent: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  menuContainer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  menuCard: {
    backgroundColor: theme.COLORS.bgLight,
    borderRadius: theme.BORDER_RADIUS.lg,
    paddingVertical: theme.SPACING.sm,
    minWidth: 220,
    maxWidth: SCREEN_WIDTH * 0.75,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuHandle: {
    width: 36,
    height: 5,
    backgroundColor: theme.COLORS.borderGray,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    marginBottom: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.COLORS.borderDivider,
    marginVertical: theme.SPACING.xs,
    marginHorizontal: theme.SPACING.md,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.md,
    marginHorizontal: theme.SPACING.xs,
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
