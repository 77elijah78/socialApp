import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, SPACING, TYPOGRAPHY } from "@/constants/theme";
import { useAutoDownloadSettings } from "@/hooks/useAutoDownloadSettings";
import { useNetworkConditions } from "@/hooks/useNetworkConditions";
import {
  AUTO_DOWNLOAD_SIZE_LIMITS,
  autoDownloadSettings,
  formatAutoDownloadLimit,
  type AutoDownloadCategory,
  type AutoDownloadNetwork,
} from "@/services/AutoDownloadSettings";

const NETWORKS: {
  key: AutoDownloadNetwork;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "wifi", label: "Wi-Fi", icon: "wifi-outline" },
  { key: "mobile", label: "Mobile data", icon: "cellular-outline" },
  { key: "roaming", label: "Roaming", icon: "earth-outline" },
];

const MEDIA: {
  key: AutoDownloadCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "photos", label: "Photos", icon: "image-outline" },
  { key: "videos", label: "Videos", icon: "videocam-outline" },
  { key: "voice", label: "Voice messages", icon: "mic-outline" },
  { key: "music", label: "Music & audio", icon: "musical-notes-outline" },
  { key: "documents", label: "Documents", icon: "document-outline" },
];

const NETWORK_LABEL: Record<string, string> = {
  wifi: "Wi-Fi",
  mobile: "Mobile data",
  roaming: "Roaming",
  other: "Connected",
  offline: "No connection",
};

function ToggleRow({
  icon,
  label,
  description,
  value,
  onChange,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={17} color={COLORS.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={`Auto download ${label}`}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#D8D6E2", true: COLORS.primaryLight }}
        thumbColor={value ? COLORS.primary : "#FFFFFF"}
        ios_backgroundColor="#D8D6E2"
      />
    </View>
  );
}

export default function AutoDownloadSettingsPanel() {
  const settings = useAutoDownloadSettings();
  const network = useNetworkConditions();

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.sectionTitle}>Auto Download</Text>
          <Text style={styles.sectionSubtitle}>
            Choose what arrives automatically. Manual downloads are always available.
          </Text>
        </View>
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: network.kind === "offline" ? COLORS.textMuted : COLORS.success },
            ]}
          />
          <Text style={styles.statusText}>
            {NETWORK_LABEL[network.kind] ?? "Connected"}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.groupLabel}>ON THESE NETWORKS</Text>
        {NETWORKS.map((item, index) => (
          <ToggleRow
            key={item.key}
            icon={item.icon}
            label={item.label}
            description={
              item.key === "roaming"
                ? "Use while travelling outside your home network"
                : undefined
            }
            value={settings.networks[item.key]}
            onChange={(value) => autoDownloadSettings.setNetwork(item.key, value)}
            last={index === NETWORKS.length - 1}
          />
        ))}

        <View style={styles.divider} />
        <Text style={styles.groupLabel}>MEDIA TYPES</Text>
        {MEDIA.map((item, index) => (
          <ToggleRow
            key={item.key}
            icon={item.icon}
            label={item.label}
            description={`Up to ${formatAutoDownloadLimit(
              AUTO_DOWNLOAD_SIZE_LIMITS[item.key],
            )} each`}
            value={settings.media[item.key]}
            onChange={(value) => autoDownloadSettings.setMedia(item.key, value)}
            last={index === MEDIA.length - 1}
          />
        ))}
      </View>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.textMuted} />
        <Text style={styles.noteText}>
          Downloads stay in this account’s private app storage. Larger files wait
          for a manual tap, even when a type is enabled.
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Reset Auto Download settings"
        style={styles.reset}
        onPress={() => autoDownloadSettings.reset()}
        activeOpacity={0.75}
      >
        <Text style={styles.resetText}>Reset to defaults</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: SPACING.xxl },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  headingCopy: { flex: 1 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.sm,
    lineHeight: 16,
    marginTop: 3,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: "600",
  },
  card: {
    backgroundColor: COLORS.bgWhite,
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    overflow: "hidden",
  },
  groupLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECEAF4",
  },
  rowLast: { borderBottomWidth: 0 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryGhost,
  },
  copy: { flex: 1, minWidth: 0 },
  label: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
  },
  description: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ECEAF4",
    marginTop: SPACING.sm,
  },
  note: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  noteText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.sm,
    lineHeight: 16,
  },
  reset: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    marginLeft: SPACING.lg,
    minHeight: 36,
    justifyContent: "center",
  },
  resetText: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
  },
});
