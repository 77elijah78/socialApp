/** Domain target, not a claimed backend wire schema. Only the inspected backend
 * adapter may decode a remote payload into these account-owned message IDs. */
export interface MessagePushTarget { accountId: string; conversationId: string; messageId: string }
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
  constructor(private native: MessagePushPort,
    private decode: (data: unknown) => MessagePushTarget | null,
    private open: (target: MessagePushTarget, consumed: () => void, failed: () => void) => void,
    private receive: (target: MessagePushTarget) => void) {}
  start() {
    if (this.releases.length) return;
    this.releases = [this.native.onResponse(this.respond), this.native.onReceived(data => {
      const target = this.decode(data); if (target) this.receive(target);
    })];
    // Register first: a tap delivered during initialization cannot fall between
    // a get-last call and subscribing. A single response is deduped across both.
    const last = this.native.lastResponse(); if (last) this.respond(last);
  }
  stop() { for (const release of this.releases) release(); this.releases = []; }
  private respond = (response: PushEnvelope) => {
    const target = this.decode(response.data);
    if (!target || response.action !== "default" || this.responses.has(response.id)) return;
    this.responses.add(response.id);
    while (this.responses.size > 128) this.responses.delete(this.responses.values().next().value!);
    this.open(target, () => this.native.clearResponse(response.id), () => this.responses.delete(response.id));
  };
}
