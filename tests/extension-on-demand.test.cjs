const {test}=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs');
function setup(tabs, selected={}) {
  let state={...selected}, created=0, navigated=0, injected=0, reports=0;
  const context={URL,Promise,Date,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,
    syncQueue:async()=>{},queued:async()=>{reports++},
    chrome:{runtime:{},storage:{session:{get:async()=>({...state}),set:async v=>Object.assign(state,v)},local:{get:async()=>({}),set:async()=>{}}},
      tabs:{get:async id=>tabs.find(t=>t.id===id),query:async()=>tabs,
        create:async data=>{created++;const tab={id:10,...data};tabs.push(tab);return tab},
        update:async(id,data)=>{navigated++;return Object.assign(tabs.find(t=>t.id===id),data)},
        sendMessage:async(id,data)=>{if(data.type==='probePlayback')return {ok:true,data:{state:'playing',title:'Original',url:tabs.find(t=>t.id===id).url}}}},
      scripting:{executeScript:async()=>{injected++}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('browser-extension/on-demand.js','utf8'),context);
  return {context,counts:()=>({created,navigated,injected,reports})};
}
const url='https://www.youtube.com/watch?v=abcdefghijk&list=shared';
const command={playlistId:'shared',url,hasTracks:true};
test('existing playing tab is reused without navigation or replay',async()=>{
 const s=setup([{id:1,url,audible:true}],{tabId:1,connectionId:'same'});
 await s.context.ensurePlayTarget(command);
 assert.deepEqual(s.counts(),{created:0,navigated:0,injected:0,reports:1});
});
test('lost selection reuses audible video, even outside playlist',async()=>{
 const s=setup([{id:3,url:'https://www.youtube.com/watch?v=zyxwvutsrqp',audible:true}]);
 await s.context.ensurePlayTarget(command);assert.equal(s.counts().created,0);assert.equal(s.counts().navigated,0);
});
test('concurrent requests create only one playlist tab',async()=>{
 const s=setup([]);await Promise.all([s.context.ensurePlayTarget(command),s.context.ensurePlayTarget(command)]);
 assert.equal(s.counts().created,1);assert.equal(s.counts().reports,1);
});
test('playlist landing page is reused rather than duplicated',async()=>{
 const s=setup([{id:2,url:'https://www.youtube.com/playlist?list=shared'}]);
 await s.context.ensurePlayTarget(command);assert.equal(s.counts().created,0);assert.equal(s.counts().navigated,1);
});
test('ambiguous playing tabs and empty playlist fail without opening anything',async()=>{
 const s=setup([{id:1,url,audible:true},{id:2,url,audible:true}]);
 await assert.rejects(s.context.ensurePlayTarget(command),/여러 개/);assert.equal(s.counts().created,0);
 const e=setup([]);await assert.rejects(e.context.ensurePlayTarget({...command,hasTracks:false}),/비어/);assert.equal(e.counts().created,0);
});
test('no alarm-based automatic recovery remains',()=>{
 const code=fs.readFileSync('browser-extension/background.js','utf8')+fs.readFileSync('browser-extension/on-demand.js','utf8');
 assert.doesNotMatch(code,/alarms\.create|onAlarm|recoverPlayback/);
});
