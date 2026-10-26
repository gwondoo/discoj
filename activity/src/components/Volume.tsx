import {useEffect, useRef, useState} from 'react';
import type {Discoj, View} from '../discoj.ts';
import {Icon} from './icons.tsx';
import {VolumeGesture} from '../lib/volume-gesture.ts';

// Volume is a shared-tab setting, so it lives behind a speaker button at the end of the
// transport row. Pressing it pops a vertical slider up; the value applies on release.
export function Volume({view, app}: {view: View, app: Discoj}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const gesture = useRef<VolumeGesture | null>(null);
  gesture.current ??= new VolumeGesture(app.setVolumeDraft, app.commitVolume, app.cancelVolumeDraft);
  const g = gesture.current;
  const enabled = view.authenticated && view.online && Boolean(view.current);
  const level = view.volume;
  const icon = level === 0 ? 'mute' : level < 50 ? 'volume-low' : 'volume';

  // Close on a press outside or Escape; focus the slider when it opens.
  useEffect(() => {
    if (!open) return;
    slider.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => { if (!enabled) setOpen(false); }, [enabled]);

  return (
    <div className="volume" ref={root}>
      <button className="round side" disabled={!enabled} aria-expanded={open} aria-controls="volume-pop"
        aria-label={`유튜브 음량 ${level}%`} title={`음량 ${level}%`} onClick={() => setOpen(!open)}>
        <Icon name={icon}/><b className="volume-level" aria-hidden="true">{level}</b>
      </button>
      {open && (
        <div className="volume-pop" id="volume-pop">
          <output htmlFor="volume">{level}%</output>
          <input id="volume" ref={slider} type="range" min={0} max={100} step={1} value={level}
            aria-label="유튜브 음량" aria-valuetext={`${level}%`}
            style={{'--fill': level + '%'} as React.CSSProperties}
            onChange={event => g.change(Number(event.target.value))}
            onPointerDown={event => { g.pointerDown(); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerUp={() => g.pointerUp()}
            onPointerCancel={() => g.cancel()}
            onLostPointerCapture={() => g.lostCapture()}
            onKeyUp={event => g.keyUp(event.key)}
            onBlur={() => g.blur()}/>
        </div>
      )}
    </div>
  );
}
