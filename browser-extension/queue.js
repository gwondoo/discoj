// Pure queue decisions: updating a snapshot never touches the video element.
(() => {
  class Queue {
    constructor() { this.items = []; this.current = null; this.before = new Set(); this.playlistId = null; this.positionKnown = false; }
    restore(cursor, playlistId, current) {
      if (!cursor || cursor.playlistId !== playlistId || cursor.current !== current ||
          !Array.isArray(cursor.before) || !cursor.before.every(id => /^[\w-]{11}$/.test(id))) return;
      this.playlistId = playlistId; this.current = current;
      this.before = new Set(cursor.before); this.positionKnown = cursor.positionKnown === true;
    }
    cursor() {
      return {playlistId: this.playlistId, current: this.current,
              before: [...this.before], positionKnown: this.positionKnown};
    }
    update(snapshot, current) {
      if (snapshot.playlistId !== this.playlistId) { this.before = new Set(); this.items = []; this.current = null; this.positionKnown = false; }
      this.playlistId = snapshot.playlistId;
      if (current !== this.current) { this.before = new Set(); this.positionKnown = false; }
      const previousIndex = this.items.findIndex(item => item.video_id === current);
      if (previousIndex >= 0) { this.before = new Set(this.items.slice(0, previousIndex + 1).map(item => item.video_id)); this.positionKnown = true; }
      this.current = current;
      this.items = snapshot.items.filter(item => /^[\w-]{11}$/.test(item.video_id));
      const index = this.items.findIndex(item => item.video_id === current);
      if (index >= 0) { this.before = new Set(this.items.slice(0, index + 1).map(item => item.video_id)); this.positionKnown = true; }
    }
    next() {
      const index = this.items.findIndex(item => item.video_id === this.current);
      return index >= 0 ? this.items[index + 1] : this.positionKnown ? this.items.find(item => !this.before.has(item.video_id) && item.video_id !== this.current) : undefined;
    }
    previous() {
      const index = this.items.findIndex(item => item.video_id === this.current);
      return index > 0 ? this.items[index - 1] : null;
    }
  }
  globalThis.DiscoJQueue = Queue;
})();
