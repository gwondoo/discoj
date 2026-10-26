import type {Current} from './types.ts';

// What the progress row may show. Anything but `seekable` hides times and disables seeking.
export type ProgressKind = 'seekable' | 'live' | 'ad' | 'unknown';

export function progressKind(current: Current | null | undefined): ProgressKind {
  if (!current) return 'unknown';
  if (current.live) return 'live';
  if (current.ad) return 'ad';
  const {position, duration} = current;
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  if (!valid(duration) || duration <= 0 || !valid(position) || position < 0) return 'unknown';
  return 'seekable';
}

// Position now: the last report, plus elapsed time while playing, kept inside the video.
export function livePosition(current: Current, now: number): number {
  const base = current.position ?? 0;
  const elapsed = current.state === 'playing' && current.positionAt ? Math.max(0, now - current.positionAt) / 1000 : 0;
  return clamp(base + elapsed, 0, current.duration ?? 0);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// 24:15, 2:28:24. Each value carries hours only when it reaches an hour.
export function formatTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Screen readers: "24분 15초" / "2시간 28분 24초".
export function spokenTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return [h && `${h}시간`, (h || m) && `${m}분`, `${s}초`].filter(Boolean).join(' ');
}

// A requested seek counts as applied once the report lands within this many seconds of it.
export const SEEK_TOLERANCE = 2;
export function seekSettled(current: Current | null | undefined, target: number, now: number): boolean {
  return Boolean(current && progressKind(current) === 'seekable' && Math.abs(livePosition(current, now) - target) <= SEEK_TOLERANCE);
}
