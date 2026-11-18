import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PageHeader from "@/components/common/PageHeader";
import PrimaryButton from "@/components/common/PrimaryButton";
import { pickFromLibrary } from "@/hooks/useImagePicker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { uploadAvatarAsset } from "@/services/AvatarService";
import { channelService } from "@/services/ChannelService";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

export default function CreateChannelScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mediaLimit = useRateLimit("media");
  const socialLimit = useRateLimit("social");

  const chooseAvatar = useCallback(async () => {
    if (uploading || mediaLimit.blocked) return;
    try {
      const picked = await pickFromLibrary({ mediaTypes: "images", allowsEditing: true, aspect: [1, 1] });
      const asset = Array.isArray(picked) ? picked[0] : picked;
      if (!asset) return;
      setAvatarUri(asset.uri);
      setUploading(true);
      setError(null);
      const uploaded = await uploadAvatarAsset(asset);
      setAvatarUrl(uploaded.url);
    } catch (failure) {
      setAvatarUri(null);
      setAvatarUrl(null);
      setError(failure instanceof Error ? failure.message : "Couldn’t upload that photo.");
    } finally {
      setUploading(false);
    }
  }, [mediaLimit.blocked, uploading]);

  const create = useCallback(async () => {
    if (inFlight.current || creating) return;
    if (!name.trim()) {
      setError("Give your channel a name.");
      return;
    }
    if (uploading) {
      setError("Wait for the channel photo to finish uploading.");
      return;
    }
    inFlight.current = true;
    setCreating(true);
    setError(null);
    try {
      const channel = await channelService.create({
        name,
        description,
        avatarUrl,
        isPrivate,
      });
      router.replace(`/channels/${channel.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t create the channel.");
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }, [avatarUrl, creating, description, isPrivate, name, uploading]);

  return (
    <View style={styles.screen}>
      <PageHeader title="New channel" subtitle="Broadcast feed" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Pressable
              onPress={() => void chooseAvatar()}
              disabled={uploading || mediaLimit.blocked}
              accessibilityRole="button"
              accessibilityLabel={avatarUri ? "Change channel photo" : "Add channel photo"}
              style={styles.avatarButton}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <Ionicons name="megaphone-outline" size={30} color={COLORS.accentBlue} />
              )}
              {uploading ? (
                <View style={styles.avatarBusy}><ActivityIndicator color={COLORS.textWhite} /></View>
              ) : null}
            </Pressable>
            <Text style={styles.heroTitle}>Start broadcasting</Text>
            <Text style={styles.heroText}>Subscribers can read every post. Only admins can publish.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Channel name</Text>
            <TextInput
              value={name}
              onChangeText={(value) => { setName(value); setError(null); }}
              placeholder="Product updates"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              maxLength={80}
              editable={!creating}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What will you broadcast?"
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, styles.textarea]}
              multiline
              maxLength={400}
              editable={!creating}
              textAlignVertical="top"
            />
            <Text style={styles.counter}>{description.length}/400</Text>
          </View>

          <View style={styles.toggleCard}>
            <View style={[styles.toggleIcon, isPrivate && styles.toggleIconPrivate]}>
              <Ionicons name={isPrivate ? "lock-closed" : "globe-outline"} size={20} color={isPrivate ? COLORS.primaryDark : COLORS.accentBlue} />
            </View>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>{isPrivate ? "Private channel" : "Public channel"}</Text>
              <Text style={styles.toggleText}>
                {isPrivate
                  ? "Only people with an invite or approval can subscribe."
                  : "Anyone can discover and subscribe."}
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: "#D9E6FF", true: COLORS.primaryLight }}
              thumbColor={isPrivate ? COLORS.primary : COLORS.accentBlue}
              accessibilityLabel="Private channel"
              disabled={creating}
            />
          </View>

          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={20} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <PortabilityNote />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
          {socialLimit.blocked ? (
            <Text style={styles.cooldown}>You can create a channel in {socialLimit.countdown}.</Text>
          ) : null}
          <PrimaryButton
            title="Create channel"
            onPress={() => void create()}
            loading={creating}
            loadingLabel="Creating…"
            disabled={creating || uploading || socialLimit.blocked}
            testID="create-channel-submit"
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function PortabilityNote() {
  return (
    <View style={styles.note}>
      <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.textSecondary} />
      <Text style={styles.noteText}>
        Publishing permissions are enforced by the server. This screen never grants admin rights locally.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  flex: { flex: 1 },
  content: { padding: SPACING.xl, gap: SPACING.xl },
  hero: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.md },
  avatarButton: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FF",
    borderWidth: 1,
    borderColor: "#D6E4FF",
    overflow: "hidden",
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarBusy: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(26,26,46,0.4)" },
  heroTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "800" },
  heroText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center", maxWidth: 300, lineHeight: 17 },
  field: { gap: SPACING.xs },
  label: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "600", marginLeft: SPACING.xs },
  input: {
    minHeight: 48,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    paddingHorizontal: SPACING.lg,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
  },
  textarea: { minHeight: 96, paddingTop: SPACING.lg, lineHeight: 20 },
  counter: { alignSelf: "flex-end", color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm, marginRight: SPACING.xs },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 20,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  toggleIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF" },
  toggleIconPrivate: { backgroundColor: COLORS.primaryGhost },
  toggleCopy: { flex: 1, minWidth: 0 },
  toggleTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "600" },
  toggleText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 15, marginTop: 1 },
  errorBanner: { flexDirection: "row", gap: SPACING.md, padding: SPACING.lg, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.dangerLight },
  errorText: { flex: 1, color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.lg, lineHeight: 19 },
  note: { flexDirection: "row", gap: SPACING.sm, paddingHorizontal: SPACING.xs },
  noteText: { flex: 1, color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 16 },
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.bgMain,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E4E1EE",
    gap: SPACING.sm,
  },
  cooldown: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center" },
});
