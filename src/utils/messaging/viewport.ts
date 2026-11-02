/**
 * Inverted timelines have an exact latest offset (0), even with variable rows.
 * Only layout/content measurements can request a sticky correction. Native
 * maintainVisibleContentPosition owns history anchoring; we never compensate it.
 */
export class LatestViewport {
  private height = 0;
  private contentHeight = 0;
  private lastCorrection = "";
  atLatest = true;
  interacting = false;
  hasInteracted = false;

  layout(height: number): boolean {
    this.height = height;
    return this.correction();
  }
  content(height: number): boolean {
    this.contentHeight = height;
    return this.correction();
  }
  private correction(): boolean {
    if (
      !this.atLatest ||
      this.interacting ||
      this.height <= 0 ||
      this.contentHeight <= 0
    )
      return false;
    const measurement = `${this.height}:${this.contentHeight}`;
    if (measurement === this.lastCorrection) return false;
    this.lastCorrection = measurement;
    return true;
  }
  beginInteraction() {
    this.hasInteracted = true;
    this.interacting = true;
  }
  userScroll(offset: number) {
    if (this.interacting) this.atLatest = Math.max(0, offset) <= 80;
  }
  endInteraction(offset: number) {
    this.userScroll(offset);
    this.interacting = false;
  }
  requestLatest(): boolean {
    this.atLatest = true;
    this.interacting = false;
    this.lastCorrection = "";
    return this.correction();
  }
  leaveLatest() {
    this.atLatest = false;
    this.lastCorrection = "";
  }
}
