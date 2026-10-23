import assert from 'node:assert/strict';
import {PlaybackTransition} from '../activity-test/playback-transition.js';
let now = 100;
const transition = new PlaybackTransition(() => now);
const a = {url:'https://www.youtube.com/watch?v=12345678901', title:'Selected'};
const old = {url:'https://www.youtube.com/watch?v=abcdefghijk'};
transition.begin(a, old.url);
assert.equal(transition.update(old).loading.title, 'Selected');
assert.equal(transition.update(null).loading.title, 'Selected');
assert.equal(transition.update(null).expired, false);
assert.equal(transition.update(a).loading, null);
assert.equal(transition.pending, null);
// Replaying the same song must not treat its pre-navigation report as the new playback.
transition.begin(a, a.url);
assert.ok(transition.update(a).loading);
transition.update(null);
assert.equal(transition.update(a).loading, null);
transition.begin(a, old.url);
now += 20000;
assert.equal(transition.update(null).expired, true);
assert.equal(transition.pending, null);
// A request failure ends loading immediately and restores ordinary disconnected reporting.
transition.begin(a, old.url);
transition.clear();
assert.deepEqual(transition.update(null), {loading:null,expired:false});
console.log('Activity transition tests passed: old report, navigation gap, new report, same-song replay, timeout, failure');
