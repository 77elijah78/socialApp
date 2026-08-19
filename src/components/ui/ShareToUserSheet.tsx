import React, { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import theme from "@/constants/theme";
import { FollowedUser } from "@/services/ShareService";

interface ShareToUserSheetRef {
  present: (options: {
    users: FollowedUser[];
    loading: boolean;
    onSelect: (user: FollowedUser) => void;
  }) => void;
  dismiss: () => void;
}

const ShareToUserSheetComponent = () => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [users, setUsers] = useState<FollowedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [onSelect, setOnSelect] = useState<(user: FollowedUser) => void>(() => () => {});

  const snapPoints = useMemo(() => ["70%"], []);

  const present = useCallback((options: {
    users: FollowedUser[];
    loading: boolean;
    onSelect: (user: FollowedUser) => void;
  }) => {
    setUsers(options.users);
    setLoading(options.loading);
    setOnSelect(() => options.onSelect);
    bottomSheetRef.current?.present();
  }, []);

  const dismiss = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  React.useEffect(() => {
    registerShareToUserSheet(present);
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

  const handleSelect = useCallback((user: FollowedUser) => {
    dismiss();
    setTimeout(() => onSelect(user), 250);
  }, [dismiss, onSelect]);

  const renderItem = useCallback(({ item }: { item: FollowedUser }) => {
    const displayName = item.displayName ?? item.username;
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleSelect(item)}
        activeOpacity={0.6}
      >
        <View style={styles.avatar}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase() ?? "?"}</Text>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.userHandle}>@{item.username}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.COLORS.textMuted} />
      </TouchableOpacity>
    );
  }, [handleSelect]);

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
        <Text style={styles.title}>Share to</Text>

        {loading ? (
          <View style={{ paddingVertical: theme.SPACING.xxxxl, alignItems: "center" }}>
            <ActivityIndicator size="large" color={theme.COLORS.primary} />
          </View>
        ) : users.length === 0 ? (
          <View style={{ paddingVertical: theme.SPACING.xxxxl, alignItems: "center" }}>
            <Text style={{ color: theme.COLORS.textMuted }}>No followed users yet</Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </BottomSheetModal>
  );
};

let globalPresent: ((options: {
  users: FollowedUser[];
  loading: boolean;
  onSelect: (user: FollowedUser) => void;
}) => void) | null = null;

export function registerShareToUserSheet(presentFn: (options: {
  users: FollowedUser[];
  loading: boolean;
  onSelect: (user: FollowedUser) => void;
}) => void) {
  globalPresent = presentFn;
}

export function presentShareToUserSheet(options: {
  users: FollowedUser[];
  loading: boolean;
  onSelect: (user: FollowedUser) => void;
}) {
  if (globalPresent) {
    globalPresent(options);
  }
}

export default ShareToUserSheetComponent;

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
    marginBottom: theme.SPACING.md,
  },
  listContent: {
    paddingBottom: theme.SPACING.md,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.COLORS.primary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  userHandle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginTop: 2,
  },
});
