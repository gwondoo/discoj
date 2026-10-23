// A post-write read must start after any pre-write read has finished.
export class FreshRead {
  constructor(load) { this.load = load; this.pending = null; }
  async run(force = false) {
    const previous = this.pending;
    if (previous) {
      if (!force) return previous;
      try { await previous; } catch {}
      if (this.pending && this.pending !== previous) return this.pending;
    }
    const flight = Promise.resolve().then(() => this.load());
    this.pending = flight;
    try { return await flight; }
    finally { if (this.pending === flight) this.pending = null; }
  }
}
