importScripts('config.js');
let chain = Promise.resolve();
async function send(data) {
  const response = await fetch('http://127.0.0.1:18766/playback', {
    method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + DISCOJ_TOKEN},
    body: JSON.stringify(data), signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error('연결 실패 (' + response.status + ')');
}
const queueFlights = new Map();
async function syncQueue(tabId, force = false) {
  const selected = await chrome.storage.session.get(['tabId', 'connectionId']);
  if (selected.tabId !== tabId) return;
  const key = `${tabId}:${selected.connectionId || 'legacy'}`;
  if (queueFlights.has(key)) {
    if (!force) return queueFlights.get(key);
    try { await queueFlights.get(key); } catch (_) {}
    return syncQueue(tabId);
  }
  const flight = (async () => {
    const requestedAt = Date.now();
    const response = await fetch('http://127.0.0.1:18766/queue', {
      headers: {Authorization: 'Bearer ' + DISCOJ_TOKEN}, signal: AbortSignal.timeout(5000), cache: 'no-store'
    });
    if (!response.ok) throw new Error('목록 연결 실패 (' + response.status + ')');
    const data = await response.json();
    const latest = await chrome.storage.session.get(['tabId', 'connectionId']);
    if (latest.tabId !== tabId || latest.connectionId !== selected.connectionId) return;
    const {queueCursor, repeatMode} = await chrome.storage.local.get(['queueCursor', 'repeatMode']);
    data.repeatMode = repeatMode === 'one' ? 'one' : 'all';
    await chrome.tabs.sendMessage(tabId, {type: 'queueSnapshot', data, requestedAt,
      cursor: queueCursor?.tabId === tabId ? queueCursor : null});
    await chrome.storage.session.set({lastSyncAt: Date.now(), lastSyncConnection: selected.connectionId});
  })();
  queueFlights.set(key, flight);
  try { await flight; } finally { if (queueFlights.get(key) === flight) queueFlights.delete(key); }
}
async function connectionStatus(activeTabId) {
  const state = await chrome.storage.session.get(['tabId', 'connectionId', 'lastSyncAt', 'lastSyncConnection', 'videoTitle', 'videoState']);
  if (!state.tabId) return {linked: false};
  let tab;
  try { tab = await chrome.tabs.get(state.tabId); } catch (_) { return {linked: false}; }
  return {linked: true, onThisTab: state.tabId === activeTabId,
    online: state.lastSyncConnection === state.connectionId && Date.now() - (state.lastSyncAt || 0) < 30000,
    title: state.videoTitle || tab.title?.replace(/ - YouTube$/, '') || '유튜브 탭',
    videoState: state.videoState};
}
let controlFlight = null;
async function pollControl(tabId) {
  if (controlFlight) return controlFlight;
  controlFlight = (async () => {
    const selected = await chrome.storage.session.get(['tabId', 'connectionId']);
    if (selected.tabId !== tabId || !selected.connectionId) return;
    const headers = {Authorization: 'Bearer ' + DISCOJ_TOKEN};
    const response = await fetch('http://127.0.0.1:18766/control?session=' + encodeURIComponent(selected.connectionId),
      {headers, cache: 'no-store', signal: AbortSignal.timeout(4000)});
    if (response.status === 204) return;
    if (!response.ok) throw new Error('조작 연결 실패');
    const command = await response.json();
    let result;
    try {
      const latest = await chrome.storage.session.get(['tabId', 'connectionId']);
      if (latest.tabId !== tabId || latest.connectionId !== command.session || Date.now() >= command.expiresAt)
        throw new Error('재생 탭 연결이 변경됐어요. 다시 요청해주세요.');
      if (['previous', 'next', 'select'].includes(command.action)) await syncQueue(tabId, true);
      const afterSync = await chrome.storage.session.get(['tabId', 'connectionId']);
      if (afterSync.tabId !== tabId || afterSync.connectionId !== command.session) throw new Error('재생 탭 연결이 변경됐어요.');
      result = await chrome.tabs.sendMessage(tabId, {type: 'control', command});
      if (!result || typeof result.ok !== 'boolean') throw new Error('재생 탭의 응답을 확인하지 못했어요.');
      if (result.ok && result.playback) await queued({...result.playback, session: command.session});
    } catch (error) { result = {ok: false, error: error.message}; }
    await fetch('http://127.0.0.1:18766/control/ack', {method: 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({id: command.id, session: command.session, result}), signal: AbortSignal.timeout(4000)});
  })();
  try { await controlFlight; } finally { controlFlight = null; }
}
function queued(data) {
  chain = chain.catch(() => {}).then(() => send(data));
  return chain;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (message.type === 'status' && !sender.tab) {
      respond({ok: true, status: await connectionStatus(message.tabId)});
      return;
    } else if (message.type === 'report') {
      const {tabId} = await chrome.storage.session.get('tabId');
      if (sender.tab?.id !== tabId || sender.frameId !== 0) return;
      await chrome.storage.session.set({videoTitle: message.data.title || '', videoState: message.data.state});
      const selected = await chrome.storage.session.get('connectionId');
      await queued({...message.data, session: selected.connectionId});
      await pollControl(tabId);
      await syncQueue(tabId);
    } else if (message.type === 'setRepeat') {
      const selected = await chrome.storage.session.get('tabId');
      if (sender.tab?.id !== selected.tabId || sender.frameId !== 0 || !['all', 'one'].includes(message.value)) throw new Error('반복 모드를 저장하지 못했어요.');
      await chrome.storage.local.set({repeatMode: message.value});
    } else if (message.type === 'saveCursor' || message.type === 'syncNow') {
      const {tabId} = await chrome.storage.session.get('tabId');
      if (sender.tab?.id !== tabId || sender.frameId !== 0) return;
      if (message.type === 'syncNow') await syncQueue(tabId, true);
      else await chrome.storage.local.set({queueCursor: {...message.cursor, tabId}});
    } else if (message.type === 'connect' && !sender.tab) {
      const tab = await chrome.tabs.get(message.tabId);
      if (!tab.url?.startsWith('https://www.youtube.com/')) throw new Error('유튜브 탭에서 연결해주세요.');
      const previous = await chrome.storage.session.get('tabId');
      if (previous.tabId && previous.tabId !== tab.id) {
        await chrome.tabs.sendMessage(previous.tabId, {type: 'disconnectQueue'}).catch(() => {});
      }
      await chrome.storage.session.set({tabId: tab.id, connectionId: crypto.randomUUID(), lastSyncAt: 0, videoTitle: '', videoState: 'unavailable'});
      await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['queue.js', 'progress.js', 'content.js']});
      await queued({state: 'unavailable'});
      await chrome.tabs.sendMessage(tab.id, {type: 'reportNow'});
      await syncQueue(tab.id);
    } else if (message.type === 'disconnect' && !sender.tab) {
      const previous = await chrome.storage.session.get('tabId');
      await chrome.storage.session.remove(['tabId', 'connectionId']);
      if (previous.tabId) {
        await chrome.tabs.sendMessage(previous.tabId, {type: 'disconnectQueue'}).catch(() => {});
      }
      await queued({state: 'unavailable'});
    }
    respond({ok: true});
  })().catch(error => respond({ok: false, error: error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(async id => {
  const {tabId} = await chrome.storage.session.get('tabId');
  if (id === tabId) {
    await chrome.storage.session.remove(['tabId', 'connectionId']);
    await chrome.storage.local.remove('queueCursor');
    queued({state: 'unavailable'}).catch(() => {});
  }
});


importScripts('on-demand.js');
