import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import theme from '@/constants/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { notificationService } from '@/services/NotificationService';
import {
  setNotifications,
  setUnreadCount,
  markRead,
  markAllRead,
  setLoading,
  setError,
} from '@/store/slices/notificationsSlice';
import { Notification, NotificationType } from '@/types';

type FilterTab = 'all' | 'unread';

const ICON_MAP: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  LIKE: 'heart',
  COMMENT: 'chatbubble',
  FOLLOW: 'person-add',
  MESSAGE: 'mail',
  MENTION: 'at',
  SYSTEM: 'notifications',
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
  const colors = [
    theme.COLORS.primary,
    theme.COLORS.accentBlue,
    theme.COLORS.accentPurple,
    theme.COLORS.secondary,
    theme.COLORS.indigo,
  ];
  return colors[Math.abs(hash) % colors.length];
}

function getInitial(actorId: string | null): string {
  if (!actorId) return '?';
  return actorId.charAt(0).toUpperCase();
}

export default function NotificationsScreen() {
  const token = useAppSelector((s) => s.auth.token);
  const userId = useAppSelector((s) => s.auth.user?.id);
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.notifications.items);
  const unreadCount = useAppSelector((s) => s.notifications.unreadCount);
  const loading = useAppSelector((s) => s.notifications.loading);
  const error = useAppSelector((s) => s.notifications.error);

  const [filter, setFilter] = React.useState<FilterTab>('all');

  const filtered = useMemo(() => {
    if (filter === 'unread') {
      return items.filter((n) => !n.isRead);
    }
    return items;
  }, [items, filter]);

  const fetchNotifications = useCallback(async () => {
    if (!token || !userId) return;
    dispatch(setLoading(true));
    dispatch(setError(null));
    try {
      const page = await notificationService.getNotifications(token);
      dispatch(setNotifications(page.notifications));
      dispatch(setUnreadCount(page.unreadCount));
    } catch (err: any) {
      dispatch(setError(err.message ?? 'Failed to load notifications'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [token, userId, dispatch]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await notificationService.markAllRead(token);
      dispatch(markAllRead());
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  }, [token, dispatch]);

  const handleItemPress = useCallback(
    (item: Notification) => {
      if (!item.isRead) {
        notificationService.markRead(token ?? '', item.id).catch(() => {});
        dispatch(markRead(item.id));
      }
      const actorUsername = item.user?.username;
      if (actorUsername) {
        router.push(`/user/${actorUsername}`);
      } else if (item.resourceId && (item.type === 'COMMENT' || item.type === 'LIKE' || item.type === 'MENTION')) {
        router.push(`/posts/${item.resourceId}/comments`);
      } else if (item.type === 'MESSAGE') {
        router.push('/(chatRoom)/messages');
      }
    },
    [token, dispatch, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => {
      const iconName = ICON_MAP[item.type] || 'notifications';
      const avatarColor = getAvatarColor(item.actorId);
      const initial = getInitial(item.actorId);
      const actorName = item.user?.displayName || item.user?.username || 'Someone';

      return (
        <Pressable
          style={[styles.item, !item.isRead && styles.itemUnread]}
          onPress={() => handleItemPress(item)}
        >
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
                <Text style={styles.actorName}>{actorName}</Text>
                <Text style={styles.contentSuffix}> {item.content}</Text>
              </Text>
            </View>
            <Text style={styles.timestamp}>{formatTimestamp(new Date(item.createdAt))}</Text>
          </View>

          {!item.isRead && <View style={styles.unreadDot} />}
        </Pressable>
      );
    },
    [handleItemPress],
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

  if (error && items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Activity</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRefresh}>
            <Text style={{ color: theme.COLORS.primary }}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>Activity</Text>
        {unreadCount > 0 ? (
          <Pressable style={styles.markAllBtn} onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

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
          {filter === 'unread' && unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
          {filter === 'unread' && <View style={styles.tabIndicator} />}
        </Pressable>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={filtered.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={onRefresh}
              tintColor={theme.COLORS.primary}
              colors={[theme.COLORS.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.LAYOUT.contentPadding,
  },
  errorText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.danger,
    marginBottom: theme.SPACING.md,
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
