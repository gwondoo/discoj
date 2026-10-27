// Persistent push channel only: no periodic tab probing or recovery.
// Heartbeats keep Chrome's MV3 worker alive; only a user play request recovers tabs.
let pushSocket = null, pushRetry = null, pushDelay = 1000, playRecovery = null;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function watchTab(tab) {
  try { const u = new URL(tab.url); return u.origin === 'https://www.youtube.com' && u.pathname === '/watch' && /^[\w-]{11}$/.test(u.searchParams.get('v') || ''); }
  catch (_) { return false; }
}
async function ensurePlayTarget(command) {
  if (playRecovery) return playRecovery;
  playRecovery = (async () => {
    let selected = await chrome.storage.session.get(['tabId', 'connectionId']);
    let tab;
    if (selected.tabId) {
      try { const existing = await chrome.tabs.get(selected.tabId); if (watchTab(existing)) tab = existing; } catch (_) {}
    }
    if (!tab) {
      const tabs = await chrome.tabs.query({url: 'https://www.youtube.com/*'});
      const audible = tabs.filter(t => t.audible && watchTab(t));
      if (audible.length > 1) throw Error('재생 중인 유튜브 탭이 여러 개예요. 확장에서 사용할 탭을 선택해주세요.');
      const {lastPlaybackUrl} = await chrome.storage.local.get('lastPlaybackUrl');
      tab = audible[0] || tabs.find(t => watchTab(t) && t.url === lastPlaybackUrl) ||
        tabs.find(t => { try { const u=new URL(t.url); return u.searchParams.get('list') === command.playlistId || u.searchParams.get('discoj_list') === command.playlistId; } catch (_) { return false; } });
      if (!tab) {
        if (!command.hasTracks) throw Error('재생목록이 비어 있어요. 곡을 먼저 추가해주세요.');
        const url = new URL(command.url);
        if (url.origin !== 'https://www.youtube.com' || url.pathname !== '/watch' || url.searchParams.get('list') !== command.playlistId) throw Error('재생목록 주소를 확인해주세요.');
        tab = await chrome.tabs.create({url: url.href, active: true});
      }
    }
    if (tab.discarded || tab.frozen) await chrome.tabs.update(tab.id, {active: true});
    if (!watchTab(tab)) {
      // Reuse a playlist landing page; do not make a second tab.
      if (!command.hasTracks) throw Error('재생목록이 비어 있어요. 곡을 먼저 추가해주세요.');
      tab = await chrome.tabs.update(tab.id, {url: command.url});
    }
    const latest = await chrome.storage.session.get(['tabId', 'connectionId']);
    if (latest.tabId !== selected.tabId || latest.connectionId !== selected.connectionId)
      throw Error('사용할 재생 탭이 바뀌었어요. 다시 눌러주세요.');
    if (selected.tabId !== tab.id || !selected.connectionId) {
      if (selected.tabId) await chrome.tabs.sendMessage(selected.tabId, {type:'disconnectQueue'}).catch(()=>{});
      selected = {tabId:tab.id, connectionId:crypto.randomUUID()};
      await chrome.storage.session.set({...selected, lastSyncAt:0});
    }
    const end = Date.now() + 14000;
    let injected = false;
    while (Date.now() < end) {
      const owner = await chrome.storage.session.get(['tabId', 'connectionId']);
      if (owner.tabId !== selected.tabId || owner.connectionId !== selected.connectionId) throw Error('재생 탭 연결이 변경됐어요.');
      let response;
      try { response = await chrome.tabs.sendMessage(tab.id, {type:'probePlayback'}); } catch (_) {}
      if (!response?.ok && !injected) {
        try {
          await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['queue.js','progress.js','content.js']});
          injected = true;
        } catch (_) { /* The new page may still be loading. */ }
      }
      try { await syncQueue(tab.id); }
      catch (error) {
        if (!/Receiving end does not exist|Could not establish connection/i.test(error.message)) throw error;
      }
      if (response?.ok && response.data?.state !== 'unavailable') {
        await queued({...response.data, session:selected.connectionId});
        await chrome.storage.session.set({videoTitle:response.data.title || '',videoState:response.data.state});
        const currentTab = await chrome.tabs.get(tab.id);
        await chrome.storage.local.set({lastPlaybackUrl:currentTab.url});
        return;
      }
      await wait(350);
    }
    throw Error('유튜브 영상을 준비하지 못했어요. 로그인이나 재생 화면을 확인해주세요.');
  })();
  try { return await playRecovery; } finally { playRecovery = null; }
}
function connectPush() {
  if (pushSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(pushSocket.readyState)) return;
  const socket = new WebSocket('ws://127.0.0.1:18766/events');
  pushSocket = socket;
  let heartbeat;
  socket.onopen = () => {
    pushDelay = 1000;
    socket.send(JSON.stringify({token:DISCOJ_TOKEN}));
    heartbeat = setInterval(() => { if(socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify({type:'ping'})); }, 20000);
  };
  socket.onmessage = event => {
    (async()=>{
      const command = JSON.parse(event.data);
      if(command.type === 'recover') {
        let result;
        try { await ensurePlayTarget(command); result={ok:true}; }
        catch(error) { result={ok:false,error:error.message}; }
        if(socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify({type:'recoverResult',id:command.id,...result}));
      } else if(command.type === 'controlReady') {
        const {tabId}=await chrome.storage.session.get('tabId');
        if(tabId) await pollControl(tabId);
      }
    })().catch(()=>{});
  };
  socket.onerror = () => socket.close();
  socket.onclose = () => {
    clearInterval(heartbeat);
    if(pushSocket===socket) pushSocket=null;
    clearTimeout(pushRetry);
    pushRetry=setTimeout(connectPush,pushDelay);
    pushDelay=Math.min(pushDelay*2,30000);
  };
}
// Remove the old 30-second watchdog even when upgrading an existing installation.
chrome.alarms?.clear('discoj-recovery').catch(()=>{});
chrome.runtime.onStartup?.addListener(connectPush);
chrome.runtime.onInstalled?.addListener(connectPush);
if (typeof WebSocket !== 'undefined') connectPush();
