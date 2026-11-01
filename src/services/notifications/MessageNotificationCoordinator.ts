import type { MessageRow } from "../../db/schema";
import type { RoomWithReceiver } from "../ConversationService";
import { MessageBannerQueue, messageBanner } from "./MessageBannerQueue";

interface Scope { accountId: string; enabled: boolean; active: boolean; conversationId: string | null; ready: boolean }
export interface MessageNotificationSource {
  on(event: string, callback: (payload: any) => void): () => void;
}
export interface MessageNotificationDependencies {
  socket: MessageNotificationSource;
  getRoom(id: string, fresh?: boolean): Promise<RoomWithReceiver | null>;
  navigate(room: RoomWithReceiver): void;
  unavailable(message: string, retry?: () => void): void;
  setAccount(id: string): void;
}
interface Destination { conversationId: string; accountId: string; consumed?: () => void; failed?: () => void }
const initial: Scope = { accountId: "", enabled: true, active: false, conversationId: null, ready: false };
export class MessageNotificationCoordinator {
  readonly banners = new MessageBannerQueue();
  private scope = initial;
  private suspendedAccount: string | null = null;
  private running = false;
  private generation = 0;
  private presentation = 0;
  private retryPaused = false;
  private releases: (() => void)[] = [];
  private pending: Destination | null = null;
  private opening: Destination | null = null;
  private processing = Promise.resolve();
  constructor(private deps: MessageNotificationDependencies) {}
  getAccountId() { return this.scope.accountId; }
  acceptsForeground(accountId: string) { return this.running && this.scope.accountId === accountId && this.scope.enabled && this.scope.active; }
  start() {
    if (this.running) return;
    this.running = true;
    this.releases = [
      this.deps.socket.on("message:incoming", row => this.receive(row)),
      this.deps.socket.on("message:deleted", payload => this.banners.removeMessage(payload?.messageId)),
      this.deps.socket.on("message:deleted-for-me", payload => this.banners.removeMessage(payload?.messageId)),
      this.deps.socket.on("conversation:deleted", payload => {
        // A different participant deleting their copy does not delete ours.
        if (payload?.userId === this.scope.accountId) this.banners.removeConversation(payload.conversationId);
      }),
    ];
  }
  stop() {
    for (const release of this.releases) release();
    this.running = false; this.releases = []; this.generation++; this.banners.clear();
  }
  prepareLogout() {
    this.suspendedAccount = this.scope.accountId; this.generation++; this.presentation++;
    this.pending = null; this.retryPaused = false; this.banners.clear(true);
    this.scope = { ...this.scope, enabled: false, ready: false };
  }
  update(next: Scope) {
    if (this.suspendedAccount && next.accountId === this.suspendedAccount) next = { ...next, enabled: false, ready: false };
    else this.suspendedAccount = null;
    if (next.active !== this.scope.active || next.enabled !== this.scope.enabled || next.conversationId !== this.scope.conversationId) this.presentation++;
    if (next.accountId !== this.scope.accountId) {
      this.generation++; this.banners.clear(true); this.processing = Promise.resolve();
      this.deps.setAccount(next.accountId);
    }
    this.scope = next;
    if (!next.enabled || !next.active || !next.accountId) this.banners.clear();
    else if (next.conversationId) this.banners.removeConversation(next.conversationId);
    void this.openPending();
  }
  receive(row: MessageRow) {
    const scope = this.scope;
    if (!scope.accountId || !row?.id || row.senderId === scope.accountId || row.deletedAt || row.isRead ||
      !this.banners.remember(row.id)) return;
    if (!scope.enabled || !scope.active || scope.conversationId === row.conversationId) return;
    const generation = this.generation, presentation = this.presentation;
    // Serialize presentation enrichment only; never block socket persistence or receipts.
    this.processing = this.processing.then(async () => {
      if (generation !== this.generation) return;
      const room = await this.deps.getRoom(row.conversationId);
      const now = this.scope;
      if (generation !== this.generation || presentation !== this.presentation || !room || room.muted || !now.enabled || !now.active ||
        now.conversationId === row.conversationId) return;
      this.banners.enqueue(messageBanner(row, room));
    }).catch(() => { /* A metadata failure must not break message delivery or show a guessed sender/group. */ });
  }
  async refreshPreference(id: string) {
    const generation = this.generation;
    const room = await this.deps.getRoom(id).catch(() => null);
    if (generation === this.generation && room?.muted) this.banners.removeConversation(id);
  }
  openConversation(conversationId: string, accountId: string, consumed?: () => void, failed?: () => void) {
    if (this.suspendedAccount === accountId) { consumed?.(); return; }
    this.retryPaused = false;
    this.pending = { conversationId, accountId, consumed, failed };
    this.banners.removeConversation(conversationId);
    void this.openPending();
  }
  private finish(target: Destination) {
    if (this.pending === target) this.pending = null;
    target.consumed?.();
  }
  private async openPending() {
    const target = this.pending, scope = this.scope;
    if (!this.running || !target || this.retryPaused || this.opening || !scope.ready || !scope.active || !scope.accountId) return;
    if (target.accountId !== scope.accountId) { this.finish(target); return; }
    if (scope.conversationId === target.conversationId) { this.finish(target); return; }
    const generation = this.generation;
    this.opening = target;
    try {
      const room = await this.deps.getRoom(target.conversationId, true);
      if (generation !== this.generation || this.pending !== target || !this.scope.ready || !this.scope.active) return;
      if (this.scope.conversationId === target.conversationId) { this.finish(target); return; }
      if (!room) {
        this.finish(target);
        this.deps.unavailable("This conversation is no longer available. It may have been deleted, or you may no longer be a member.");
      } else {
        this.deps.navigate(room);
        this.finish(target);
      }
    } catch {
      if (generation === this.generation && this.pending === target) {
        // Keep the destination for a deliberate retry, including a cold-start tap.
        this.retryPaused = true;
        target.failed?.();
        this.deps.unavailable("Couldn’t open this conversation. Check your connection and try again.", () => { this.retryPaused = false; void this.openPending(); });
      }
    } finally {
      this.opening = null;
      if (this.pending && !this.retryPaused && this.scope.ready && this.scope.active) void this.openPending();
    }
  }
}
