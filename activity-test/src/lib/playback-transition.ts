import type {Current, Track} from './types.ts';

export interface PendingTrack extends Track {
  previousUrl: string | undefined;
  expires: number;
  sawGap: boolean;
}

// Navigation acknowledgements arrive before the new YouTube document reports playback.
export class PlaybackTransition {
  clock: () => number;
  pending: PendingTrack | null = null;

  constructor(clock: () => number = Date.now) { this.clock = clock; }

  begin(track: Track, previousUrl: string | undefined) {
    this.pending = {...track, previousUrl, expires: this.clock() + 20000, sawGap: false};
  }

  clear() { this.pending = null; }

  update(current: Pick<Current, 'url'> | null | undefined): {loading: PendingTrack | null, expired: boolean} {
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
