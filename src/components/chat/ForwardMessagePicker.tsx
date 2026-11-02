import { memo, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRooms } from "@/hooks/useRooms";
import { ChatReadVisibility } from "./ChatReadVisibility";
import { BORDER_RADIUS, COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

/** Existing conversation cache/API, including groups. This does not create a
 * new sharing protocol or manufacture a destination conversation. */
function ForwardMessagePicker({
  count,
  busy,
  error,
  onClose,
  onForward,
}: {
  count: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onForward: (conversationId: string) => Promise<void>;
}) {
  const { rooms, loading, error: roomError, reload } = useRooms();
  const [query, setQuery] = useState("");
  const coverReads = useContext(ChatReadVisibility);
  useEffect(() => coverReads(), [coverReads]);
  const insets = useSafeAreaInsets();
  const destinations = useMemo(
    () =>
      rooms.filter(
        (room) =>
          !room.archived &&
          room.name
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      ),
    [rooms, query],
  );
  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, SPACING.xl) },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>
              Forward {count} {count === 1 ? "message" : "messages"}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={busy}
              style={styles.close}
              accessibilityLabel="Close forward picker"
              accessibilityState={{ disabled: busy }}
            >
              <Ionicons
                name="close-outline"
                size={24}
                color={COLORS.textPrimary}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Choose an existing conversation</Text>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            editable={!busy}
            placeholder="Search conversations"
            placeholderTextColor={COLORS.textMuted}
            accessibilityLabel="Search forward destinations"
          />
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {roomError && (
            <TouchableOpacity
              onPress={() => {
                void reload();
              }}
              disabled={busy}
              style={styles.retry}
              accessibilityLabel="Retry loading forward destinations"
            >
              <Text style={styles.hint}>
                Couldn’t refresh conversations · Retry
              </Text>
            </TouchableOpacity>
          )}
          {busy && (
            <View style={styles.progress}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.hint}>Forwarding…</Text>
            </View>
          )}
          <FlatList
            data={destinations}
            keyExtractor={(room) => room.conversationId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.room}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Forward to ${item.name}`}
                accessibilityState={{ disabled: busy }}
                onPress={() => {
                  void onForward(item.conversationId);
                }}
              >
                <View style={styles.avatar}>
                  <Ionicons
                    name={item.isGroup ? "people-outline" : "person-outline"}
                    size={22}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                {loading ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Text style={styles.hint}>
                    {query
                      ? "No matching conversations"
                      : "No saved conversations. Open a conversation first."}
                  </Text>
                )}
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}
export default memo(ForwardMessagePicker);
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,26,46,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "70%",
    backgroundColor: COLORS.bgWhite,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
  },
  header: { flexDirection: "row", alignItems: "center" },
  title: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl4,
    fontWeight: "700",
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg },
  search: {
    minHeight: 44,
    marginVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.bgInput,
    borderRadius: BORDER_RADIUS.lg,
    color: COLORS.textPrimary,
  },
  error: { color: COLORS.danger, paddingVertical: SPACING.md },
  retry: { minHeight: 44, justifyContent: "center" },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  room: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.primaryGhostBorder,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: "600",
  },
  empty: { padding: SPACING.xxxl, alignItems: "center" },
});
