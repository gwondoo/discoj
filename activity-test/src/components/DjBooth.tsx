import {useEffect, useState} from 'react';
import type {Scene} from '../lib/types.ts';

const poses = ['idle', 'groove-left', 'groove-right', 'sleep', 'dig', 'confused'] as const;
type Pose = typeof poses[number];
const groove: Pose[] = ['groove-left', 'idle', 'groove-right', 'idle'];
const still: Record<Scene, Pose> = {playing: 'idle', paused: 'sleep', loading: 'dig', waiting: 'confused'};

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

// Stop-motion groove: the photographed pose frames swap on the beat while playing.
function usePose(scene: Scene): Pose {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const dancing = scene === 'playing' && !reduced;
  useEffect(() => {
    if (!dancing) return;
    const timer = setInterval(() => setBeat(beat => beat + 1), 340);
    return () => clearInterval(timer);
  }, [dancing]);
  return dancing ? groove[beat % groove.length] : still[scene];
}

export function DjBooth({scene, line, error, action}: {
  scene: Scene;
  line: string;
  error: boolean;
  action?: React.ReactNode;
}) {
  const pose = usePose(scene);
  return (
    <div className="booth" data-scene={scene}>
      <div className="booth-glow" aria-hidden="true"/>
      <p className={'bubble' + (error ? ' error' : '')} role="status" aria-live="polite">
        <span>{line}</span>{action}
      </p>
      <div className="rig" aria-hidden="true">
        {poses.map(name => <img key={name} src={`/dj/${name}.png`} alt="" className={'pose' + (name === pose ? ' on' : '')} draggable={false}/>)}
        <img src="/dj/console.png" alt="" className="console" draggable={false}/>
        <i className="record left"><b/></i>
        <i className="record right"><b/></i>
      </div>
      <div className="fx" aria-hidden="true">
        <span className="note n1">♪</span><span className="note n2">♫</span><span className="note n3">♪</span>
        <span className="zzz z1">z</span><span className="zzz z2">z</span><span className="zzz z3">Z</span>
        <span className="huh">?</span>
      </div>
      <span className="booth-label" aria-hidden="true">DISCOJ FM</span>
    </div>
  );
}
