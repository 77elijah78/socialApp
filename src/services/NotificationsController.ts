import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import type { AppStateStatus } from "react-native";
import { ApiError } from "./api";
import { ACTIVITY_PAGE_SIZE, normalizeNotificationEvent, type NotificationApi } from "./NotificationService";
import { activityAccountChanged, activityConnection, activityLoadStarted, activityPageReceived,
  activityLoadFailed, activityLoadFinished, activityUnreadReceived, receiveActivity,
  activityReadStarted, activityReadFinished, type ActivityLoad, type ActivityScope,
  type NotificationsState } from "@/store/slices/notificationsSlice";

export interface NotificationStore {
  dispatch: Dispatch<UnknownAction>;
  getState(): { auth: { token: string | null; user: { id: string } | null }; notifications: NotificationsState };
}
export interface ActivitySocket {
  on(event: string, listener: (payload?: unknown) => void): () => void;
  isConnected(): boolean;
}
export interface ActivityAppState {
  currentState: AppStateStatus;
  addEventListener(event: "change", listener: (state: AppStateStatus) => void): { remove(): void };
}
type SyncKind = Exclude<ActivityLoad, "next">;
const priority: Record<SyncKind, number> = { sync: 0, initial: 1, refresh: 2 };
function failure(cause: unknown) {
  if (cause instanceof ApiError && (cause.status === 404 || cause.status === 405))
    return "Activity isn’t available on this server yet. The Activity backend release is required.";
  return cause instanceof Error ? cause.message : "Couldn’t reach the server. Please retry.";
}

/** Request/listener coordinator only. All UI data stays in the existing Redux
 * slice. One instance per Redux store; never opens a second Socket.IO client.
 * Requests are single-flight, cancellable, and guarded against account ABA. */
export class NotificationsController {
  private epoch = 0;
  private owner: ActivityScope | null = null;
  private active = false;
  private opened = false;
  private releases: (() => void)[] = [];
  private aborts = new Set<AbortController>();
  private listFlight: Promise<void> | null = null;
  private syncFlight: Promise<void> | null = null;
  private requested: SyncKind | null = null;
  private reads = new Map<string, Promise<void>>();
  private allFlight: Promise<void> | null = null;
  private operation = 0;

  constructor(private store: NotificationStore, private remote: NotificationApi,
    private socket: ActivitySocket, private app: ActivityAppState) {}

  private current(epoch = this.epoch): boolean {
    const state = this.store.getState();
    return epoch === this.epoch && !!this.owner && state.auth.user?.id === this.owner.accountId &&
      !!state.auth.token && state.notifications.accountId === this.owner.accountId && state.notifications.session === this.owner.session;
  }
  private state() { return this.store.getState().notifications; }
  private token() { return this.store.getState().auth.token!; }
  private abortable() { const controller = new AbortController(); this.aborts.add(controller); return controller; }
  private publishConnection() {
    if (this.current()) this.store.dispatch(activityConnection({ ...this.owner!, connected: this.socket.isConnected(), foreground: this.active }));
  }

  start(accountId: string): () => void {
    this.stop();
    this.store.dispatch(activityAccountChanged(accountId));
    this.owner = { accountId, session: this.state().session };
    this.active = this.app.currentState === "active";
    const epoch = this.epoch;
    this.publishConnection();
    this.releases = [
      this.socket.on("connect", () => {
        if (!this.current(epoch)) return;
        this.publishConnection();
        void this.synchronize();
      }),
      this.socket.on("disconnect", () => { if (this.current(epoch)) this.publishConnection(); }),
      // SocketReceiver forwards native connect_error as its existing "error".
      // A failed token reconnect must not leave a stale "Live" indicator.
      this.socket.on("error", () => { if (this.current(epoch)) this.publishConnection(); }),
      this.socket.on("notification:new", payload => {
        if (!this.current(epoch)) return;
        if (this.active) {
          const item = normalizeNotificationEvent(payload);
          if (item) this.store.dispatch(receiveActivity({ ...this.owner!, item }));
        }
        // Legacy events without IDs still invalidate REST. In background, do no
        // network/list work; resume recovers missed rows and cross-device reads.
        void this.synchronize();
      }),
    ];
    const subscription = this.app.addEventListener("change", next => {
        if (!this.current(epoch)) return;
        const resumed = !this.active && next === "active";
        this.active = next === "active";
        this.publishConnection();
        if (resumed) void this.synchronize();
        else if (!this.active) {
          // Mutations already explicitly requested by the user may finish.
          // Only list/count requests are cancelled by foreground state below.
          this.listAbort?.abort();
          this.countAbort?.abort();
        }
      });
    this.releases.push(() => subscription.remove());
    void this.synchronize(); // small unread request; history stays lazy until opened
    return () => { if (epoch === this.epoch) this.stop(); };
  }
  stop(): void {
    this.epoch += 1;
    for (const release of this.releases) release();
    this.releases = [];
    for (const abort of this.aborts) abort.abort();
    this.aborts.clear();
    if (this.owner) {
      const state = this.state();
      if (state.accountId === this.owner.accountId && state.session === this.owner.session) {
        for (const operation of Object.keys(state.pendingReads)) this.store.dispatch(activityReadFinished({
          ...this.owner, operation, error: "The read update was interrupted. Refresh to check its status.",
        }));
        this.store.dispatch(activityLoadFinished(this.owner));
      }
    }
    this.listAbort = this.countAbort = null;
    this.listFlight = this.syncFlight = this.allFlight = null;
    this.reads.clear();
    this.requested = null;
    this.owner = null;
    this.opened = false;
    this.active = false;
  }
  private listAbort: AbortController | null = null;
  private countAbort: AbortController | null = null;

  open = (expected?: ActivityScope): Promise<void> => {
    if (expected && (!this.current() || expected.accountId !== this.owner?.accountId || expected.session !== this.owner?.session))
      return Promise.resolve();
    this.opened = true;
    return this.synchronize(this.state().initialized ? "sync" : "initial");
  };
  refresh = (): Promise<void> => {
    this.opened = true;
    return this.synchronize(this.state().initialized ? "refresh" : "initial");
  };

  /** Coalesce bursts without polling, arbitrary delays, or competing fetch owners. */
  synchronize = (kind: SyncKind = "sync"): Promise<void> => {
    if (!this.current()) return Promise.resolve();
    if (!this.requested || priority[kind] > priority[this.requested]) this.requested = kind;
    if (!this.active) return Promise.resolve();
    if (this.syncFlight) return this.syncFlight;
    const epoch = this.epoch;
    const work = (async () => {
      while (this.current(epoch) && this.active && this.requested) {
        const next = this.requested;
        this.requested = null;
        if (this.listFlight) await this.listFlight;
        if (!this.current(epoch) || !this.active) break;
        if (this.opened || this.state().initialized) await this.fetchPage(next);
        else await this.fetchUnread();
      }
    })();
    this.syncFlight = work;
    void work.finally(() => {
      if (epoch !== this.epoch) return;
      this.syncFlight = null;
      // A signal can arrive between the drain's last await and this finalizer.
      // Do not strand that invalidation on an already-settled promise.
      if (this.requested && this.active && this.current(epoch)) void this.synchronize(this.requested);
    }).catch(() => {});
    return work;
  };

  private async fetchUnread(): Promise<void> {
    const epoch = this.epoch, scope = this.owner!, version = this.state().version;
    // No count snapshot can identify which in-flight optimistic writes it includes.
    // Reconcile once all writes settle instead of double-subtracting their deltas.
    if (Object.keys(this.state().pendingReads).length) return;
    const abort = this.abortable();
    this.countAbort = abort;
    try {
      const count = await this.remote.unread(this.token(), abort.signal);
      if (this.current(epoch) && this.active && !abort.signal.aborted) {
        this.store.dispatch(activityUnreadReceived({ ...scope, count, version }));
      }
    } catch {
      // Do not put a blocking error on an unopened tab. Opening uses the actual
      // list endpoint and exposes a retryable error, never a false empty history.
    } finally {
      this.aborts.delete(abort);
      if (this.countAbort === abort) this.countAbort = null;
    }
  }

  private fetchPage(kind: ActivityLoad): Promise<void> {
    if (this.listFlight) return this.listFlight;
    if (!this.current() || !this.active) return Promise.resolve();
    const epoch = this.epoch, scope = this.owner!, version = this.state().version;
    const page = kind === "next" ? this.state().page + 1 : 1;
    // Revalidate up to 100 recent rows in one backend-supported request, not
    // traverse every historical page on every event. Reducer retains a proven
    // contiguous old tail, or resets the prefix after a larger missed burst.
    const limit = kind === "next" ? ACTIVITY_PAGE_SIZE
      : ACTIVITY_PAGE_SIZE * Math.min(5, Math.max(1, this.state().page));
    const abort = this.abortable();
    this.listAbort = abort;
    this.store.dispatch(activityLoadStarted({ ...scope, kind }));
    const work = (async () => {
      try {
        const result = await this.remote.list(scope.accountId, this.token(), page, limit, abort.signal);
        if (!this.current(epoch) || !this.active || abort.signal.aborted) return;
        this.store.dispatch(activityPageReceived({ ...scope, result, kind, version }));
        // A pagination response can reveal another device's older read changes.
        // Rebuild the head before treating an unverified retained tail as current.
        if (kind === "next" && this.state().needsReadRevalidation) void this.synchronize();
      } catch (cause) {
        if (this.current(epoch) && this.active && !abort.signal.aborted)
          this.store.dispatch(activityLoadFailed({ ...scope, kind, message: failure(cause) }));
      } finally {
        this.aborts.delete(abort);
        if (this.current(epoch)) this.store.dispatch(activityLoadFinished(scope));
        if (epoch === this.epoch) this.listFlight = null;
        if (this.listAbort === abort) this.listAbort = null;
      }
    })();
    this.listFlight = work;
    return work;
  }
  loadMore = (retry = false): Promise<void> => {
    if (this.syncFlight) return this.syncFlight;
    if (this.listFlight) return this.listFlight;
    const state = this.state();
    if (!state.initialized || !state.hasMore || state.loading || (!retry && state.paginationError)) return Promise.resolve();
    return this.fetchPage("next");
  };

  markRead = (id: string): Promise<void> => {
    const existing = this.reads.get(id);
    if (existing) return existing;
    if (!this.current() || this.state().items.find(item => item.id === id)?.isRead !== false) return Promise.resolve();
    const work = this.writeRead([id], false);
    this.reads.set(id, work);
    void work.finally(() => { if (this.reads.get(id) === work) this.reads.delete(id); }).catch(() => {});
    return work;
  };
  markAllRead = (): Promise<void> => {
    if (this.allFlight) return this.allFlight;
    if (!this.current() || !this.state().unreadCount) return Promise.resolve();
    // UI disables read-all during individual writes; keep this guard for rapid
    // double taps/programmatic calls so rollback scopes never overlap.
    if (this.reads.size) return Promise.resolve();
    const epoch = this.epoch;
    const work = this.writeRead([], true);
    this.allFlight = work;
    void work.finally(() => { if (epoch === this.epoch && this.allFlight === work) this.allFlight = null; }).catch(() => {});
    return work;
  };
  private async writeRead(ids: string[], all: boolean): Promise<void> {
    const epoch = this.epoch, scope = this.owner!, operation = `${epoch}:${++this.operation}`;
    const abort = this.abortable();
    this.store.dispatch(activityReadStarted({ ...scope, operation, ids, all }));
    let error: string | undefined;
    try {
      if (all) await this.remote.readAll(this.token(), abort.signal);
      else await this.remote.read(ids, this.token(), abort.signal);
    } catch (cause) {
      error = failure(cause);
    } finally {
      this.aborts.delete(abort);
    }
    if (!this.current(epoch)) return;
    this.store.dispatch(activityReadFinished({ ...scope, operation, error }));
    // Both failure and success can race a server commit/cross-device read. A fresh
    // REST snapshot resolves ambiguous writes without pretending emission saved it.
    if (!Object.keys(this.state().pendingReads).length) void this.synchronize();
    if (error) throw new Error(error);
  }
}
