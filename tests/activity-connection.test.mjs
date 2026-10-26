import assert from 'node:assert/strict';
import {PlaybackConnection} from '../activity/src/lib/playback-connection.ts';
let now = 0;
const health = new PlaybackConnection(() => now);
assert.equal(health.healthy, false);
health.received();
now = 15000; // A scheduled heartbeat keeps an unchanged song fresh.
health.received();
now = 17000; // Stream reconnect or one failed queue read should not cause flicker.
assert.equal(health.healthy, true);
now = 44999;
assert.equal(health.healthy, true);
now = 45000; // A real outage cannot keep the old playing status forever.
assert.equal(health.healthy, false);
health.received(); // Full-state fallback can recover without a stream.
assert.equal(health.healthy, true);
health.reset(); // Authentication failure/restart has no grace period.
assert.equal(health.healthy, false);
console.log('Playback connection tests passed: heartbeat, transient failure, expiry, fallback, invalidation');
