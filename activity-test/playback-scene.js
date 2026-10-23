// The shared, confirmed playback state drives the character, never optimistic clicks.
export function playbackScene({online, current, loading}) {
  if (!online) return 'waiting';
  if (loading) return 'loading';
  if (!current) return 'waiting';
  return current.state === 'playing' ? 'playing' : 'paused';
}
