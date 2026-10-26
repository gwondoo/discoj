import assert from 'node:assert/strict';
import {progressKind, livePosition, formatTime, spokenTime, seekSettled} from '../activity/src/lib/progress.ts';
const base = {title: 't', url: 'u', volume: 50};
const playing = {...base, state: 'playing', position: 1455, duration: 8904, positionAt: 1000};
assert.equal(formatTime(1455), '24:15');
assert.equal(formatTime(8904), '2:28:24');
assert.equal(formatTime(5), '0:05');
assert.equal(spokenTime(8904), '2시간 28분 24초');
assert.equal(spokenTime(65), '1분 5초');
assert.equal(progressKind(playing), 'seekable');
// Live, ads and missing or broken lengths never show a time or allow seeking.
assert.equal(progressKind({...playing, live: true}), 'live');
assert.equal(progressKind({...playing, ad: true}), 'ad');
assert.equal(progressKind({...playing, duration: null}), 'unknown');
assert.equal(progressKind({...playing, duration: 0}), 'unknown');
assert.equal(progressKind({...playing, duration: Infinity}), 'unknown');
assert.equal(progressKind({...playing, position: undefined}), 'unknown');
assert.equal(progressKind(null), 'unknown');
// Playing advances from the report time; paused stays put; never past the end.
assert.equal(livePosition(playing, 11000), 1465);
assert.equal(livePosition({...playing, state: 'paused'}, 11000), 1455);
assert.equal(livePosition({...playing, position: 8900}, 61000), 8904);
assert.equal(seekSettled({...playing, position: 3000, positionAt: 5000}, 3001, 5000), true);
assert.equal(seekSettled(playing, 3000, 1000), false);
console.log('Progress tests passed: time format, live/ad/unknown guards, playing clock and seek settling');
