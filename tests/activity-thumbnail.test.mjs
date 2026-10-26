import assert from 'node:assert/strict';
import {videoId, thumbnailUrl} from '../activity/src/lib/thumbnail.ts';
assert.equal(videoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1'), 'dQw4w9WgXcQ');
assert.equal(videoId('https://youtu.be/dQw4w9WgXcQ?t=5'), 'dQw4w9WgXcQ');
assert.equal(videoId('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(videoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
// Anything that is not an 11-character ID must never reach the proxy path.
assert.equal(videoId('https://www.youtube.com/watch?v=../../etc'), null);
assert.equal(videoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
assert.equal(videoId('not a url'), null);
assert.equal(thumbnailUrl('https://youtu.be/dQw4w9WgXcQ'), '/thumb/dQw4w9WgXcQ');
assert.equal(thumbnailUrl(''), null);
console.log('Thumbnail tests passed: watch, short, music and youtu.be links; unsafe IDs rejected');
