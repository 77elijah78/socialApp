import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PageHeader from "@/components/common/PageHeader";
import PrimaryButton from "@/components/common/PrimaryButton";
import { SkeletonBox } from "@/components/ui";
import { useRateLimit } from "@/hooks/useRateLimit";
import {
  channelService,
  type ChannelDetail,
} from "@/services/ChannelService";
import {
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

export default function ChannelInfoScreen() {
  const { channelId } = useLocalSearchParams() as unknown as { channelId: string };
  const insets = useSafeAreaInsets();
  const socialLimit = useRateLimit("social");
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const mounted = useRef(true);
  const actionInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await channelService.get(channelId);
      if (mounted.current) setChannel(next);
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "Couldn’t load channel info.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [channelId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = useCallback(async () => {
    if (!channel || subscribing || actionInFlight.current || socialLimit.blocked) return;
    actionInFlight.current = true;
    setSubscribing(true);
    try {
      const next = await channelService.subscribe(channel.id, !channel.isSubscribed);
      setChannel((current) =>
        current
          ? {
              ...current,
              isSubscribed: !current.isSubscribed,
              subscriberCount: Math.max(
                0,
                current.subscriberCount + (current.isSubscribed ? -1 : 1),
              ),
              ...(next.subscriberCount ? { subscriberCount: next.subscriberCount } : {}),
            }
          : current,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t update subscription.");
    } finally {
      actionInFlight.current = false;
      setSubscribing(false);
    }
  }, [channel, socialLimit.blocked, subscribing]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <PageHeader title="Channel info" />
        <View style={styles.body}>
          <SkeletonBox height={150} borderRadius={24} />
          <SkeletonBox height={120} borderRadius={22} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <PageHeader title="Channel info" />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {!channel ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={30} color={COLORS.red} />
            <Text style={styles.emptyTitle}>Channel unavailable</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <PrimaryButton title="Try again" onPress={() => void load()} style={styles.retry} />
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.avatarWrap}>
                {channel.avatarUrl ? (
                  <Image source={{ uri: channel.avatarUrl }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="megaphone" size={32} color={COLORS.accentBlue} />
                  </View>
                )}
              </View>
              <Text style={styles.name}>{channel.name}</Text>
              <Text style={styles.handle}>
                {channel.isPrivate ? "Private channel" : "Public channel"} ·{" "}
                {channel.subscriberCount.toLocaleString()} subscriber
                {channel.subscriberCount === 1 ? "" : "s"}
              </Text>
              <View style={styles.roleBadge}>
                <Ionicons
                  name={channel.canPost ? "shield-checkmark" : "person-outline"}
                  size={13}
                  color={COLORS.accentBlue}
                />
                <Text style={styles.roleText}>
                  {channel.canPost
                    ? channel.role === "owner"
                      ? "You own this channel"
                      : "You’re an admin"
                    : channel.isSubscribed
                      ? "You’re subscribed"
                      : "You’re not subscribed"}
                </Text>
              </View>
              <Pressable
                onPress={() => void toggle()}
                disabled={subscribing || socialLimit.blocked}
                accessibilityRole="button"
                style={[
                  styles.subscribe,
                  channel.isSubscribed && styles.subscribed,
                  (subscribing || socialLimit.blocked) && styles.disabled,
                ]}
              >
                {subscribing ? (
                  <ActivityIndicator size="small" color={channel.isSubscribed ? COLORS.accentBlue : COLORS.textWhite} />
                ) : (
                  <Ionicons
                    name={channel.isSubscribed ? "checkmark-circle" : "add-circle-outline"}
                    size={18}
                    color={channel.isSubscribed ? COLORS.accentBlue : COLORS.textWhite}
                  />
                )}
                <Text style={[styles.subscribeText, channel.isSubscribed && styles.subscribeTextMuted]}>
                  {channel.isSubscribed ? "Subscribed" : "Subscribe"}
                </Text>
              </Pressable>
              <PrimaryButton
                title="Open channel feed"
                onPress={() => router.push(`/channels/${channel.id}`)}
                style={styles.openFeed}
              />
            </View>

            {channel.description ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>ABOUT</Text>
                <Text style={styles.description}>{channel.description}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardLabel}>DETAILS</Text>
              <DetailRow icon="people-outline" label="Subscribers" value={channel.subscriberCount.toLocaleString()} />
              <DetailRow icon={channel.isPrivate ? "lock-closed-outline" : "globe-outline"} label="Visibility" value={channel.isPrivate ? "Private" : "Public"} />
              <DetailRow icon="megaphone-outline" label="Publishing" value={channel.canPost ? "Admins" : "Admins only"} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>ADMINS</Text>
              {channel.admins.length ? (
                channel.admins.map((admin) => (
                  <View key={admin.userId} style={styles.adminRow}>
                    {admin.avatarUrl ? (
                      <Image source={{ uri: admin.avatarUrl }} style={styles.adminAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.adminAvatar, styles.avatarFallback]}>
                        <Text style={styles.adminInitial}>
                          {(admin.displayName || admin.username).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.adminCopy}>
                      <Text style={styles.adminName} numberOfLines={1}>
                        {admin.displayName || admin.username}
                      </Text>
                      <Text style={styles.adminHandle}>@{admin.username}</Text>
                    </View>
                    <Text style={styles.adminRole}>{admin.role === "owner" ? "Owner" : "Admin"}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>
                  Admin details aren’t exposed by this server yet. Publishing permissions are still enforced by the backend.
                </Text>
              )}
            </View>

            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={17} color={COLORS.textSecondary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  body: { padding: SPACING.xl, gap: SPACING.lg },
  center: { alignItems: "center", paddingVertical: SPACING.xxxxl, gap: SPACING.sm },
  emptyTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "700" },
  emptyText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg, textAlign: "center" },
  retry: { alignSelf: "stretch", marginTop: SPACING.lg },
  hero: {
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.xl,
    borderRadius: 24,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#D6E4FF",
    ...SHADOWS.sm,
  },
  avatarWrap: { width: 88, height: 88, marginBottom: SPACING.xs },
  avatar: { width: 88, height: 88, borderRadius: 30, backgroundColor: "#EAF2FF" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl6, fontWeight: "800", textAlign: "center" },
  handle: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F2F8FF" },
  roleText: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "700" },
  subscribe: {
    marginTop: SPACING.sm,
    minWidth: 160,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 14,
    backgroundColor: COLORS.accentBlue,
  },
  subscribed: { backgroundColor: "#EAF2FF" },
  subscribeText: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "700" },
  subscribeTextMuted: { color: COLORS.accentBlue },
  openFeed: { alignSelf: "stretch", marginTop: SPACING.sm },
  card: {
    padding: SPACING.lg,
    borderRadius: 20,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    gap: SPACING.md,
  },
  cardLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  description: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, lineHeight: 21 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  detailLabel: { flex: 1, color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg },
  detailValue: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "600" },
  adminRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  adminAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#EAF2FF" },
  adminInitial: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "700" },
  adminCopy: { flex: 1, minWidth: 0 },
  adminName: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "600" },
  adminHandle: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm },
  adminRole: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "700" },
  muted: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 17 },
  error: { flexDirection: "row", gap: SPACING.sm, padding: SPACING.md, borderRadius: 14, backgroundColor: COLORS.dangerLight },
  errorText: { flex: 1, color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.md },
  disabled: { opacity: 0.5 },
});
