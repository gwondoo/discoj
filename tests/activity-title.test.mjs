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
