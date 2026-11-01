/** Domain target, not a claimed backend wire schema. Only the inspected backend
 * adapter may decode a remote payload into these account-owned message IDs. */
export interface MessagePushTarget { accountId: string; conversationId: string; messageId: string; notificationId?: string }
export interface PushEnvelope { id: string; action: string; data: unknown }
export interface MessagePushPort {
  onResponse(listener: (response: PushEnvelope) => void): () => void;
  onReceived(listener: (data: unknown) => void): () => void;
  lastResponse(): PushEnvelope | null;
  clearResponse(id: string): void;
}
export class MessagePushBridge {
  private releases: (() => void)[] = [];
  private responses = new Set<string>();
  private generation = 0;
  private jobs = new Set<string>();
  constructor(private native: MessagePushPort,
    private decode: (data: unknown) => MessagePushTarget | null | Promise<MessagePushTarget | null>,
    private open: (target: MessagePushTarget, consumed: () => void, failed: () => void) => void,
    private receive: (target: MessagePushTarget) => void,
    private rejected?: (error: unknown, consumed: () => void) => void) {}
  start() {
    if (this.releases.length) return;
    const generation = ++this.generation;
    this.releases = [this.native.onResponse(this.respond), this.native.onReceived(data => {
      try {
        const value = this.decode(data);
        if (value instanceof Promise) void value.then(target => { if (generation === this.generation && target) this.receive(target); }).catch(() => {});
        else if (value) this.receive(value);
      } catch { /* Unknown/ambiguous data is not a synthetic message. */ }
    })];
    // Register first: a tap delivered during initialization cannot fall between
    // a get-last call and subscribing. A single response is deduped across both.
    const last = this.native.lastResponse(); if (last) this.respond(last);
  }
  stop() { this.generation++; for (const release of this.releases) release(); this.releases = []; }
  private respond = (response: PushEnvelope) => {
    if (response.action !== "default" || this.responses.has(response.id)) return;
    const generation = this.generation;
    this.responses.add(response.id);
    while (this.responses.size > 128) this.responses.delete(this.responses.values().next().value!);
    const consume = () => this.native.clearResponse(response.id);
    const apply = (target: MessagePushTarget | null) => {
      if (generation !== this.generation) { this.responses.delete(response.id); return; }
      if (target) {
        const job = target.notificationId ? `${target.accountId}:${target.notificationId}` : null;
        if (job && this.jobs.has(job)) { consume(); return; }
        if (job) { this.jobs.add(job); while (this.jobs.size > 256) this.jobs.delete(this.jobs.values().next().value!); }
        this.open(target, consume, () => { this.responses.delete(response.id); if (job) this.jobs.delete(job); });
      } else this.responses.delete(response.id);
    };
    const fail = (error: unknown) => {
      this.responses.delete(response.id);
      if (generation === this.generation) this.rejected?.(error, consume);
    };
    try {
      const value = this.decode(response.data);
      if (value instanceof Promise) void value.then(apply).catch(fail); else apply(value);
    } catch (error) { fail(error); }
  };
}
