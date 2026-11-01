import { PushSetupError } from "./PushBackendService";
export interface PushIdentity { accountId: string; authToken: string }
export interface PushRegistration {
  register(expoPushToken: string, identity: PushIdentity): Promise<void>;
  beforeToken?(identity: PushIdentity): Promise<void>;
  revoke(expoPushToken: string, identity: PushIdentity): Promise<void>;
  revokeCurrent?(identity: PushIdentity | null): Promise<void>;
}
export interface PushPermission { granted: boolean; canAskAgain: boolean }
export interface AndroidPushDeviceToken { type: "android"; data: string }
const sameDeviceToken = (a: AndroidPushDeviceToken | null, b: AndroidPushDeviceToken) => a?.data === b.data;
function deviceToken(value: unknown): AndroidPushDeviceToken | null {
  if (!value || typeof value !== "object") return null;
  const token = value as { type?: unknown; data?: unknown };
  return token.type === "android" && typeof token.data === "string" && token.data.length > 0
    ? { type: "android", data: token.data } : null;
}
export interface PushNativeClient {
  capability(): { available: boolean; explanation?: string };
  permission(request: boolean): Promise<PushPermission>;
  deviceToken?(): Promise<AndroidPushDeviceToken>;
  token(devicePushToken?: AndroidPushDeviceToken): Promise<string>;
  unregister(): Promise<void>;
}
export interface PushStatus {
  state: "idle" | "disabled" | "unsupported" | "permission-required" | "denied" | "syncing" | "ready" | "error" | "backend-required";
  detail: string;
}
const idle: PushStatus = { state: "idle", detail: "Enable system notifications to receive messages when SocialApp is closed." };
/** API-neutral lifecycle. A real, inspected registration adapter is required for
 * ready; acquiring an Expo token alone is deliberately never reported as success. */
export class PushTokenCoordinator {
  private identity: PushIdentity | null = null;
  private suspendedAccount: string | null = null;
  private enabled = true;
  private epoch = 0;
  private status = idle;
  private listeners = new Set<() => void>();
  private nativeDisabled = false;
  private registered: { token: string; identity: PushIdentity } | null = null;
  private work: Promise<void> | null = null;
  private mutations: Promise<void> = Promise.resolve();
  private repeat = false;
  private repeatPermission = false;
  private pendingDeviceToken: AndroidPushDeviceToken | null = null;
  private observedDeviceToken: AndroidPushDeviceToken | null = null;
  private stopped = false;
  private initialized = false;
  constructor(private native: PushNativeClient, private backend: PushRegistration | null) {}
  setBackend(backend: PushRegistration) { this.backend = backend; void this.refresh(); }
  /** A native lookup itself emits this event on Android. Reuse its payload;
   * never route it back through a fresh lookup. Keep only the latest rotation. */
  deviceTokenChanged(value: unknown) {
    if (!this.identity || !this.enabled || this.stopped || this.suspendedAccount) return;
    const token = deviceToken(value);
    if (!token || sameDeviceToken(this.observedDeviceToken, token)) return;
    this.observedDeviceToken = token; this.pendingDeviceToken = token; this.nativeDisabled = false;
    if (!this.work) void this.refresh();
  }
  private clearDeviceTokens() { this.pendingDeviceToken = null; this.observedDeviceToken = null; }
  getSnapshot = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: PushStatus["state"], detail: string) {
    if (this.status.state === state && this.status.detail === detail) return;
    this.status = { state, detail }; for (const listener of this.listeners) listener();
  }
  update(identity: PushIdentity | null, enabled: boolean) {
    const first = !this.initialized, restarting = this.stopped; this.initialized = true;
    if (this.suspendedAccount && identity?.accountId === this.suspendedAccount) { identity = null; enabled = false; }
    else this.suspendedAccount = null;
    const oldIdentity = this.identity;
    const oldAccount = oldIdentity?.accountId;
    const changed = identity?.accountId !== oldAccount || enabled !== this.enabled;
    if (identity?.accountId !== oldAccount) { this.clearDeviceTokens(); this.repeatPermission = false; }
    this.identity = identity; this.enabled = enabled; this.stopped = false;
    if (changed) this.epoch++;
    if (identity && this.registered?.identity.accountId === identity.accountId) this.registered.identity = identity;
    if (identity && oldAccount && oldAccount !== identity.accountId) void this.revoke(oldIdentity).catch(() => {});
    if (!identity || !enabled) {
      this.publish("disabled", "Message notifications are off.");
      if (changed || first) void this.revoke(identity ?? oldIdentity).catch(() => {
        if (!this.identity || !this.enabled) this.publish("error", "Couldn’t disable system notifications. Retry from notification settings.");
      });
    } else if (changed || restarting || this.status.state === "idle") void this.refresh();
  }
  private mutate(task: () => Promise<void>) {
    const operation = this.mutations.then(task);
    this.mutations = operation.catch(() => {});
    return operation;
  }
  deactivate() {
    const identity = this.identity;
    this.suspendedAccount = identity?.accountId ?? this.suspendedAccount;
    this.identity = null; this.enabled = false;
    this.publish("disabled", "Message notifications are off.");
    return this.revoke(identity);
  }
  async revoke(identity = this.identity) {
    this.epoch++; this.clearDeviceTokens();
    await this.clearRegistration(identity);
  }
  private async clearRegistration(identity: PushIdentity | null = this.identity) {
    const registered = this.registered; this.registered = null;
    await this.mutate(async () => {
      try {
        if (registered && this.backend) await this.backend.revoke(registered.token, registered.identity);
        else await this.backend?.revokeCurrent?.(identity);
      }
      finally {
        this.clearDeviceTokens();
        try { if (!this.nativeDisabled) { await this.native.unregister(); this.nativeDisabled = true; } }
        finally { this.clearDeviceTokens(); }
      }
    });
  }
  stop() { this.stopped = true; this.epoch++; this.clearDeviceTokens(); this.repeat = false; this.repeatPermission = false; }
  refresh(requestPermission = false): Promise<void> {
    if (this.work) { this.repeat = true; this.repeatPermission ||= requestPermission; return this.work; }
    const identity = this.identity, epoch = this.epoch;
    const current = () => !this.stopped && epoch === this.epoch && identity?.accountId === this.identity?.accountId && this.enabled;
    if (!identity || !this.enabled || this.stopped) return Promise.resolve();
    const requestedToken = this.pendingDeviceToken; this.pendingDeviceToken = null;
    const work = (async () => {
      const capability = this.native.capability();
      if (!capability.available) { this.publish("unsupported", capability.explanation ?? "System notifications are unavailable in this build."); return; }
      this.publish("syncing", "Checking notification permissions…");
      try {
        const permission = await this.native.permission(requestPermission);
        if (!current()) return;
        if (!permission.granted) {
          if (this.registered || this.backend?.revokeCurrent) await this.clearRegistration(identity);
          if (!current()) return;
          this.publish(permission.canAskAgain ? "permission-required" : "denied", permission.canAskAgain
            ? "Allow notifications to receive messages when SocialApp is closed." : "Notifications are blocked. Enable them in Android/iOS settings.");
          return;
        }
        await this.mutate(async () => {
          if (!current()) return;
          // Native unregister/token acquisition are ordered too: an old logout
          // must not invalidate a token just acquired by a new account.
          this.publish("syncing", "Preparing notification registration…");
          await this.backend?.beforeToken?.(identity);
          if (!current()) return;
          let nativeToken = this.pendingDeviceToken ?? requestedToken;
          this.pendingDeviceToken = null;
          if (!nativeToken && this.native.deviceToken) {
            this.publish("syncing", "Getting Android push token…");
            this.nativeDisabled = false; // Native acquisition may succeed even if the later Expo request fails.
            nativeToken = deviceToken(await this.native.deviceToken());
            if (!current()) return;
            if (!nativeToken) throw new Error("Invalid native Android token");
          }
          if (nativeToken) {
            // Discard the lookup's echo, but retain a different token that rolled
            // while the lookup was in flight. Exchange that one next, not by
            // fetching FCM again from inside its own listener.
            if (sameDeviceToken(this.pendingDeviceToken, nativeToken)) this.pendingDeviceToken = null;
            if (!this.pendingDeviceToken) this.observedDeviceToken = nativeToken;
          }
          this.publish("syncing", "Registering token with Expo…");
          this.nativeDisabled = false;
          const token = await this.native.token(nativeToken ?? undefined);
          if (!current()) return;
          if (!this.backend) {
            this.publish("backend-required", "Native push is configured, but this server release does not provide push registration yet.");
            return;
          }
          const registeredIdentity = { ...identity, authToken: this.identity?.authToken ?? identity.authToken };
          this.publish("syncing", "Registering this device with the server…");
          await this.backend.register(token, registeredIdentity);
          if (!current()) {
            await this.backend.revoke(token, registeredIdentity);
            return;
          }
          this.registered = { token, identity: this.identity! };
        });
        if (current() && this.registered) this.publish("ready", "System notifications are enabled on this device.");
      } catch (error) {
        if (current()) this.publish("error", error instanceof PushSetupError ? error.message : "Couldn’t synchronize system notifications. Check your connection and native FCM configuration, then retry.");
      }
    })();
    this.work = work;
    void work.finally(() => {
      if (this.work === work) this.work = null;
      const repeat = this.repeat, requestPermission = this.repeatPermission;
      this.repeat = false; this.repeatPermission = false;
      if (!this.stopped && this.identity && this.enabled && (repeat || this.pendingDeviceToken)) void this.refresh(requestPermission);
    }).catch(() => {});
    return work;
  }
}
