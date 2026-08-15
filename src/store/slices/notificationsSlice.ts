import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Notification } from '@/types';

interface NotificationsState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const initialState: NotificationsState = {
  items: [],
  unreadCount: 0,
  loading: false,
  error: null,
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setNotifications(state, action: PayloadAction<Notification[]>) {
      state.items = action.payload;
    },
    setUnreadCount(state, action: PayloadAction<number>) {
      state.unreadCount = action.payload;
    },
    incrementUnreadCount(state) {
      state.unreadCount += 1;
    },
    addNotification(state, action: PayloadAction<Notification>) {
      state.items.unshift(action.payload);
      if (!action.payload.isRead) {
        state.unreadCount += 1;
      }
    },
    markRead(state, action: PayloadAction<string>) {
      const id = action.payload;
      const item = state.items.find((n) => n.id === id);
      if (item && !item.isRead) {
        item.isRead = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllRead(state) {
      state.items.forEach((n) => {
        n.isRead = true;
      });
      state.unreadCount = 0;
    },
    clearNotifications() {
      return initialState;
    },
  },
});

export const {
  setLoading,
  setError,
  setNotifications,
  setUnreadCount,
  incrementUnreadCount,
  addNotification,
  markRead,
  markAllRead,
  clearNotifications,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
