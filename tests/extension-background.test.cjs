const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const tick = () => new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const requests=[], deliveries=[];
  let selected={tabId:1,connectionId:'session-a'};
  const context={Promise,Map,Date,AbortSignal,DISCOJ_TOKEN:'test',importScripts:()=>{},
    fetch:()=>new Promise(resolve=>requests.push(resolve)),
    chrome:{storage:{session:{get:async()=>({...selected}),set:async()=>{}},local:{get:async()=>({})}},
      tabs:{sendMessage:async(id,data)=>deliveries.push(data),onRemoved:{addListener:()=>{}}},runtime:{onMessage:{addListener:()=>{}}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('browser-extension/background.js','utf8'),context);
  const first=context.syncQueue(1), second=context.syncQueue(1);
  await tick();assert.equal(requests.length,1); // Coalesces concurrent reads; no reversed delivery is possible.
  requests[0]({ok:true,json:async()=>({revision:'old'})});await Promise.all([first,second]);
  assert.equal(deliveries.length,1);
  const newer=context.syncQueue(1);await tick();requests[1]({ok:true,json:async()=>({revision:'new'})});await newer;
  assert.deepEqual(deliveries.map(d=>d.data.revision),['old','new']);

  const stale=context.syncQueue(1);await tick();selected={tabId:1,connectionId:'session-b'};
  requests[2]({ok:true,json:async()=>({revision:'wrong-session'})});await stale;
  assert.equal(deliveries.length,2); // A reconnect invalidates old in-flight responses even for the same tab.

  const existing=context.syncQueue(1);await tick();const forced=context.syncQueue(1,true);await tick();
  assert.equal(requests.length,4);
  requests[3]({ok:true,json:async()=>({revision:'before-end'})});await existing;await tick();
  assert.equal(requests.length,5); // End/next actions fetch again after the existing request has settled.
  requests[4]({ok:true,json:async()=>({revision:'after-end'})});await forced;
  assert.equal(deliveries.at(-1).data.revision,'after-end');
  const failed=context.syncQueue(1);await tick();requests[5]({ok:false,status:503});
  await assert.rejects(failed);
  const retry=context.syncQueue(1);await tick();requests[6]({ok:true,json:async()=>({revision:'recovered'})});await retry;
  assert.equal(deliveries.at(-1).data.revision,'recovered');
  console.log('Extension background tests passed: serialized/coalesced queue, reconnect invalidation, forced fresh read, failure/recovery');
})().catch(error=>{console.error(error);process.exitCode=1;});
