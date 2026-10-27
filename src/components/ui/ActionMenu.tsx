import React, { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const FALLBACK_SCREEN = Dimensions.get("window");
const MAX_MENU_WIDTH = 320;

const ActionMenu = ({ visible, items, anchor, onClose }: ActionMenuProps) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuSize, setMenuSize] = useState({ width: MAX_MENU_WIDTH, height: 0 });
  const width = screenWidth || FALLBACK_SCREEN.width;
  const height = screenHeight || FALLBACK_SCREEN.height;
  const isAnchored = Boolean(anchor);

  const menuPosition = useMemo(() => {
    if (!anchor) return undefined;

    const menuWidth = Math.min(menuSize.width || 240, width - 24);
    const estimatedHeight = menuSize.height || items.length * 58 + 24;
    const margin = 12;
    let left = anchor.x;
    let top = anchor.y + anchor.height + 8;

    if (left + menuWidth > width - margin) left = width - menuWidth - margin;
    if (left < margin) left = margin;
    if (top + estimatedHeight > height - insets.bottom - margin) {
      top = anchor.y - estimatedHeight - 8;
    }
    if (top < insets.top + margin) top = insets.top + margin;

    return { left, top, width: menuWidth };
  }, [anchor, height, insets.bottom, insets.top, items.length, menuSize.height, menuSize.width, width]);

  const handleLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width: measuredWidth, height: measuredHeight } = event.nativeEvent.layout;
    setMenuSize({ width: measuredWidth, height: measuredHeight });
  }, []);

  const handleAction = useCallback(
    (item: ActionMenuItem) => {
      onClose();
      setTimeout(item.onPress, 180);
    },
    [onClose],
  );

  const menuContent = (
    <View style={[styles.menuCard, isAnchored ? styles.popoverCard : styles.sheetCard]} onLayout={handleLayout}>
      {!isAnchored ? <View style={styles.handle} /> : null}
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.key}
          accessibilityRole="button"
          style={[
            styles.actionItem,
            index < items.length - 1 && styles.actionItemDivider,
            item.destructive && styles.actionItemDestructive,
          ]}
          onPress={() => handleAction(item)}
          activeOpacity={0.72}
        >
          <View style={[styles.actionIcon, item.destructive && styles.actionIconDestructive]}>
            <Ionicons
              name={item.icon}
              size={19}
              color={item.destructive ? theme.COLORS.danger : theme.COLORS.primary}
            />
          </View>
          <Text
            style={[styles.actionLabel, item.destructive && styles.actionLabelDestructive]}
            numberOfLines={2}
          >
            {item.label}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={item.destructive ? "rgba(255,71,87,0.55)" : theme.COLORS.textMuted}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={isAnchored ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={styles.backdrop}
          onPress={onClose}
        />
        {isAnchored ? (
          <View style={[styles.popoverContainer, menuPosition]}>{menuContent}</View>
        ) : (
          <View
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, theme.SPACING.lg) },
            ]}
          >
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {menuContent}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

ActionMenu.displayName = "ActionMenu";

export default ActionMenu;

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
    backgroundColor: "rgba(20,18,42,0.34)",
  },
  popoverContainer: {
    position: "absolute",
    maxWidth: MAX_MENU_WIDTH,
  },
  menuCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    overflow: "hidden",
    shadowColor: "#17152B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.17,
    shadowRadius: 20,
    elevation: 14,
  },
  popoverCard: {
    borderRadius: 20,
    paddingVertical: theme.SPACING.xs,
  },
  sheetContainer: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: theme.SPACING.md,
  },
  sheetScroll: {
    maxHeight: "72%",
  },
  sheetScrollContent: {
    paddingTop: theme.SPACING.sm,
  },
  sheetCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.md,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    backgroundColor: "#D9D7E3",
    marginBottom: theme.SPACING.md,
  },
  actionItem: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.lg,
  },
  actionItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECEAF4",
  },
  actionItemDestructive: {
    backgroundColor: "rgba(255,71,87,0.035)",
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconDestructive: {
    backgroundColor: theme.COLORS.dangerLight,
  },
  actionLabel: {
    flex: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  actionLabelDestructive: {
    color: theme.COLORS.danger,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
});
