import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Discoj} from './discoj.ts';
import {App} from './App.tsx';
import '@fontsource/jua';
import '@fontsource/gowun-dodum';
import './styles.css';
import {desktopLayout} from './lib/layout-client.ts';

document.documentElement.classList.toggle('desktop-layout', desktopLayout(
  new URLSearchParams(location.search).get('platform'), matchMedia('(pointer: coarse)').matches,
));

const app = new Discoj();
createRoot(document.getElementById('root')!).render(<StrictMode><App app={app}/></StrictMode>);

if (import.meta.env.DEV && new URLSearchParams(location.search).has('preview')) {
  void import('./preview.ts').then(({showPreview}) => showPreview(app));
} else {
  void app.start();
}
