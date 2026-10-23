// Navigation acknowledgements arrive before the new YouTube document reports playback.
export class PlaybackTransition {
  constructor(clock = Date.now) { this.clock = clock; this.pending = null; }
  begin(track, previousUrl) {
    this.pending = {...track, previousUrl, expires: this.clock() + 20000, sawGap: false};
  }
  clear() { this.pending = null; }
  update(current) {
    const pending = this.pending;
    if (!pending) return {loading: null, expired: false};
    if (this.clock() >= pending.expires) { this.clear(); return {loading: null, expired: true}; }
    if (!current) pending.sawGap = true;
    if (current?.url === pending.url && (pending.previousUrl !== pending.url || pending.sawGap)) {
      this.clear(); return {loading: null, expired: false};
    }
    return {loading: pending, expired: false};
  }
}
