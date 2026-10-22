// Pure queue decisions: updating a snapshot never touches the video element.
(() => {
  class Queue {
    constructor() { this.items = []; this.current = null; this.before = new Set(); this.playlistId = null; }
    update(snapshot, current) {
      if (snapshot.playlistId !== this.playlistId) { this.before = new Set(); this.items = []; this.current = null; }
      this.playlistId = snapshot.playlistId;
      if (current !== this.current) this.before = new Set();
      const previousIndex = this.items.findIndex(item => item.video_id === current);
      if (previousIndex >= 0) this.before = new Set(this.items.slice(0, previousIndex + 1).map(item => item.video_id));
      this.current = current;
      this.items = snapshot.items.filter(item => /^[\w-]{11}$/.test(item.video_id));
      const index = this.items.findIndex(item => item.video_id === current);
      if (index >= 0) this.before = new Set(this.items.slice(0, index + 1).map(item => item.video_id));
    }
    next() {
      const index = this.items.findIndex(item => item.video_id === this.current);
      return index >= 0 ? this.items[index + 1] : this.items.find(item => !this.before.has(item.video_id) && item.video_id !== this.current);
    }
    previous() {
      const index = this.items.findIndex(item => item.video_id === this.current);
      return index > 0 ? this.items[index - 1] : null;
    }
  }
  globalThis.DiscoJQueue = Queue;
})();
