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
    const {queueCursor} = await chrome.storage.local.get('queueCursor');
    await chrome.tabs.sendMessage(tabId, {type: 'queueSnapshot', data, requestedAt,
      cursor: queueCursor?.tabId === tabId ? queueCursor : null});
  })();
  queueFlights.set(key, flight);
  try { await flight; } finally { if (queueFlights.get(key) === flight) queueFlights.delete(key); }
}
function queued(data) {
  chain = chain.catch(() => {}).then(() => send(data));
  return chain;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (message.type === 'report') {
      const {tabId} = await chrome.storage.session.get('tabId');
      if (sender.tab?.id !== tabId || sender.frameId !== 0) return;
      await queued(message.data);
      await syncQueue(tabId);
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
      await chrome.storage.session.set({tabId: tab.id, connectionId: crypto.randomUUID()});
      await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['queue.js', 'content.js']});
      await queued({state: 'unavailable'});
      await chrome.tabs.sendMessage(tab.id, {type: 'reportNow'});
      await syncQueue(tab.id);
    } else if (message.type === 'disconnect' && !sender.tab) {
      const previous = await chrome.storage.session.get('tabId');
      await chrome.storage.session.remove(['tabId', 'connectionId']);
      if (previous.tabId) await chrome.tabs.sendMessage(previous.tabId, {type: 'disconnectQueue'}).catch(() => {});
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
