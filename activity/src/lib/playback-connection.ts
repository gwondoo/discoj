// Queue reads are not playback heartbeats. Only confirmed state/stream traffic renews freshness.
export class PlaybackConnection {
  private receivedAt: number | null = null;
  private clock: () => number;
  readonly grace: number;
  constructor(clock = Date.now, grace = 30000) { this.clock = clock; this.grace = grace; }
  received() { this.receivedAt = this.clock(); }
  reset() { this.receivedAt = null; }
  get healthy() { return this.receivedAt !== null && this.clock() - this.receivedAt < this.grace; }
}
