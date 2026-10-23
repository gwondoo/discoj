import {useEffect, useState} from 'react';
import type {Scene} from '../lib/types.ts';
import {useReducedMotion} from '../lib/use-reduced-motion.ts';

const poses = ['idle', 'groove-left', 'groove-right', 'sleep', 'dig', 'confused'] as const;
type Pose = typeof poses[number];
const groove: Pose[] = ['groove-left', 'idle', 'groove-right', 'idle'];
const still: Record<Scene, Pose> = {playing: 'idle', paused: 'sleep', loading: 'dig', waiting: 'confused'};

export type Sky = 'morning' | 'day' | 'evening' | 'night';

export function skyAt(hour: number): Sky {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

// Like the island, the booth's sky follows the viewer's local clock.
function useSky(): Sky {
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('sky') as Sky | null : null;
  const [sky, setSky] = useState(() => skyAt(new Date().getHours()));
  useEffect(() => {
    const timer = setInterval(() => setSky(skyAt(new Date().getHours())), 60000);
    return () => clearInterval(timer);
  }, []);
  return forced ?? sky;
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

export function DjBooth({scene}: {scene: Scene}) {
  const pose = usePose(scene);
  const sky = useSky();
  return (
    <div className="booth" data-scene={scene} data-sky={sky} aria-hidden="true">
      <div className="sky">
        <i className="sun"/>
        <i className="cloud c1"/><i className="cloud c2"/>
        <i className="star s1"/><i className="star s2"/><i className="star s3"/><i className="star s4"/><i className="star s5"/>
      </div>
      <div className="hill"/>
      <div className="lamp"><i/></div>
      <div className="rig">
        {poses.map(name => <img key={name} src={`/dj/${name}.png`} alt="" className={'pose' + (name === pose ? ' on' : '')} draggable={false}/>)}
        <img src="/dj/console.png" alt="" className="console" draggable={false}/>
        <i className="record left"><b/></i>
        <i className="record right"><b/></i>
      </div>
      <div className="fx">
        <span className="note n1">♪</span><span className="note n2">♫</span><span className="note n3">♪</span>
        <span className="zzz z1">z</span><span className="zzz z2">z</span><span className="zzz z3">Z</span>
        <span className="huh">?</span>
        <i className="firefly f1"/><i className="firefly f2"/><i className="firefly f3"/>
      </div>
      <span className="booth-label">K.K. RADIO</span>
    </div>
  );
}
