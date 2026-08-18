import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Share as RNShare,
  Clipboard,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import theme from "@/constants/theme";

export interface ShareItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface ShareSheetRef {
  present: (options: {
    title: string;
    message?: string;
    url?: string;
    canExternalShare?: boolean;
    items: ShareItem[];
  }) => void;
  dismiss: () => void;
}

const ShareSheetComponent = () => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [title, setTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [canExternalShare, setCanExternalShare] = React.useState(true);
  const [items, setItems] = React.useState<ShareItem[]>([]);

  const snapPoints = useMemo(() => ["45%"], []);

  const present = useCallback((options: {
    title: string;
    message?: string;
    url?: string;
    canExternalShare?: boolean;
    items: ShareItem[];
  }) => {
    setTitle(options.title);
    setMessage(options.message ?? "");
    setUrl(options.url ?? "");
    setCanExternalShare(options.canExternalShare ?? true);
    setItems(options.items);
    bottomSheetRef.current?.present();
  }, []);

  const dismiss = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  React.useEffect(() => {
    registerShareSheet(present);
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

  const handleAction = (item: ShareItem) => {
    dismiss();
    setTimeout(() => item.onPress(), 250);
  };

  const handleNativeShare = async () => {
    try {
      if (url) {
        await RNShare.share({
          title,
          message: message ? `${message}\n${url}` : url,
          url: url,
        });
      } else {
        await RNShare.share({
          title,
          message: message || title,
        });
      }
    } catch {
      // share cancelled
    }
    dismiss();
  };

  const handleCopyLink = async () => {
    if (!url) return;
    await Clipboard.setString(url);
    Alert.alert("Copied", "Link copied to clipboard");
    dismiss();
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableOverDrag
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: theme.COLORS.borderGray, width: 36 }}
      handleStyle={{ backgroundColor: theme.COLORS.bgLight, paddingTop: 12 }}
      backgroundStyle={{ backgroundColor: theme.COLORS.bgLight }}
    >
      <View style={styles.container}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}

        {url ? (
          <TouchableOpacity style={styles.linkRow} onPress={handleCopyLink}>
            <Ionicons name="link-outline" size={20} color={theme.COLORS.primary} />
            <Text style={styles.linkText} numberOfLines={1}>
              {url}
            </Text>
            <Text style={styles.copyLabel}>Copy</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Share to</Text>
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

        {canExternalShare ? (
          <TouchableOpacity style={styles.nativeShareBtn} onPress={handleNativeShare}>
            <Ionicons name="share-social-outline" size={22} color={theme.COLORS.primary} />
            <Text style={styles.nativeShareLabel}>Share via...</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </BottomSheetModal>
  );
};

let globalPresent: ((options: {
  title: string;
  message?: string;
  url?: string;
  canExternalShare?: boolean;
  items: ShareItem[];
}) => void) | null = null;

export function registerShareSheet(presentFn: (options: {
  title: string;
  message?: string;
  url?: string;
  canExternalShare?: boolean;
  items: ShareItem[];
}) => void) {
  globalPresent = presentFn;
}

export function presentShareSheet(options: {
  title: string;
  message?: string;
  url?: string;
  canExternalShare?: boolean;
  items: ShareItem[];
}) {
  if (globalPresent) {
    globalPresent(options);
  }
}

export default ShareSheetComponent;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.SPACING.md,
    paddingBottom: theme.SPACING.xxl,
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: theme.COLORS.borderGray,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    textAlign: "center",
    marginBottom: theme.SPACING.xs,
  },
  message: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textSecondary,
    textAlign: "center",
    marginBottom: theme.SPACING.md,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    backgroundColor: theme.COLORS.primaryGhost,
    borderRadius: theme.BORDER_RADIUS.md,
    marginBottom: theme.SPACING.md,
  },
  linkText: {
    flex: 1,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.primary,
  },
  copyLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.primary,
  },
  section: {
    marginBottom: theme.SPACING.md,
  },
  sectionLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginBottom: theme.SPACING.xs,
    marginLeft: theme.SPACING.sm,
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
  nativeShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.md,
    paddingVertical: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.xl,
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  nativeShareLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
});
