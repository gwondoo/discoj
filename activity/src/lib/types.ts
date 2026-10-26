export interface Current {
  title: string;
  url: string;
  state: 'playing' | 'paused';
  volume: number;
  repeatMode?: 'all' | 'one';
  // Playback progress (seconds), reported by the playing tab. See DESIGN.md "재생 진행 막대".
  position?: number;
  duration?: number | null;
  positionAt?: number; // epoch ms when `position` was read
  live?: boolean;
  ad?: boolean;
}

export interface Track {
  number: number;
  title: string;
  url: string;
}

export interface Snapshot {
  current: Current | null;
  items: Track[];
  playlistUrl: string;
  observedAt?: number;
}

export type Scene = 'playing' | 'paused' | 'loading' | 'waiting';
