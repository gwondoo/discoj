const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = file => readFileSync('browser-extension/' + file, 'utf8');
const item = (video_id, number) => ({video_id, number, title:'Track ' + number});
const a = item('12345678901',1), b = item('abcdefghijk',2), c = item('ABCDEFGHIJK',3);
function player(current = a.video_id) {
  const events = {}, navigation = [], messages = [];
  let receive, now = 100000, saved = null;
  const video = {readyState:4, paused:false, ended:false};
  Object.defineProperty(video, 'currentTime', {get: () => 1234, set: () => {throw Error('Unexpected seek');}});
  video.play = video.pause = video.load = () => {throw Error('Unexpected playback interruption');};
  const context = {URL, Set, setTimeout, Date:{now:()=>now},
    window:{addEventListener:(event,callback)=>events[event]=callback,removeEventListener:()=>{}},
    location:{href:`https://www.youtube.com/watch?v=${current}&list=playlist`,pathname:'/watch',assign:url=>navigation.push(url)},
    history:{state:null,replaceState:(_state,_title,url)=>{context.location.href=url;}},
    document:{documentElement:{dataset:{}},querySelectorAll:()=>[],querySelector:selector=>selector.startsWith('video')?video:selector.startsWith('ytd-watch')?{textContent:'현재 영상 제목'}:null,
      addEventListener:(event,callback)=>events[event]=callback,removeEventListener:()=>{}},
    chrome:{runtime:{sendMessage:async message=>{messages.push(message); if(message.type==='saveCursor')saved=message.cursor; return {ok:true};},
      onMessage:{addListener:callback=>receive=callback,removeListener:()=>{}}}},
    setInterval:callback=>{events.tick=callback;},clearInterval:()=>{}}
  vm.createContext(context);
  const inject=()=>{vm.runInContext(source('queue.js'),context);vm.runInContext(source('content.js'),context);};
  inject();
  return {video,events,navigation,messages,context,inject,
    advance:n=>now+=n, saved:()=>saved,
    snapshot:(items,options={})=>receive({type:'queueSnapshot',data:{playlistId:'playlist',revision:JSON.stringify(items),items},requestedAt:options.requestedAt??now,cursor:options.cursor}),
    end:()=>{video.ended=true;events.ended({target:video,stopImmediatePropagation:()=>{}});},
    control:command=>new Promise(resolve=>receive({type:'control',command:{videoId:current,expiresAt:200000,...command}},null,resolve)),
    disconnect:()=>receive({type:'disconnectQueue'})};
}
(async()=>{
  const normal=player();normal.snapshot([a,b]);normal.snapshot([a,c]);
  assert.equal(normal.navigation.length,0);assert.equal(normal.video.currentTime,1234);
  normal.end();assert.equal(normal.navigation.length,0); // Never select from the old snapshot at end.
  assert.ok(normal.messages.some(m=>m.type==='syncNow'));
  normal.advance(1);normal.snapshot([a,c]);
  assert.ok(normal.navigation[0].includes(c.video_id));
  normal.snapshot([a,c]);assert.equal(normal.navigation.length,1);

  const late=player();late.snapshot([a]);late.end();late.advance(5000);late.snapshot([]);
  assert.equal(late.navigation.length,0);
  late.advance(5000);late.snapshot([a,b]);assert.equal(late.navigation.length,1);
  assert.ok(late.navigation[0].includes(b.video_id));

  const repeat=player(c.video_id);repeat.snapshot([a,b,c]);
  assert.equal(repeat.navigation.length,0); // Enabling repeat does not touch the current song.
  repeat.end();repeat.advance(1);repeat.snapshot([a,c]);
  assert.equal(repeat.navigation.length,1);assert.ok(repeat.navigation[0].includes(a.video_id));
  repeat.snapshot([a,c]);assert.equal(repeat.navigation.length,1);

  const single=player();single.snapshot([a]);single.end();single.advance(1);single.snapshot([a]);
  assert.equal(single.navigation.length,1);assert.ok(single.navigation[0].includes(a.video_id));

  const removedLast=player(c.video_id);removedLast.snapshot([a,b,c]);removedLast.snapshot([a,b]);
  removedLast.end();removedLast.advance(1);removedLast.snapshot([a,b]);
  assert.equal(removedLast.navigation.length,1);assert.ok(removedLast.navigation[0].includes(a.video_id));

  const offline=player();offline.snapshot([a,b]);offline.advance(31000);offline.events.tick();offline.end();
  assert.equal(offline.navigation.length,0);
  offline.snapshot([a,b],{requestedAt:100000});assert.equal(offline.navigation.length,0);
  offline.advance(1);offline.snapshot([a,c]);assert.equal(offline.navigation.length,1);
  assert.ok(offline.navigation[0].includes(c.video_id)); // Deleted B is never played after recovery.

  const paused=player();paused.snapshot([a]);paused.end();paused.video.ended=false;paused.video.paused=true;paused.events.pause();
  paused.advance(1);paused.snapshot([a,b]);assert.equal(paused.navigation.length,0);

  const removed=player(b.video_id);removed.snapshot([a,b,c]);removed.snapshot([a,c]);
  const cursor=removed.saved();assert.equal(cursor.positionKnown,true);
  removed.inject();removed.snapshot([a,c],{cursor});removed.end();removed.advance(1);removed.snapshot([a,c]);
  assert.equal(removed.navigation.length,1);assert.ok(removed.navigation[0].includes(c.video_id));

  const unknown=player(b.video_id);unknown.snapshot([a,c]);unknown.end();unknown.advance(1);unknown.snapshot([a,c]);
  assert.equal(unknown.navigation.length,0); // Without a cursor, never guess and replay track 1.
  const wrongCursor=player(b.video_id);wrongCursor.snapshot([a,c],{cursor:{...cursor,current:a.video_id}});
  wrongCursor.end();wrongCursor.advance(1);wrongCursor.snapshot([a,c]);assert.equal(wrongCursor.navigation.length,0);

  const resumed=player();resumed.snapshot([a]);resumed.end();const waiting=resumed.saved();
  resumed.inject();resumed.snapshot([a,b],{cursor:waiting});assert.equal(resumed.navigation.length,1);

  const detached=player();detached.snapshot([a,b]);detached.disconnect();detached.end();assert.equal(detached.navigation.length,0);
  const migration=player();
  let removedPanel=false;
  delete migration.context.document.documentElement.dataset.discojOwner;
  migration.context.document.querySelectorAll=()=>[{remove:()=>{removedPanel=true;}}];
  migration.inject();
  assert.ok(removedPanel);
  assert.equal(new URL(migration.context.location.href).searchParams.get('list'),null);
  assert.equal(new URL(migration.context.location.href).searchParams.get('discoj_list'),'playlist');
  migration.snapshot([a,b]);assert.equal(migration.navigation.length,0);
  assert.equal(migration.video.currentTime,1234);
  const controls=player();controls.video.volume=1;controls.video.muted=false;
  controls.video.pause=()=>{controls.video.paused=true;};
  controls.video.play=async()=>{controls.video.paused=false;};
  controls.snapshot([a,b]);
  assert.equal((await controls.control({action:'pause'})).ok,true);assert.equal(controls.video.paused,true);
  assert.equal((await controls.control({action:'play'})).ok,true);assert.equal(controls.video.paused,false);
  controls.video.pause=()=>{};
  assert.equal((await controls.control({action:'pause'})).ok,false); // A no-op pause must not claim success.
  controls.video.pause=()=>{controls.video.paused=true;};
  controls.video.pause=()=>{controls.video.paused=true;setTimeout(()=>{controls.video.paused=false;},50);};
  assert.equal((await controls.control({action:'pause'})).ok,false); // YouTube resumed before verification.
  controls.video.pause=()=>{controls.video.paused=true;};
  await controls.control({action:'volume_down'});assert.equal(controls.video.volume,.9);
  await controls.control({action:'volume',value:0});assert.equal(controls.video.muted,true);
  await controls.control({action:'volume_up'});assert.equal(controls.video.volume,.1);assert.equal(controls.video.muted,false);
  await controls.control({action:'volume',value:100});await controls.control({action:'volume_up'});assert.equal(controls.video.volume,1);
  assert.equal((await controls.control({action:'pause',videoId:b.video_id})).ok,false);
  assert.equal((await controls.control({action:'pause',expiresAt:1})).ok,false);
  controls.video.play=async()=>{throw Error('Autoplay blocked');};
  assert.equal((await controls.control({action:'play'})).ok,false);
  assert.equal((await controls.control({action:'previous'})).ok,false);
  assert.equal((await controls.control({action:'next'})).ok,true);
  await new Promise(resolve=>setTimeout(resolve,170));assert.ok(controls.navigation[0].includes(b.video_id));
  const manual=player('ZZZZZZZZZZZ');
  manual.context.location.href='https://www.youtube.com/watch?v=ZZZZZZZZZZZ';
  manual.snapshot([a,b]);manual.snapshot([a,b,c]);
  assert.equal(manual.navigation.length,0);assert.equal(manual.video.currentTime,1234);
  assert.equal((await manual.control({action:'select',value:'deleted-id'})).ok,false);
  assert.equal(manual.navigation.length,0);
  assert.equal((await manual.control({action:'select',value:b.video_id})).ok,true);
  await new Promise(resolve=>setTimeout(resolve,170));
  assert.equal(manual.navigation.length,1);
  const selectedUrl=new URL(manual.navigation[0]);
  assert.equal(selectedUrl.searchParams.get('v'),b.video_id);
  assert.equal(selectedUrl.searchParams.get('list'),'playlist');
  // The new document will use playlist sequencing and repeat, while additions alone never navigate.
  const picked=player(b.video_id);picked.snapshot([a,b,c]);picked.end();picked.advance(1);picked.snapshot([a,b,c]);
  assert.ok(picked.navigation[0].includes(c.video_id));
  console.log('Extension playback tests passed: late addition, fresh end transition, offline/recovery, pause, cursor restore, unknown cursor, reconnect, no seek/pause/load');
})();
