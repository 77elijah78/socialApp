export interface VisibilityScope { accountId: string; deviceId: string | null; active: boolean; conversationId: string | null }
export interface VisibilityTransport {
  connected(): boolean;
  send(scope: VisibilityScope): void;
}
/** Backend's real 45-second viewing lease, refreshed every 15 seconds ONLY for a
 * focused foreground chat. This is not message READ or an app-wide online flag. */
export class PushVisibilityCoordinator {
  private scope: VisibilityScope = { accountId: "", deviceId: null, active: false, conversationId: null };
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private transport: VisibilityTransport) {}
  update(next: VisibilityScope, force = false) {
    const old = this.scope;
    const changed = old.accountId !== next.accountId || old.deviceId !== next.deviceId || old.active !== next.active || old.conversationId !== next.conversationId;
    if (!changed && !force) return;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (old.deviceId && (old.deviceId !== next.deviceId || old.accountId !== next.accountId))
      this.transport.send({ ...old, active: false, conversationId: null });
    this.scope = next;
    this.send();
    if (next.accountId && next.deviceId && next.active && next.conversationId && this.transport.connected())
      this.timer = setInterval(() => this.send(), 15_000);
  }
  private send() { if (this.scope.accountId && this.scope.deviceId && this.transport.connected()) this.transport.send(this.scope); }
  reconnect() { this.update(this.scope, true); }
  disconnect() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  stop() { this.disconnect(); this.transport.send({ ...this.scope, active: false, conversationId: null }); this.scope = { accountId: "", deviceId: null, active: false, conversationId: null }; }
}
