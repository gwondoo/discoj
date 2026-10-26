import type {Scene} from './types.ts';

// The shared, confirmed playback state drives the character, never optimistic clicks.
export function playbackScene({online, current, loading}: {
  online: boolean;
  current: {state: string} | null | undefined;
  loading?: unknown;
}): Scene {
  if (!online) return 'waiting';
  if (loading) return 'loading';
  if (!current) return 'waiting';
  return current.state === 'playing' ? 'playing' : 'paused';
}
