import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import { useAppSelector } from '@/store/hooks';
import { router } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = theme.SPACING.sm;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - theme.LAYOUT.listPaddingHorizontal * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

type ProfileTab = 'posts' | 'media' | 'likes';

interface MenuItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
}

export default function ProfileScreen() {
  const user = useAppSelector((state) => state.auth.user);

  const displayName = user?.displayName || user?.username || 'User';
  const username = user?.username ? `@${user.username}` : '';
  const avatarUrl = user?.avatarUrl || null;

  const [activeTab, setActiveTab] = React.useState<ProfileTab>('posts');
  const [stats] = React.useState({ posts: 128, followers: 2450, following: 482 });

  const menuItems: MenuItem[] = React.useMemo(
    () => [
      {
        id: 'edit',
        label: 'Edit Profile',
        icon: 'create-outline',
        onPress: () => {},
      },
      {
        id: 'bookmarks',
        label: 'Bookmarks',
        icon: 'bookmark-outline',
        onPress: () => router.push('/bookmarks'),
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: 'settings-outline',
        onPress: () => router.push('/settings'),
      },
      {
        id: 'logout',
        label: 'Log Out',
        icon: 'log-out-outline',
        onPress: () => {},
        danger: true,
      },
    ],
    [],
  );

  const renderHeader = useCallback(() => {
    return (
      <View>
        {/* Cover Image */}
        <View style={styles.coverContainer}>
          <View style={styles.coverPlaceholder}>
            <Ionicons name="images-outline" size={40} color={theme.COLORS.textMuted} />
          </View>
          <Pressable style={styles.coverEditBtn}>
            <Ionicons name="camera" size={16} color={theme.COLORS.textWhite} />
          </Pressable>
        </View>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Pressable style={styles.avatarEditBtn}>
              <Ionicons name="camera" size={14} color={theme.COLORS.textWhite} />
            </Pressable>
          </View>
        </View>

        {/* User Info */}
        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{displayName}</Text>
            {user?.id && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={theme.COLORS.primary} />
              </View>
            )}
          </View>
          {username ? <Text style={styles.username}>{username}</Text> : null}
          <Text style={styles.bio}>Building something amazing. Stay tuned!</Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <Pressable style={styles.statItem}>
              <Text style={styles.statValue}>{stats.posts}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(stats.followers)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(stats.following)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </Pressable>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Edit Profile</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton}>
              <Ionicons name="share-outline" size={20} color={theme.COLORS.textPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['posts', 'media', 'likes'] as ProfileTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={
                  tab === 'posts'
                    ? 'grid-outline'
                    : tab === 'media'
                    ? 'images-outline'
                    : 'heart-outline'
                }
                size={22}
                color={activeTab === tab ? theme.COLORS.primary : theme.COLORS.textMuted}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab && styles.tabLabelActive,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [displayName, username, avatarUrl, user?.id, stats, activeTab]);

  const renderGridItem = useCallback(() => {
    return (
      <Pressable style={styles.gridItem}>
        <View style={styles.gridPlaceholder}>
          <Ionicons name="image-outline" size={24} color={theme.COLORS.textMuted} />
        </View>
      </Pressable>
    );
  }, []);

  const renderMenuList = useCallback(() => {
    return (
      <View style={styles.menuSection}>
        <Text style={styles.menuTitle}>Account</Text>
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.id}
              style={[
                styles.menuItem,
                index !== menuItems.length - 1 && styles.menuItemBorder,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <View
                  style={[
                    styles.menuIconContainer,
                    item.danger && styles.menuIconDanger,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={
                      item.danger
                        ? theme.COLORS.danger
                        : theme.COLORS.textSecondary
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.menuLabel,
                    item.danger && styles.menuLabelDanger,
                  ]}
                >
                  {item.label}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.COLORS.textMuted}
              />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [menuItems]);

  const renderEmptyState = useCallback(() => {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name={activeTab === 'likes' ? 'heart-outline' : 'images-outline'}
          size={48}
          color={theme.COLORS.textMuted}
        />
        <Text style={styles.emptyTitle}>No {activeTab} yet</Text>
        <Text style={styles.emptySubtitle}>
          {activeTab === 'posts'
            ? 'Share your first post to see it here'
            : activeTab === 'media'
            ? 'Photos and videos will appear here'
            : 'Posts you like will show up here'}
        </Text>
      </View>
    );
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable style={styles.headerIconBtn}>
          <Ionicons name="settings-outline" size={22} color={theme.COLORS.textPrimary} />
        </Pressable>
      </View>

      <FlatList
        style={styles.list}
        data={[]}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={
          <View style={styles.footer}>
            {renderMenuList()}
            <View style={{ height: theme.SPACING.xxxxl }} />
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={renderGridItem}
        keyExtractor={(_, index) => index.toString()}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListEmptyComponent={renderEmptyState}
      />
    </SafeAreaView>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgLight,
    ...theme.SHADOWS.xl,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.xs,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: theme.SPACING.xxxxxl,
  },
  coverContainer: {
    width: '100%',
    height: 120,
    backgroundColor: theme.COLORS.bgInput,
    position: 'relative',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgChat,
  },
  coverEditBtn: {
    position: 'absolute',
    bottom: theme.SPACING.sm,
    right: theme.SPACING.md,
    width: 32,
    height: 32,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.SHADOWS.sm,
  },
  avatarContainer: {
    marginTop: -theme.SIZING.avatarXl / 2,
    alignSelf: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: theme.SIZING.avatarXl,
    height: theme.SIZING.avatarXl,
    borderRadius: theme.BORDER_RADIUS.full,
    borderWidth: theme.BORDER.width.sm,
    borderColor: theme.COLORS.bgWhite,
  },
  avatarPlaceholder: {
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.primary,
  },
  avatarEditBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.COLORS.bgWhite,
  },
  infoSection: {
    alignItems: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.xs,
  },
  displayName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
  },
  verifiedBadge: {
    marginLeft: theme.SPACING.xs,
  },
  username: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
  },
  bio: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.sm,
    textAlign: 'center',
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
  },
  statLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
  },
  statDivider: {
    width: theme.BORDER.width.xs,
    height: 32,
    backgroundColor: theme.COLORS.borderDivider,
    marginHorizontal: theme.SPACING.lg,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.md,
    marginTop: theme.SPACING.md,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    height: theme.SIZING.buttonHeight,
    borderRadius: theme.BORDER_RADIUS.lg,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.SHADOWS.primary,
  },
  primaryButtonText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textOnPrimary,
  },
  secondaryButton: {
    width: theme.SIZING.buttonHeight,
    height: theme.SIZING.buttonHeight,
    borderRadius: theme.BORDER_RADIUS.lg,
    backgroundColor: theme.COLORS.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: theme.SPACING.lg,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.SPACING.xs,
    paddingVertical: theme.SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.COLORS.primary,
  },
  tabLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: theme.COLORS.textMuted,
    textTransform: 'capitalize',
  },
  tabLabelActive: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  gridRow: {
    gap: GRID_GAP,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    borderRadius: theme.BORDER_RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: theme.COLORS.bgInput,
  },
  gridPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.COLORS.bgChat,
  },
  footer: {
    marginTop: theme.SPACING.xxxxl,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },
  menuSection: {
    marginBottom: theme.SPACING.xxxxl,
  },
  menuTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.sm,
    marginBottom: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.xs,
  },
  menuCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    ...theme.SHADOWS.sm,
    borderWidth: theme.BORDER.width.xs,
    borderColor: theme.COLORS.borderDivider,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  menuItemBorder: {
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.md,
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconDanger: {
    backgroundColor: theme.COLORS.dangerLight,
  },
  menuLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textPrimary,
  },
  menuLabelDanger: {
    color: theme.COLORS.danger,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.SPACING.xxxxxl * 2,
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  emptyTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
    marginTop: theme.SPACING.md,
  },
  emptySubtitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    marginTop: theme.SPACING.xs,
    textAlign: 'center',
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
});
