import type {Discoj} from './discoj.ts';
import type {Snapshot} from './lib/types.ts';

// Dev-only sample data (`npm run dev`, then open /?preview, or =paused, =loading, =waiting).
// Add &sky=morning|day|evening|night, &crowd=0..7, &toast or &error to check those looks.
// Progress: &progress=short|live|ad|unknown (default a 2:28:24 video at 24:15), &seekfail to see a failed seek.
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
  // Two real thumbnails, one missing video (grey placeholder) and the rest without an ID, to show every jacket state.
  const previewIds = ['dQw4w9WgXcQ', 'jNQXAC9IVRw', 'AAAAAAAAAAA'];
  const items = titles.map((title, index) => ({number: index + 1, title, url: `https://www.youtube.com/watch?v=${previewIds[index] ?? 'preview' + index}`}));
  const snapshot: Snapshot = {
    items, playlistUrl: 'https://www.youtube.com/playlist?list=preview',
    current: mode === 'waiting' ? null : {...items[1], state: mode === 'paused' ? 'paused' : 'playing', volume: 70, repeatMode: new URLSearchParams(location.search).has('one') ? 'one' : 'all', ...sampleProgress()},
  };
  app.preview(snapshot, mode === 'loading' ? items[4] : undefined);
  const params = new URLSearchParams(location.search);
  const names = ['도', '민지', '하늘', 'Jun', '소라', '태오', '유나'];
  app.previewCrowd(names.slice(0, Number(params.get('crowd') ?? 5)).map((name, index) => ({id: String(index), name, avatar: null})));
  if (params.has('toast')) app.previewNotice('신청곡 받았어요! 레코드 상자에 넣었어요.', false, true);
  if (params.has('react')) app.previewReaction('IU 아이유 - Love wins all MV');
  // Reports arrive every 3 seconds, like the live stream, so dragging can be checked against updates.
  setInterval(() => app.previewReport(), 3000);
  if (params.has('error')) app.previewNotice('재생 탭이 응답하지 않아요. Mac mini를 확인해주세요.', true);
}

function sampleProgress() {
  const kind = new URLSearchParams(location.search).get('progress');
  const positionAt = Date.now();
  if (kind === 'live') return {position: 3600, duration: null, positionAt, live: true};
  if (kind === 'ad') return {position: 4, duration: 15, positionAt, ad: true};
  if (kind === 'unknown') return {position: 30, duration: null, positionAt};
  if (kind === 'short') return {position: 75, duration: 214, positionAt};
  return {position: 1455, duration: 8904, positionAt};
}
