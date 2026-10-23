import {useEffect, useState} from 'react';
import type {Fan} from '../discoj.ts';
import type {Scene} from '../lib/types.ts';

export type Sky = 'morning' | 'day' | 'evening' | 'night';

export function skyAt(hour: number): Sky {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

// Like the island, the stage's sky follows the viewer's local clock.
function useSky(): Sky {
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('sky') as Sky | null : null;
  const [sky, setSky] = useState(() => skyAt(new Date().getHours()));
  useEffect(() => {
    const timer = setInterval(() => setSky(skyAt(new Date().getHours())), 60000);
    return () => clearInterval(timer);
  }, []);
  return forced ?? sky;
}

const flagColors = ['#f26b5b', '#f7cf5c', '#3fbfac', '#6aa9e9', '#c58be6', '#f59fc0'];

// Pennant flags hung along a sagging string, like the festival stage.
function Bunting({sag, offset}: {sag: number, offset: number}) {
  const flags = [];
  for (let i = 0; i < 13; i++) {
    const t = (i + .5) / 13, x = t * 100, y = 4 + sag * 4 * t * (1 - t);
    flags.push(<path key={i} d={`M${x - 3.2} ${y} L${x + 3.2} ${y} L${x} ${y + 9} Z`} fill={flagColors[(i + offset) % flagColors.length]}/>);
  }
  return (
    <g>
      <path d={`M0 4 Q50 ${4 + sag * 2} 100 4`} fill="none" stroke="#6b5739" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
      {flags}
    </g>
  );
}

const stickColors = ['#7dfcf0', '#ff8ad8', '#fff27a', '#9dff8a', '#b9a4ff'];

function Avatar({fan}: {fan: Fan}) {
  const [broken, setBroken] = useState(false);
  if (!fan.avatar || broken) return <span className="avatar initial">{Array.from(fan.name)[0] ?? '?'}</span>;
  return <img className="avatar" src={fan.avatar} alt="" onError={() => setBroken(true)} draggable={false}/>;
}

// Teammates in this Activity cheer in front of the stage with glowsticks.
function Crowd({fans}: {fans: Fan[]}) {
  const shown = fans.slice(0, 8);
  const extra = fans.length - shown.length;
  if (!fans.length) return null;
  return (
    <ul className="crowd" aria-label={`${fans.length}명이 함께 듣는 중`}>
      {shown.map((fan, index) => (
        <li key={fan.id} title={fan.name} style={{'--i': index, '--stick': stickColors[index % stickColors.length]} as React.CSSProperties}>
          <i className="stick"/>
          <Avatar fan={fan}/>
        </li>
      ))}
      {extra > 0 && <li className="more">+{extra}</li>}
    </ul>
  );
}

export function DjBooth({scene, crowd}: {scene: Scene, crowd: Fan[]}) {
  const sky = useSky();
  return (
    <div className="booth" data-scene={scene} data-sky={sky}>
      <div className="sky" aria-hidden="true">
        <i className="sun"/>
        <i className="cloud c1"/><i className="cloud c2"/>
        <i className="star s1"/><i className="star s2"/><i className="star s3"/><i className="star s4"/><i className="star s5"/>
      </div>
      <div className="hill" aria-hidden="true"/>
      <div className="beams" aria-hidden="true"><i className="beam b1"/><i className="beam b2"/><i className="beam b3"/></div>
      <div className="truss left" aria-hidden="true"/>
      <div className="truss right" aria-hidden="true"/>
      <div className="truss top" aria-hidden="true"/>
      <svg className="bunting" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
        <Bunting sag={3.2} offset={0}/>
        <g transform="translate(0 9)"><Bunting sag={2.4} offset={3}/></g>
      </svg>
      <span className="neon-sign left" aria-hidden="true">»</span>
      <span className="neon-sign right" aria-hidden="true">«</span>
      <div className="deck" aria-hidden="true"/>
      <div className="rig" aria-hidden="true">
        <img src="/dj/kk-dog.webp" alt="" className="kk-dog" draggable={false}/>
        <img src="/dj/kk-console.webp" alt="" className="kk-console" draggable={false}/>
        <img src="/dj/kk-leds.webp" alt="" className="kk-leds" draggable={false}/>
        <i className="kk-logo"/>
        <i className="sheen left"><b/></i>
        <i className="sheen right"><b/></i>
      </div>
      <div className="fog" aria-hidden="true"><i/><i/><i/><i/></div>
      <div className="fx" aria-hidden="true">
        <span className="note n1">♪</span><span className="note n2">♫</span><span className="note n3">♪</span>
        <span className="zzz z1">z</span><span className="zzz z2">z</span><span className="zzz z3">Z</span>
        <span className="huh">?</span>
        <i className="bubble b1"/><i className="bubble b2"/><i className="bubble b3"/><i className="bubble b4"/><i className="bubble b5"/><i className="bubble b6"/>
        <i className="firefly f1"/><i className="firefly f2"/><i className="firefly f3"/>
      </div>
      <Crowd fans={crowd}/>
      <span className="booth-label" aria-hidden="true">DJ K.K. LIVE</span>
    </div>
  );
}
