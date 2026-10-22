const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const elements=Object.fromEntries(['status','connection','title','connect','disconnect'].map(key=>['#'+key,{textContent:'',dataset:{},disabled:false,hidden:false}]));
  let current={linked:true,online:true,onThisTab:true,title:'현재 영상 제목',videoState:'playing'},refresh;
  const context={document:{querySelector:id=>elements[id]},chrome:{tabs:{query:async()=>[{id:1,url:'https://www.youtube.com/watch?v=12345678901'}]},
    runtime:{sendMessage:async message=>{if(message.type==='disconnect')current={linked:false};return {ok:true,status:current};}}},setInterval:callback=>refresh=callback};
  vm.createContext(context);vm.runInContext(fs.readFileSync('browser-extension/popup.js','utf8'),context);await tick();
  assert.equal(elements['#connection'].textContent,'● 이 탭 연결됨');
  assert.equal(elements['#title'].textContent,'현재 영상 제목');assert.equal(elements['#connect'].disabled,true);
  current={...current,onThisTab:false};await refresh();assert.equal(elements['#connect'].textContent,'이 탭으로 변경');assert.equal(elements['#connection'].dataset.state,'other');
  current={...current,onThisTab:true,online:false};await refresh();assert.equal(elements['#connection'].textContent,'⚠ 봇 연결 확인 필요');
  assert.equal(elements['#connect'].disabled,false);assert.equal(elements['#connect'].textContent,'다시 연결');
  await elements['#disconnect'].onclick();assert.equal(elements['#connection'].textContent,'○ 연결 안 됨');
  assert.equal(elements['#title'].hidden,true);assert.equal(elements['#disconnect'].disabled,true);
  console.log('Popup tests passed: connected, selected video title, different tab, offline, disconnect');
})().catch(error=>{console.error(error);process.exitCode=1;});
