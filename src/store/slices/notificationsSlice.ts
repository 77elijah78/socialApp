import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  normalizeLiveActivity,
  type LiveActivity,
} from "@/services/NotificationService";
import { logout, setCredentials } from "./authSlice";

type State = { accountId: string | null; items: LiveActivity[] };
const initialState: State = { accountId: null, items: [] };
const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    activityAccountChanged(state, action: PayloadAction<string | null>) {
      if (state.accountId !== action.payload)
        return { accountId: action.payload, items: [] };
    },
    receiveActivity(
      state,
      action: PayloadAction<{
        accountId: string;
        payload: unknown;
        receivedAt: number;
      }>,
    ) {
      if (state.accountId !== action.payload.accountId) return;
      const item = normalizeLiveActivity(
        action.payload.payload,
        action.payload.receivedAt,
      );
      if (!item) return;
      const index = state.items.findIndex(
        (previous) => previous.clientKey === item.clientKey,
      );
      if (index >= 0) {
        // Coalesce matching deliveries, not fabricated distinct events. Without a
        // backend ID we cannot distinguish redelivery from a repeat real action.
        item.occurrences += state.items[index].occurrences;
        state.items.splice(index, 1);
      }
      state.items.unshift(item);
      state.items = state.items.slice(0, 100);
    },
    clearActivity(state) {
      state.items = [];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => initialState);
    builder.addCase(setCredentials, (state, action) => {
      if (state.accountId !== action.payload.user.id)
        return { accountId: action.payload.user.id, items: [] };
    });
  },
});
export const { activityAccountChanged, receiveActivity, clearActivity } =
  notificationsSlice.actions;
export default notificationsSlice.reducer;
