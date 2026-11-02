import type { ChatListItem } from "./listItems";
interface ListHandle {
  scrollToIndex: (options: {
    index: number;
    animated: boolean;
    viewPosition: number;
  }) => void;
  scrollToOffset: (options: { offset: number; animated: boolean }) => void;
}
interface Frame {
  index: number;
  y: number;
  height: number;
}
/** Explicit navigation only. Native MVCP remains the sole history anchor.
 * Stable IDs, measured cell coordinates, and momentum/layout events replace
 * timeout/RAF retry chains and fixed-height getItemLayout guesses. */
export class ReplyNavigator {
  private items: ChatListItem[] = [];
  private frames = new Map<string, Frame>();
  private target: string | null = null;
  private aligned = false;
  private attempts = 0;
  private estimate = -1;
  private visible = new Set<string>();
  private serial = 0;
  private lastIndex = -1;
  private moving = false;
  private progressSignature = "";
  constructor(
    private options: {
      list: () => ListHandle | null;
      height: () => number;
      arrived: (localId: string, serial: number) => void;
      failed: () => void;
    } = {
      list: () => null,
      height: () => 0,
      arrived: () => {},
      failed: () => {},
    },
  ) {}
  configure(options: typeof this.options) {
    this.options = options;
  }
  private locate() {
    return this.items.findIndex(
      (item) =>
        item.kind === "message" &&
        (item.message.localId === this.target ||
          item.message.id === this.target),
    );
  }
  get pending() {
    return this.target !== null;
  }
  update(items: ChatListItem[]) {
    this.items = items;
    if (this.target && this.locate() !== this.lastIndex) {
      this.aligned = false;
      this.seek();
    }
  }
  request(id: string) {
    this.target = id;
    this.aligned = false;
    this.attempts = 0;
    this.estimate = -1;
    this.lastIndex = -1;
    this.seek();
  }
  cancel() {
    this.target = null;
    this.aligned = false;
  }
  measure(id: string, index: number, y: number, height: number) {
    if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) return;
    this.frames.set(id, { index, y, height });
    if (this.target && !this.aligned && this.locate() === index) this.seek();
  }
  unmeasure(id: string) {
    this.frames.delete(id);
  }
  private seek() {
    if (!this.target) return;
    const index = this.locate();
    if (index < 0 || this.options.height() <= 0) return; // Cache/network loading will call update with the target.
    this.lastIndex = index;
    const item = this.items[index];
    const frame = this.frames.get(item.id);
    if (frame && frame.index === index) {
      this.aligned = true;
      if (item.kind === "message" && this.visible.has(item.message.localId)) {
        this.checkArrival();
        return;
      }
      const offset = Math.max(
        0,
        frame.y - Math.max(0, this.options.height() - frame.height) * 0.35,
      );
      this.options.list()?.scrollToOffset({ offset, animated: true });
      this.checkArrival();
    } else
      this.options
        .list()
        ?.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
  }
  indexFailed(averageItemLength: number) {
    if (!this.target) return false;
    const index = this.locate();
    if (index < 0) return true;
    const offset = Math.max(0, index * averageItemLength);
    // Rendering/measurement can finish after momentum ends. An unchanged
    // estimate is a reason to await native progress, not fail or scroll again.
    if (Math.abs(offset - this.estimate) < 1) return true;
    if (++this.attempts > 4 || !Number.isFinite(offset)) {
      this.cancel();
      this.options.failed();
      return true;
    }
    this.estimate = offset;
    this.options.list()?.scrollToOffset({ offset, animated: true });
    return true;
  }
  viewable(localIds: string[]) {
    this.visible = new Set(localIds);
    this.checkArrival();
  }
  started() {
    this.moving = true;
  }
  progress(ids: string[]) {
    const signature = ids.join(":");
    if (signature === this.progressSignature) return;
    this.progressSignature = signature;
    if (this.target && !this.aligned && !this.moving) this.seek();
  }
  settled() {
    this.moving = false;
    if (this.target && !this.aligned) this.seek();
    else this.checkArrival();
  }
  private checkArrival() {
    if (!this.target || !this.aligned) return;
    const index = this.locate(),
      item = this.items[index];
    if (item?.kind !== "message" || !this.visible.has(item.message.localId))
      return;
    const id = item.message.localId;
    this.cancel();
    this.options.arrived(id, ++this.serial);
  }
}
