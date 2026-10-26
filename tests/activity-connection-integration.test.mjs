import assert from 'node:assert/strict';
import {Discoj} from '../activity/src/discoj.ts';
import {PlaybackConnection} from '../activity/src/lib/playback-connection.ts';
const originalFetch = globalThis.fetch;
const app = new Discoj();
let now = 0;
app.connectionHealth = new PlaybackConnection(() => now);
app.session = 'test-session';
app.snapshot = {current:{title:'Shared song',url:'https://www.youtube.com/watch?v=12345678901',state:'playing',volume:40},items:[],playlistUrl:'https://www.youtube.com/playlist?list=test'};
try {
  app.confirmConnection();
  globalThis.fetch = async () => {throw new TypeError('temporary network failure');};
  now = 2000;
  await app.refresh();
  assert.equal(app.getView().online, true);
  assert.equal(app.getView().scene, 'playing');
  assert.equal(app.getView().notice.error, false);
  // Successful queue-only reads cannot indefinitely renew stale playback.
  globalThis.fetch = async () => new Response(JSON.stringify({items:[],playlistUrl:app.snapshot.playlistUrl}), {status:200});
  now = 29000;
  await app.refresh();
  now = 30000;
  await app.refresh();
  assert.equal(app.getView().online, false);
  assert.equal(app.getView().scene, 'waiting');
  // A confirmed full read restores the shared view.
  globalThis.fetch = async () => new Response(JSON.stringify({...app.snapshot,observedAt:1}), {status:200});
  await app.refresh();
  assert.equal(app.getView().online, true);
  // Expired authentication bypasses the grace period.
  globalThis.fetch = async () => new Response(JSON.stringify({message:'expired'}), {status:401});
  await app.refresh();
  assert.equal(app.getView().online, false);
  assert.equal(app.getView().needsReconnect, true);
  assert.equal(app.getView().authenticated, false);
  console.log('Activity integration passed: transient queue failure, stale queue, full-read recovery, immediate auth expiry');
} finally {
  globalThis.fetch = originalFetch;
  clearTimeout(app.healthTimer);
  clearTimeout(app.noticeTimer);
}
