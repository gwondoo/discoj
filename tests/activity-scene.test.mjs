import assert from 'node:assert/strict';
import {playbackScene} from '../activity-test/playback-scene.js';
const playing = {state:'playing'}, paused = {state:'paused'};
assert.equal(playbackScene({online:true,current:playing}), 'playing');
assert.equal(playbackScene({online:true,current:paused}), 'paused');
assert.equal(playbackScene({online:false,current:playing}), 'waiting');
assert.equal(playbackScene({online:true,current:null}), 'waiting');
assert.equal(playbackScene({online:true,current:playing,loading:{title:'next'}}), 'loading');
assert.equal(playbackScene({online:true,current:null,loading:{title:'next'}}), 'loading');
// An old playing snapshot must not animate a disconnected view.
assert.equal(playbackScene({online:false,current:playing,loading:{title:'next'}}), 'waiting');
console.log('Character scene tests passed: actual playing, paused, offline, missing tab and navigation');
