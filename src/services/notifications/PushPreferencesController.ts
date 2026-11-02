import type { PushIdentity } from "./PushTokenCoordinator";
import type { PushPreferences } from "./PushBackendService";
interface PreferencesApi {
  preferences(owner: PushIdentity): Promise<PushPreferences>;
  updatePreferences(owner: PushIdentity, patch: Partial<PushPreferences>): Promise<PushPreferences>;
}
export interface PushPreferencesState { accountId: string; data: PushPreferences | null; loading: boolean; saving: boolean; error: string | null }
export class PushPreferencesController {
  private owner: PushIdentity | null = null;
  private epoch = 0;
  private state: PushPreferencesState = { accountId: "", data: null, loading: false, saving: false, error: null };
  private listeners = new Set<() => void>();
  private flight: Promise<void> | null = null;
  constructor(private api: PreferencesApi) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(patch: Partial<PushPreferencesState>) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(); }
  update(owner: PushIdentity | null) {
    const changed = owner?.accountId !== this.owner?.accountId; this.owner = owner;
    if (changed) {
      this.epoch++; this.flight = null;
      this.publish({ accountId: owner?.accountId ?? "", data: null, loading: false, saving: false, error: null });
      if (owner) void this.refresh();
    }
  }
  refresh(): Promise<void> {
    if (this.flight) return this.flight;
    const owner = this.owner, epoch = this.epoch;
    if (!owner || this.state.saving) return Promise.resolve();
    this.publish({ loading: true });
    const work = this.api.preferences(owner).then(data => {
      if (epoch === this.epoch) this.publish({ data, error: null });
    }).catch(() => { if (epoch === this.epoch) this.publish({ error: "Couldn’t load account push preferences. Retry when connected." }); })
      .finally(() => { if (this.flight === work) this.flight = null; if (epoch === this.epoch) this.publish({ loading: false }); });
    this.flight = work; return work;
  }
  async change(patch: Partial<PushPreferences>) {
    const owner = this.owner, previous = this.state.data;
    if (!owner || !previous || this.state.saving) return;
    // Invalidate any earlier GET so it cannot overwrite this user's choice.
    this.epoch++; const mutationEpoch = this.epoch; this.flight = null;
    this.publish({ data: { ...previous, ...patch }, saving: true, loading: false, error: null });
    try {
      const data = await this.api.updatePreferences(owner, patch);
      if (mutationEpoch === this.epoch) this.publish({ data });
    } catch {
      if (mutationEpoch === this.epoch) this.publish({ data: previous, error: "Couldn’t save this preference. Your previous setting was restored." });
    } finally { if (mutationEpoch === this.epoch) this.publish({ saving: false }); }
  }
}
