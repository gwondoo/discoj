import type {Discoj} from './discoj.ts';
import type {Snapshot} from './lib/types.ts';

// Dev-only sample data (`npm run dev`, then open /?preview, or =paused, =loading, =waiting).
const titles = [
  "NewJeans (뉴진스) 'Supernatural' Official MV",
  'IU 아이유 - Love wins all MV',
  'DAY6 (데이식스) "한 페이지가 될 수 있게" Lyric Video',
  'Lo-fi hip hop radio - beats to relax/study to',
  "aespa 에스파 'Supernova' MV",
  '잔나비 - 주저하는 연인들을 위해',
  'Official髭男dism - Pretender［Official Video］',
  'HYUKOH (혁오) - TOMBOY',
];

export function showPreview(app: Discoj) {
  const mode = new URLSearchParams(location.search).get('preview');
  const items = titles.map((title, index) => ({number: index + 1, title, url: `https://www.youtube.com/watch?v=preview${index}`}));
  const snapshot: Snapshot = {
    items, playlistUrl: 'https://www.youtube.com/playlist?list=preview',
    current: mode === 'waiting' ? null : {...items[1], state: mode === 'paused' ? 'paused' : 'playing', volume: 70},
  };
  app.preview(snapshot, mode === 'loading' ? items[4] : undefined);
}
