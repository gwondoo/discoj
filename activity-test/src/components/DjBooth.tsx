import {useEffect, useState} from 'react';
import type {Scene} from '../lib/types.ts';

export type Sky = 'morning' | 'day' | 'evening' | 'night';

// Ranges follow the office day so the team actually sees the sky change:
// morning until lunch, day through the afternoon, sunset after work, night late.
export function skyAt(hour: number): Sky {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'evening';
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

// A render layer graded by the sky: a multiply tint plus side light, clipped to its own pixels.
function Lit({src, className}: {src: string, className: string}) {
  return (
    <div className={'lit ' + className} style={{'--src': `url(${src})`} as React.CSSProperties}>
      <img src={src} alt="" draggable={false}/>
      <i className="tint"/>
      <i className="light"/>
    </div>
  );
}

// Official New Horizons scenery icons, trimmed to their pixels (see assets/dj/build-scene.py).
function Prop({name, className = name}: {name: string, className?: string}) {
  return <img className={'prop ' + className} src={`/scene/${name}.webp`} alt="" draggable={false}/>;
}

export function DjBooth({scene}: {scene: Scene}) {
  const sky = useSky();
  return (
    <div className="booth" data-scene={scene} data-sky={sky}>
      <div className="sky" aria-hidden="true">
        <i className="cloud c1"/><i className="cloud c2"/>
        <i className="star s1"/><i className="star s2"/><i className="star s3"/>
      </div>
      <div className="sea" aria-hidden="true"/>
      <div className="island" aria-hidden="true">
        <Prop name="hardwood-tree" className="hardwood-tree near"/><Prop name="hardwood-tree"/><Prop name="hardwood-tree" className="hardwood-tree far"/>
        <div className="ground"/>
        <Prop name="streetlamp"/><Prop name="garden-lantern"/>
        <Prop name="azalea-bush"/><Prop name="hibiscus-bush"/>
        <Prop name="cosmos"/><Prop name="windflowers"/><Prop name="tulips"/><Prop name="pansies"/>
      </div>
      <div className="glows" aria-hidden="true"><i className="glow streetlamp"/><i className="glow garden-lantern"/></div>
      <div className="rig" aria-hidden="true">
        <Lit src="/dj/kk-dog.webp" className="kk-dog"/>
        <Lit src="/dj/kk-console.webp" className="kk-console"/>
        <img src="/dj/kk-leds.webp" alt="" className="kk-leds" draggable={false}/>
        <i className="kk-logo"/>
        <i className="sheen left"><b/></i>
        <i className="sheen right"><b/></i>
      </div>
      <div className="fx" aria-hidden="true">
        <span className="note n1">♪</span><span className="note n2">♫</span>
        <span className="zzz z1">z</span><span className="zzz z2">z</span><span className="zzz z3">Z</span>
        <span className="huh">?</span>
        <i className="bubble b2"/><i className="bubble b4"/><i className="bubble b6"/>
      </div>
    </div>
  );
}
