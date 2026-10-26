import assert from 'node:assert/strict';
import {displayTitle} from '../activity/src/lib/title.ts';
assert.equal(displayTitle('𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 우리 모두가 사랑한 재즈'), 'Playlist 우리 모두가 사랑한 재즈');
assert.equal(displayTitle('𝘱𝘭𝘢𝘺𝘭𝘪𝘴𝘵 l 이륙 직전'), 'playlist l 이륙 직전');
assert.equal(displayTitle('Official髭男dism - Pretender［Official Video］'), 'Official髭男dism - Pretender[Official Video]');
// Hangul, emoji and spacing.
assert.equal(displayTitle('  도파민🔥🔥  노동요  '), '도파민🔥🔥 노동요');
assert.equal(displayTitle(''), '제목을 확인할 수 없는 영상');
assert.equal(displayTitle(null, '선택한 곡'), '선택한 곡');
console.log('Title tests passed: decorative letters, full-width brackets, Hangul/emoji kept, fallbacks');
import {splitPlaylist} from '../activity/src/lib/title.ts';
const s = title => splitPlaylist(displayTitle(title));
assert.deepEqual(s('[Playlist] 도파민이 필요할 땐'), {playlist: true, text: '도파민이 필요할 땐'});
assert.deepEqual(s('𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 우리 모두가 사랑한 재즈'), {playlist: true, text: '우리 모두가 사랑한 재즈'});
assert.deepEqual(s('𝘱𝘭𝘢𝘺𝘭𝘪𝘴𝘵 l 이륙 직전'), {playlist: true, text: '이륙 직전'});
assert.deepEqual(s('Playlist | 주말 대청소'), {playlist: true, text: '주말 대청소'});
assert.deepEqual(s('플레이리스트: 새벽 감성'), {playlist: true, text: '새벽 감성'});
// Not a prefix, or nothing left after it: keep the title as is.
assert.deepEqual(s('hyper-focus. | deep house music for coding'), {playlist: false, text: 'hyper-focus. | deep house music for coding'});
assert.deepEqual(s('Playlists of 2024'), {playlist: false, text: 'Playlists of 2024'});
assert.deepEqual(s('Lofi playlist'), {playlist: false, text: 'Lofi playlist'});
assert.deepEqual(s('[Playlist]'), {playlist: false, text: '[Playlist]'});
console.log('Playlist prefix tests passed: bracket, bar, l and colon forms; non-prefix titles kept');
