import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share as RNShare,
  Clipboard,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import theme from "@/constants/theme";
import { showAppDialog } from "@/services/AppDialogService";

const SHARE_OPTIONS = [
  {
    key: "copy-link",
    icon: "link-outline",
    label: "Copy link",
    description: "Copy link to clipboard",
  },
  {
    key: "share-to-users",
    icon: "people-outline",
    label: "Share to users",
    description: "Send to one or more users",
  },
  {
    key: "system-share",
    icon: "share-social-outline",
    label: "System share",
    description: "Use system share sheet",
  },
] as const;

type ShareOption = (typeof SHARE_OPTIONS)[number];

export default function ShareScreen() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    postId?: string;
    storyId?: string;
    title?: string;
    message?: string;
    url?: string;
  }>();

  const title = params.title ?? "Share";
  const message = params.message ?? "";
  const url = params.url ?? "";
  const isCompact = width < 360;

  const handleCopyLink = async () => {
    if (!url) return;
    await Clipboard.setString(url);
    showAppDialog({
      title: "Link copied",
      message: "The link is ready to share.",
      tone: "success",
    });
  };

  const handleSystemShare = async () => {
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
      // cancelled
    }
  };

  const handleOptionPress = async (option: ShareOption) => {
    switch (option.key) {
      case "copy-link":
        await handleCopyLink();
        break;
      case "share-to-users":
        router.push({
          pathname: "/share/users",
          params: {
            postId: params.postId,
            storyId: params.storyId,
            title: "Share to users",
            message,
            url,
          },
        });
        break;
      case "system-share":
        await handleSystemShare();
        break;
    }
  };

  const renderShareOption = (option: ShareOption) => {
    const isFirst = option.key === "copy-link";

    return (
      <TouchableOpacity
        key={option.key}
        style={[styles.optionRow, isFirst && styles.optionRowFirst]}
        onPress={() => handleOptionPress(option)}
        activeOpacity={0.6}
      >
        <View style={styles.iconWrapper}>
          <Ionicons
            name={option.icon}
            size={22}
            color={theme.COLORS.primary}
          />
        </View>
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionLabel}>{option.label}</Text>
          <Text style={styles.optionDescription}>{option.description}</Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.COLORS.textMuted}
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isCompact && styles.scrollContentCompact,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>

        {url ? (
          <View style={styles.linkCard}>
            <View style={styles.linkIconWrapper}>
              <Ionicons name="link" size={18} color={theme.COLORS.primary} />
            </View>
            <Text style={styles.linkText} numberOfLines={1}>
              {url}
            </Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={handleCopyLink}
              activeOpacity={0.7}
            >
              <Text style={styles.copyButtonText}>Copy</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Share via</Text>
          </View>
          <View style={styles.optionsContainer}>
            {SHARE_OPTIONS.map((option) => renderShareOption(option))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  scrollContent: {
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
    paddingBottom: theme.SPACING.xxl,
  },
  scrollContentCompact: {
    paddingHorizontal: theme.SPACING.md,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: theme.SPACING.lg,
    marginTop: theme.SPACING.sm,
  },
  title: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    textAlign: "center",
  },
  message: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textSecondary,
    textAlign: "center",
    marginTop: theme.SPACING.xs,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xl,
    marginBottom: theme.SPACING.lg,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
    ...theme.SHADOWS.sm,
  },
  linkIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  linkText: {
    flex: 1,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textSecondary,
  },
  copyButton: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.primaryGhost,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
    flexShrink: 0,
  },
  copyButtonText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.primary,
  },
  card: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
    overflow: "hidden",
    ...theme.SHADOWS.sm,
  },
  cardHeader: {
    paddingHorizontal: theme.SPACING.md,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.sm,
  },
  cardTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionsContainer: {
    paddingHorizontal: theme.SPACING.sm,
    paddingBottom: theme.SPACING.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xl,
  },
  optionRowFirst: {
    marginTop: theme.SPACING.xs,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  optionDescription: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginTop: 2,
  },
});
