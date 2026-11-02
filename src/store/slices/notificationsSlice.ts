import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { ACTIVITY_PAGE_SIZE, uniqueActivity, type ActivityItem, type ActivityPage } from "@/services/NotificationService";
import { logout, setCredentials } from "./authSlice";

export type ActivityScope = { accountId: string; session: number };
export type ActivityLoad = "initial" | "refresh" | "sync" | "next";
type PendingRead = { ids: string[]; delta: number; version: number; all: boolean };
export interface NotificationsState {
  accountId: string | null;
  /** Auth session, including logout → same-account login in one render. */
  session: number;
  items: ActivityItem[];
  seenIds: Record<string, true>;
  rowVersions: Record<string, number>;
  version: number;
  unreadCount: number;
  unreadKnown: boolean;
  total: number;
  page: number;
  hasMore: boolean;
  initialized: boolean;
  loading: boolean;
  refreshing: boolean;
  syncing: boolean;
  paginating: boolean;
  error: string | null;
  paginationError: string | null;
  readError: string | null;
  pendingReads: Record<string, PendingRead>;
  readAllPending: boolean;
  needsReadRevalidation: boolean;
  connected: boolean;
  foreground: boolean;
}
function fresh(accountId: string | null = null, session = 0): NotificationsState {
  return { accountId, session, items: [], seenIds: {}, rowVersions: {}, version: 0,
    unreadCount: 0, unreadKnown: false, total: 0, page: 0, hasMore: false, initialized: false,
    loading: false, refreshing: false, syncing: false, paginating: false,
    error: null, paginationError: null, readError: null, pendingReads: {}, readAllPending: false, needsReadRevalidation: false,
    connected: false, foreground: true };
}
export const emptyNotifications = fresh();
function owns(state: NotificationsState, scope: ActivityScope) {
  return state.accountId === scope.accountId && state.session === scope.session;
}
function confirmAllRead(state: NotificationsState) {
  const unread = state.items.filter(item => !item.isRead);
  if (unread.length) {
    const version = ++state.version;
    for (const item of unread) { item.isRead = true; state.rowVersions[item.id] = version; }
  }
  state.needsReadRevalidation = false;
}
const notificationsSlice = createSlice({
  name: "notifications",
  initialState: fresh(),
  reducers: {
    activityAccountChanged(state, action: PayloadAction<string | null>) {
      if (state.accountId !== action.payload) return fresh(action.payload, state.session);
    },
    activityConnection(state, action: PayloadAction<ActivityScope & { connected: boolean; foreground: boolean }>) {
      if (!owns(state, action.payload)) return;
      state.connected = action.payload.connected;
      state.foreground = action.payload.foreground;
    },
    activityLoadStarted(state, action: PayloadAction<ActivityScope & { kind: ActivityLoad }>) {
      if (!owns(state, action.payload)) return;
      const kind = action.payload.kind;
      state.loading = kind === "initial" && !state.initialized;
      state.refreshing = kind === "refresh";
      state.syncing = kind === "sync";
      state.paginating = kind === "next";
      if (kind === "next") state.paginationError = null;
      else state.error = null;
    },
    activityPageReceived(state, action: PayloadAction<ActivityScope & { result: ActivityPage; kind: ActivityLoad; version: number }>) {
      const { result, kind, version } = action.payload;
      if (!owns(state, action.payload)) return;
      const settled = state.version === version && !Object.keys(state.pendingReads).length;
      const readStateChanged = settled && state.initialized && result.unreadCount !==
        Math.max(0, state.unreadCount + result.total - state.total);
      const invalidReadTail = state.needsReadRevalidation || readStateChanged;
      const current = new Map(state.items.map(item => [item.id, item]));
      const pendingIds = new Set(Object.values(state.pendingReads).flatMap(operation => operation.ids));
      const fetched = result.items.map(item => {
        const previous = current.get(item.id);
        return previous && (pendingIds.has(item.id) || (state.rowVersions[item.id] ?? 0) > version)
          ? { ...item, isRead: previous.isRead } : item;
      });
      // Offset pagination has no snapshot/cursor token. If a refreshed prefix
      // overlaps the old REST prefix, its retained tail is still contiguous.
      // After a larger missed burst, replace the prefix instead of retaining a
      // hidden gap or pretending an old page number still points at the same rows.
      const overlaps = fetched.some(item => current.get(item.id)?.hydrated);
      const tail = kind === "next" || (overlaps && (!invalidReadTail || result.unreadCount === 0))
        ? state.items
        : state.items.filter(item => !item.hydrated && (state.rowVersions[item.id] ?? 0) > version);
      state.items = uniqueActivity([...fetched, ...tail]);
      for (const item of fetched) state.seenIds[item.id] = true;
      state.initialized = true;
      state.total = Math.max(result.total, state.items.length);
      // Floor intentionally rereads a partial boundary page; ID dedupe removes
      // overlap without skipping older rows when new records shift offsets.
      state.page = kind === "next" ? result.page : Math.max(1, Math.floor(state.items.length / ACTIVITY_PAGE_SIZE));
      state.hasMore = result.total > state.items.length;
      state.needsReadRevalidation = kind === "next" && invalidReadTail && result.unreadCount > 0;
      if (settled) {
        state.unreadCount = result.unreadCount;
        state.unreadKnown = true;
        // Zero is authoritative for the whole account, including a retained
        // deep tail after another device's read-all. Nonzero changes cannot
        // identify which older rows changed, so rebuild rather than invent flags.
        if (!result.unreadCount) confirmAllRead(state);
      }
      state.error = null;
      state.paginationError = null;
    },
    activityLoadFailed(state, action: PayloadAction<ActivityScope & { kind: ActivityLoad; message: string }>) {
      if (!owns(state, action.payload)) return;
      if (action.payload.kind === "next") state.paginationError = action.payload.message;
      else state.error = action.payload.message;
    },
    activityLoadFinished(state, action: PayloadAction<ActivityScope>) {
      if (!owns(state, action.payload)) return;
      state.loading = state.refreshing = state.syncing = state.paginating = false;
    },
    activityUnreadReceived(state, action: PayloadAction<ActivityScope & { count: number; version: number }>) {
      if (!owns(state, action.payload) || state.version !== action.payload.version || Object.keys(state.pendingReads).length) return;
      state.unreadCount = action.payload.count;
      state.unreadKnown = true;
      if (!action.payload.count) confirmAllRead(state);
    },
    receiveActivity(state, action: PayloadAction<ActivityScope & { item: ActivityItem }>) {
      const { item } = action.payload;
      if (!owns(state, action.payload) || state.seenIds[item.id]) return;
      state.seenIds[item.id] = true;
      state.rowVersions[item.id] = ++state.version;
      let oldest: ActivityItem | undefined;
      for (let index = state.items.length - 1; index >= 0; index--) {
        if (state.items[index].hydrated) { oldest = state.items[index]; break; }
      }
      if (state.initialized && oldest && (Date.parse(item.createdAt) < Date.parse(oldest.createdAt) ||
          (item.createdAt === oldest.createdAt && item.id < oldest.id))) {
        // An old at-least-once envelope outside the loaded prefix may already be
        // included in the server's count/read-all. It cannot establish a new
        // contiguous page or unread delta. REST reconciles it without a fake row.
        return;
      }
      const items = uniqueActivity([item, ...state.items]);
      // Before the tab is opened, retain only a small live preview; durable
      // history is loaded by page, not accumulated eagerly during a long session.
      state.items = state.initialized ? items : items.slice(0, ACTIVITY_PAGE_SIZE);
      state.unreadCount += 1;
      state.total += 1;
    },
    activityReadStarted(state, action: PayloadAction<ActivityScope & { operation: string; ids: string[]; all: boolean }>) {
      const { operation, ids, all } = action.payload;
      if (!owns(state, action.payload) || state.pendingReads[operation]) return;
      const targets = new Set(ids);
      const changed = state.items.filter(item => !item.isRead && (all || targets.has(item.id)));
      const version = ++state.version;
      const delta = all ? state.unreadCount : Math.min(state.unreadCount, changed.length);
      state.pendingReads[operation] = { ids: changed.map(item => item.id), delta, version, all };
      for (const item of changed) {
        item.isRead = true;
        state.rowVersions[item.id] = version;
      }
      state.unreadCount = Math.max(0, state.unreadCount - delta);
      state.readAllPending ||= all;
      state.readError = null;
    },
    activityReadFinished(state, action: PayloadAction<ActivityScope & { operation: string; error?: string }>) {
      const { operation, error } = action.payload;
      if (!owns(state, action.payload)) return;
      const pending = state.pendingReads[operation];
      if (!pending) return;
      const version = ++state.version;
      const targets = new Set(pending.ids);
      for (const item of state.items) {
        if (targets.has(item.id) && state.rowVersions[item.id] === pending.version) {
          item.isRead = !error;
          state.rowVersions[item.id] = version;
        }
      }
      if (error) {
        // Add back only this operation's delta, never a stale whole-list/count
        // snapshot. Concurrent arrivals and other successful reads survive.
        state.unreadCount += pending.delta;
        state.readError = error;
      }
      delete state.pendingReads[operation];
      if (pending.all) state.readAllPending = false;
    },
  },
  extraReducers: builder => {
    builder.addCase(logout, state => fresh(null, state.session + 1));
    builder.addCase(setCredentials, (state, action) => {
      if (state.accountId !== action.payload.user.id) return fresh(action.payload.user.id, state.session + 1);
    });
  },
});
export const { activityAccountChanged, activityConnection, activityLoadStarted, activityPageReceived,
  activityLoadFailed, activityLoadFinished, activityUnreadReceived, receiveActivity,
  activityReadStarted, activityReadFinished } = notificationsSlice.actions;
export default notificationsSlice.reducer;
