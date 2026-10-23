export interface Current {
  title: string;
  url: string;
  state: 'playing' | 'paused';
  volume: number;
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
