import React, { useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import { Notification, NotificationType } from '@/types';

type FilterTab = 'all' | 'unread';

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'LIKE',
    content: 'liked your post',
    isRead: false,
    userId: 'u1',
    actorId: 'u2',
    resourceId: 'p1',
    createdAt: new Date(Date.now() - 1000 * 60 * 5),
  },
  {
    id: '2',
    type: 'COMMENT',
    content: 'commented on your photo',
    isRead: false,
    userId: 'u1',
    actorId: 'u3',
    resourceId: 'p2',
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: '3',
    type: 'FOLLOW',
    content: 'started following you',
    isRead: true,
    userId: 'u1',
    actorId: 'u4',
    resourceId: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: '4',
    type: 'MESSAGE',
    content: 'sent you a message',
    isRead: false,
    userId: 'u1',
    actorId: 'u5',
    resourceId: 'c1',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
  {
    id: '5',
    type: 'MENTION',
    content: 'mentioned you in a comment',
    isRead: true,
    userId: 'u1',
    actorId: 'u6',
    resourceId: 'p3',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
  {
    id: '6',
    type: 'LIKE',
    content: 'liked your comment',
    isRead: true,
    userId: 'u1',
    actorId: 'u7',
    resourceId: 'cm1',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
  },
];

const AVATAR_COLORS = [
  theme.COLORS.primary,
  theme.COLORS.accentBlue,
  theme.COLORS.accentPurple,
  theme.COLORS.secondary,
  theme.COLORS.indigo,
];

const ICON_MAP: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  LIKE: 'heart',
  COMMENT: 'chatbubble',
  FOLLOW: 'person-add',
  MESSAGE: 'mail',
  MENTION: 'at',
};

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getAvatarColor(actorId: string | null): string {
  if (!actorId) return theme.COLORS.primary;
  let hash = 0;
  for (let i = 0; i < actorId.length; i++) {
    hash = actorId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitial(actorId: string | null): string {
  if (!actorId) return '?';
  return actorId.charAt(0).toUpperCase();
}

export default function NotificationsScreen() {
  const [filter, setFilter] = React.useState<FilterTab>('all');

  const notifications = React.useMemo(() => MOCK_NOTIFICATIONS, []);

  const filtered = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, filter]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => {
      const iconName = ICON_MAP[item.type] || 'notifications';
      const avatarColor = getAvatarColor(item.actorId);
      const initial = getInitial(item.actorId);

      return (
        <Pressable style={[styles.item, !item.isRead && styles.itemUnread]}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={[styles.iconBadge, { backgroundColor: theme.COLORS.bgWhite }]}>
              <Ionicons name={iconName} size={14} color={theme.COLORS.primary} />
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.textRow}>
              <Text style={styles.contentText}>
                <Text style={styles.actorName}>{item.actorId ? `User ${item.actorId.slice(0, 5)}` : 'Someone'}</Text>
                <Text style={styles.contentSuffix}> {item.content}</Text>
              </Text>
            </View>
            <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
          </View>

          {!item.isRead && <View style={styles.unreadDot} />}
        </Pressable>
      );
    },
    [],
  );

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="notifications-off-outline" size={48} color={theme.COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No notifications</Text>
        <Text style={styles.emptySubtitle}>
          {filter === 'unread'
            ? "You're all caught up!"
            : 'When you get notifications, they will show up here'}
        </Text>
      </View>
    );
  }, [filter]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, filter === 'all' && styles.tabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>
            All
          </Text>
          {filter === 'all' && <View style={styles.tabIndicator} />}
        </Pressable>
        <Pressable
          style={[styles.tab, filter === 'unread' && styles.tabActive]}
          onPress={() => setFilter('unread')}
        >
          <Text style={[styles.tabText, filter === 'unread' && styles.tabTextActive]}>
            Unread
          </Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
          {filter === 'unread' && <View style={styles.tabIndicator} />}
        </Pressable>
      </View>

      {/* List */}
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContent : styles.listContent}
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
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
  markAllBtn: {
    paddingVertical: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
  },
  markAllText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.primary,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    borderBottomWidth: theme.BORDER.width.xs,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgLight,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.xs,
    paddingVertical: theme.SPACING.md,
    marginRight: theme.SPACING.xxl,
    position: 'relative',
  },
  tabActive: {
    // active state container
  },
  tabText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: theme.COLORS.textMuted,
  },
  tabTextActive: {
    color: theme.COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.COLORS.primary,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.SPACING.xs,
  },
  badgeText: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textWhite,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: theme.SPACING.sm,
  },
  emptyContent: {
    flex: 1,
  },
  separator: {
    height: theme.BORDER.width.xs,
    backgroundColor: theme.COLORS.borderDivider,
    marginLeft: theme.LAYOUT.contentPadding + theme.SIZING.avatarMd + theme.SPACING.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    backgroundColor: theme.COLORS.bgLight,
  },
  itemUnread: {
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: theme.SPACING.md,
  },
  avatar: {
    width: theme.SIZING.avatarMd,
    height: theme.SIZING.avatarMd,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textWhite,
  },
  iconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: theme.BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.COLORS.bgLight,
    ...theme.SHADOWS.sm,
  },
  content: {
    flex: 1,
  },
  textRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  contentText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
  },
  actorName: {
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  contentSuffix: {
    color: theme.COLORS.textSecondary,
  },
  timestamp: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginTop: theme.SPACING.xs,
  },
  unreadDot: {
    width: theme.SIZING.dot,
    height: theme.SIZING.dot,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    marginLeft: theme.SPACING.sm,
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
