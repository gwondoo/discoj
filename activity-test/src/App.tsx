import {useEffect, useSyncExternalStore} from 'react';
import type {Discoj} from './discoj.ts';
import {Player} from './components/Player.tsx';
import {Crate} from './components/Crate.tsx';
import {DeleteDialog} from './components/DeleteDialog.tsx';

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
        <h1><span className="logo" aria-hidden="true"><i/><i/></span>디스코제이</h1>
        <span className={'connection' + (view.connected ? ' connected' : '')} role="status">{view.connection}</span>
      </header>
      <main className="workspace">
        <Player view={view} app={app}/>
        <Crate view={view} app={app}/>
      </main>
      <DeleteDialog view={view} app={app}/>
    </>
  );
}
