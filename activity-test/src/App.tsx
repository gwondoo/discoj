import {useEffect, useState, useSyncExternalStore} from 'react';
import type {Discoj} from './discoj.ts';
import {Player} from './components/Player.tsx';
import {Crate} from './components/Crate.tsx';
import {DeleteDialog} from './components/DeleteDialog.tsx';
import {Icon} from './components/icons.tsx';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

// NookPhone-style status clock.
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return (
    <time className="clock" dateTime={now.toISOString()}>
      <b>{now.getHours()}<i>:</i>{minutes}</b>
      <span>{now.getMonth() + 1}월 {now.getDate()}일 ({weekdays[now.getDay()]})</span>
    </time>
  );
}

export function App({app}: {app: Discoj}) {
  const view = useSyncExternalStore(app.subscribe, app.getView);

  useEffect(() => {
    const resume = () => { if (!document.hidden) app.resume(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [app]);

  return (
    <>
      <header className="topbar">
        <h1><span className="logo" aria-hidden="true"><Icon name="leaf"/></span>디스코제이</h1>
        <Clock/>
        <span className={'connection' + (view.connected ? ' connected' : '')} role="status">{view.connection}</span>
      </header>
      {view.notice.temporary && view.notice.text && (
        <div className="toast" role="status" key={view.notice.text}>
          <span className="toast-app"><Icon name="radio"/>K.K. 라디오</span>
          <p>{view.notice.text}</p>
        </div>
      )}
      <main className="workspace">
        <Player view={view} app={app}/>
        <Crate view={view} app={app}/>
      </main>
      <DeleteDialog view={view} app={app}/>
    </>
  );
}
