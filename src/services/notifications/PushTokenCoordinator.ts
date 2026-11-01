export interface PushIdentity { accountId: string; authToken: string }
export interface PushRegistration {
  register(expoPushToken: string, identity: PushIdentity): Promise<void>;
  revoke(expoPushToken: string, identity: PushIdentity): Promise<void>;
}
export interface PushPermission { granted: boolean; canAskAgain: boolean }
export interface PushNativeClient {
  capability(): { available: boolean; explanation?: string };
  permission(request: boolean): Promise<PushPermission>;
  token(): Promise<string>;
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
  private stopped = false;
  private initialized = false;
  constructor(private native: PushNativeClient, private backend: PushRegistration | null) {}
  setBackend(backend: PushRegistration) { this.backend = backend; void this.refresh(); }
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
    const oldAccount = this.identity?.accountId;
    const changed = identity?.accountId !== oldAccount || enabled !== this.enabled;
    this.identity = identity; this.enabled = enabled; this.stopped = false;
    if (changed) this.epoch++;
    if (identity && this.registered?.identity.accountId === identity.accountId) this.registered.identity = identity;
    if (identity && oldAccount && oldAccount !== identity.accountId) void this.revoke().catch(() => {});
    if (!identity || !enabled) {
      this.publish("disabled", "Message notifications are off.");
      if (changed || first) void this.revoke().catch(() => {
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
    this.suspendedAccount = this.identity?.accountId ?? this.suspendedAccount;
    this.identity = null; this.enabled = false;
    this.publish("disabled", "Message notifications are off.");
    return this.revoke();
  }
  async revoke() {
    this.epoch++;
    await this.clearRegistration();
  }
  private async clearRegistration() {
    const registered = this.registered; this.registered = null;
    await this.mutate(async () => {
      try { if (registered && this.backend) await this.backend.revoke(registered.token, registered.identity); }
      finally { if (!this.nativeDisabled) { await this.native.unregister(); this.nativeDisabled = true; } }
    });
  }
  stop() { this.stopped = true; this.epoch++; }
  refresh(requestPermission = false): Promise<void> {
    if (this.work) { this.repeat = true; return this.work; }
    const identity = this.identity, epoch = this.epoch;
    const current = () => !this.stopped && epoch === this.epoch && identity?.accountId === this.identity?.accountId && this.enabled;
    if (!identity || !this.enabled || this.stopped) return Promise.resolve();
    const work = (async () => {
      const capability = this.native.capability();
      if (!capability.available) { this.publish("unsupported", capability.explanation ?? "System notifications are unavailable in this build."); return; }
      this.publish("syncing", "Checking notification permissions…");
      try {
        const permission = await this.native.permission(requestPermission);
        if (!current()) return;
        if (!permission.granted) {
          if (this.registered) await this.clearRegistration();
          if (!current()) return;
          this.publish(permission.canAskAgain ? "permission-required" : "denied", permission.canAskAgain
            ? "Allow notifications to receive messages when SocialApp is closed." : "Notifications are blocked. Enable them in Android/iOS settings.");
          return;
        }
        await this.mutate(async () => {
          if (!current()) return;
          // Native unregister/token acquisition are ordered too: an old logout
          // must not invalidate a token just acquired by a new account.
          const token = await this.native.token();
          this.nativeDisabled = false;
          if (!current()) return;
          if (!this.backend) {
            this.publish("backend-required", "Native push is configured, but this server release does not provide push registration yet.");
            return;
          }
          const registeredIdentity = { ...identity, authToken: this.identity?.authToken ?? identity.authToken };
          await this.backend.register(token, registeredIdentity);
          if (!current()) {
            await this.backend.revoke(token, registeredIdentity);
            return;
          }
          this.registered = { token, identity: this.identity! };
        });
        if (current() && this.registered) this.publish("ready", "System notifications are enabled on this device.");
      } catch {
        if (current()) this.publish("error", "Couldn’t synchronize system notifications. Check your connection and native FCM configuration, then retry.");
      }
    })();
    this.work = work;
    void work.finally(() => {
      if (this.work === work) this.work = null;
      if (this.repeat && !this.stopped) { this.repeat = false; void this.refresh(); }
    }).catch(() => {});
    return work;
  }
}
