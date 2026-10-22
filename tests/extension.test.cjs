const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const reports = [], listeners = {}, navigation = [];
let receive;
const video = {readyState: 4, paused: false, ended: false};
Object.defineProperty(video, 'currentTime', {get: () => 1234, set: () => {throw Error('Must not seek');}});
video.play = video.pause = video.load = () => {throw Error('Must not alter playback on sync');};
const window = {addEventListener: (event, callback) => {listeners['window:'+event] = callback;}, removeEventListener: () => {}};
const context = {URL, Date, Set, window, location: {href:'https://www.youtube.com/watch?v=12345678901&list=playlist', pathname:'/watch', assign: url => navigation.push(url)},
  document: {querySelector: selector => selector.startsWith('video') ? video : selector.startsWith('ytd-watch') ? {textContent:'현재 영상 제목'} : null,
    addEventListener: (event, callback) => {listeners[event] = callback;}, removeEventListener: () => {}},
  chrome: {runtime: {sendMessage: async message => reports.push(message.data), onMessage: {addListener: callback => {receive=callback;}, removeListener: () => {}}}},
  setInterval: callback => {listeners.tick = callback;}, clearInterval: () => {}
};
vm.createContext(context);
vm.runInContext(readFileSync('browser-extension/queue.js', 'utf8'), context);
vm.runInContext(readFileSync('browser-extension/content.js', 'utf8'), context);
assert.equal(reports.at(-1).state, 'playing');
assert.equal(reports.at(-1).title, '현재 영상 제목');
video.paused = true; listeners.pause();
assert.equal(reports.at(-1).state, 'paused');
listeners['yt-navigate-start'](); assert.equal(reports.at(-1).state, 'unavailable');
listeners.tick(); assert.equal(reports.at(-1).state, 'unavailable');
listeners['yt-navigate-finish'](); assert.equal(reports.at(-1).videoId, '12345678901');
const item = (id, n) => ({video_id:id, number:n, title:'Test'});
const a = item('12345678901',1), b = item('abcdefghijk',2), c = item('ABCDEFGHIJK',3);
receive({type:'queueSnapshot', data:{playlistId:'playlist', revision:'one', items:[a,b]}});
receive({type:'queueSnapshot', data:{playlistId:'playlist', revision:'two', items:[a,c]}});
assert.equal(navigation.length,0); assert.equal(video.currentTime,1234);
let stopped = false;
listeners['window:ended']({target:video, stopImmediatePropagation: () => {stopped=true;}});
assert.ok(stopped); assert.ok(navigation[0].includes('v=ABCDEFGHIJK'));
const Queue = context.DiscoJQueue;
const queue = new Queue();
queue.update({playlistId:'playlist',items:[a,b,c]}, b.video_id);
queue.update({playlistId:'playlist',items:[a,c]}, b.video_id);
assert.equal(queue.next().video_id, c.video_id); // Removing current preserves the next successor.
queue.update({playlistId:'playlist',items:[a]}, b.video_id);
assert.equal(queue.next(),undefined); // Never replay tracks preceding a removed current item.
queue.update({playlistId:'playlist',items:[a,c]}, b.video_id);
assert.equal(queue.next().video_id,c.video_id);
receive({type:'disconnectQueue'});
stopped=false;
listeners['window:ended']({target:video, stopImmediatePropagation: () => {stopped=true;}});
assert.equal(stopped,false); // Other tabs and disconnected players are untouched.
console.log('Extension tests passed: current state, no seek/pause/load on sync, natural next, current deletion, disconnect');
