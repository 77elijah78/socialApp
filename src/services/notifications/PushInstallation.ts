export interface PushStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export const isPushUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export interface PushInstallationState {
  deviceId: string;
  firstOwnerId: string | null;
  lastOwnerId: string | null;
  registeredOwnerId: string | null;
  pendingOwnerId: string | null;
  origin: string | null;
  ambiguous: boolean;
}
const KEY = "message-push-installation-v1";
/** Encrypted installation metadata, not a message/auth store. No push token or
 * JWT is persisted. Keep the UUID on logout so the real server can revoke it. */
export class PushInstallation {
  private state: PushInstallationState | null = null;
  private loading: Promise<PushInstallationState> | null = null;
  private writes = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private storage: PushStorage, private uuid: () => string) {}
  peek = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  load(): Promise<PushInstallationState> {
    if (this.state) return Promise.resolve(this.state);
    if (this.loading) return this.loading;
    const work = (async () => {
      const raw = await this.storage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PushInstallationState;
        if (!isPushUuid(parsed.deviceId) || typeof parsed.ambiguous !== "boolean" ||
          [parsed.firstOwnerId, parsed.lastOwnerId, parsed.registeredOwnerId, parsed.pendingOwnerId].some(id => id !== null && !isPushUuid(id)) ||
          (parsed.origin !== null && typeof parsed.origin !== "string")) throw new Error("Invalid push installation state");
        this.state = parsed;
      } else {
        const deviceId = this.uuid();
        if (!isPushUuid(deviceId)) throw new Error("Native installation UUID is unavailable");
        const state: PushInstallationState = { deviceId, firstOwnerId: null, lastOwnerId: null, registeredOwnerId: null,
          pendingOwnerId: null, origin: null, ambiguous: false };
        await this.storage.setItem(KEY, JSON.stringify(state)); this.state = state;
      }
      return this.state;
    })();
    this.loading = work;
    void work.finally(() => { if (this.loading === work) this.loading = null; }).catch(() => {});
    return work;
  }
  change(update: (previous: PushInstallationState) => PushInstallationState) {
    const work = this.writes.then(async () => {
      const state = update(await this.load());
      await this.storage.setItem(KEY, JSON.stringify(state));
      this.state = state; for (const listener of this.listeners) listener();
      return state;
    });
    this.writes = work.then(() => {}, () => {}); return work;
  }
  attempt(owner: string, origin: string) {
    return this.change(state => ({ ...state, pendingOwnerId: owner,
      ambiguous: state.ambiguous || (!!state.origin && state.origin !== origin), origin }));
  }
  registered(owner: string, origin: string) {
    return this.change(state => ({ ...state, firstOwnerId: state.firstOwnerId ?? owner, lastOwnerId: owner,
      registeredOwnerId: owner, pendingOwnerId: null, origin,
      ambiguous: state.ambiguous || (!!state.firstOwnerId && state.firstOwnerId !== owner) || (!!state.origin && state.origin !== origin) }));
  }
  revoked(owner: string) {
    return this.change(state => ({ ...state,
      registeredOwnerId: state.registeredOwnerId === owner ? null : state.registeredOwnerId,
      pendingOwnerId: state.pendingOwnerId === owner ? null : state.pendingOwnerId }));
  }
}
