// Keep changes local until a pointer/key gesture completes. No debounce timer.
export class VolumeGesture {
  private pointer = false;
  private dirty = false;
  private draft: (value: number) => void;
  private commit: () => unknown;
  private discard: () => void;
  constructor(draft: (value: number) => void, commit: () => unknown, discard: () => void) {
    this.draft = draft; this.commit = commit; this.discard = discard;
  }
  change(value: number) { this.dirty = true; this.draft(value); }
  pointerDown() { this.pointer = true; }
  pointerUp() { if (!this.pointer) return; this.pointer = false; this.finish(); }
  keyUp(key: string) {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(key)) this.finish();
  }
  blur() { if (!this.pointer) this.finish(); }
  lostCapture() { if (this.pointer) this.cancel(); }
  cancel() { this.pointer = false; this.dirty = false; this.discard(); }
  private finish() { if (!this.dirty) return; this.dirty = false; void this.commit(); }
}
