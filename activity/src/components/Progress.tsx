import {useEffect, useRef, useState} from 'react';
import type {Discoj, View} from '../discoj.ts';
import {VolumeGesture} from '../lib/volume-gesture.ts';
import {clamp, formatTime, livePosition, progressKind, seekSettled, spokenTime} from '../lib/progress.ts';

const PENDING_TIMEOUT = 8000;
const kindLabels = {live: '라이브', ad: '광고'} as const;
const keySteps: Record<string, number> = {ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30};

// Ticks once a second while the bar shows a running clock.
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return running ? now : Date.now();
}

// Position bar between the title and the transport. A drag or key press only previews
// the target; release applies it. Server reports never move a held thumb, a pending
// seek holds its target until the report catches up, and a failure snaps back.
export function Progress({view, app}: {view: View, app: Discoj}) {
  const {current, scene, canControl} = view;
  const kind = progressKind(current);
  const [draft, setDraft] = useState<number | null>(null);
  const [pending, setPending] = useState<{target: number, url: string, since: number} | null>(null);
  const [failed, setFailed] = useState(false);
  const draftRef = useRef<number | null>(null);
  draftRef.current = draft;
  const draftUrl = useRef<string | undefined>(undefined);
  const urlRef = useRef(current?.url);
  urlRef.current = current?.url;

  const switching = scene === 'loading';
  const reachable = scene !== 'waiting' && !switching && view.online;
  const seekable = kind === 'seekable' && reachable;
  const duration = seekable ? current!.duration! : 0;
  const now = useNow(seekable && current?.state === 'playing' && draft === null);
  const value = seekable ? draft ?? pending?.target ?? livePosition(current!, now) : 0;

  // Settle a pending seek once the report reaches it; give up (snap back) on a new song or timeout.
  useEffect(() => {
    if (!pending) return;
    if (!current || current.url !== pending.url) { setPending(null); return; }
    if (seekSettled(current, pending.target, Date.now())) { setPending(null); return; }
    const timer = setTimeout(() => { setPending(null); setFailed(true); }, pending.since + PENDING_TIMEOUT - Date.now());
    return () => clearTimeout(timer);
  }, [pending, current]);

  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => setFailed(false), 1600);
    return () => clearTimeout(timer);
  }, [failed]);

  const gesture = useRef<VolumeGesture | null>(null);
  gesture.current ??= new VolumeGesture(
    next => { if (draftRef.current === null) draftUrl.current = urlRef.current; setDraft(next); },
    async () => {
      const target = draftRef.current;
      setDraft(null);
      const url = urlRef.current;
      if (target === null || !url) return;
      if (draftUrl.current !== url) { setFailed(true); return; }
      setFailed(false);
      setPending({target, url, since: Date.now()});
      if (!await app.seek(target)) { setPending(null); setFailed(true); }
    },
    () => setDraft(null),
  );
  const g = gesture.current;

  const state = draft !== null ? 'dragging' : pending ? 'pending' : failed ? 'failed' : 'idle';
  const fill = seekable ? (value / duration) * 100 : 0;
  const label = !reachable ? null : kind === 'live' || kind === 'ad' ? kindLabels[kind] : null;
  const shown = (seconds: number) => seekable ? formatTime(seconds) : '--:--';

  return (
    <div className="progress" data-kind={kind} data-scene={switching ? 'loading' : reachable ? current?.state : 'waiting'} data-state={state}>
      {label
        ? <span className="progress-chip" data-kind={kind}>{label}</span>
        : <span className="time">{shown(value)}</span>}
      <div className="progress-track" style={{'--fill': fill + '%'} as React.CSSProperties}>
        <input type="range" min={0} max={Math.max(1, Math.floor(duration))} step={1} value={Math.floor(value)}
          aria-label="재생 위치"
          aria-valuetext={seekable ? `${spokenTime(value)} / ${spokenTime(duration)}` : label ?? '재생 위치를 알 수 없어요'}
          disabled={!seekable || !canControl}
          onChange={event => g.change(Number(event.target.value))}
          onKeyDown={event => {
            const step = keySteps[event.key];
            const to = step !== undefined ? value + step : event.key === 'Home' ? 0 : event.key === 'End' ? duration : null;
            if (to === null) return;
            event.preventDefault();
            g.change(clamp(to, 0, duration));
          }}
          onPointerDown={event => { g.pointerDown(); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={() => g.pointerUp()}
          onPointerCancel={() => g.cancel()}
          onLostPointerCapture={() => g.lostCapture()}
          onKeyUp={event => g.keyUp(event.key)}
          onBlur={() => g.blur()}/>
        {draft !== null && <output className="seek-tip" aria-hidden="true">{formatTime(draft)}</output>}
      </div>
      <span className="time total">{kind === 'seekable' && reachable ? formatTime(duration) : label ? '' : '--:--'}</span>
      {failed && <span className="sr-only" role="status">구간 이동을 적용하지 못했어요</span>}
    </div>
  );
}
