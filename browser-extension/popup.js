const status = document.querySelector('#status');
const connection = document.querySelector('#connection');
const title = document.querySelector('#title');
const connect = document.querySelector('#connect');
const disconnect = document.querySelector('#disconnect');
let busy = false;
async function refreshStatus() {
  if (busy) return;
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const result = await chrome.runtime.sendMessage({type: 'status', tabId: tab?.id});
    if (!result?.ok) throw new Error('status');
    const state = result.status;
    const canConnect = tab?.url?.startsWith('https://www.youtube.com/');
    connection.dataset.state = state.linked ? state.online ? state.onThisTab ? 'online' : 'other' : 'offline' : 'none';
    connection.textContent = !state.linked ? '○ 연결 안 됨' : !state.online ? '⚠ 봇 연결 확인 필요' :
      state.onThisTab ? '● 이 탭 연결됨' : '● 다른 탭 연결됨';
    title.hidden = !state.linked;
    title.textContent = state.linked ? `${state.videoState === 'paused' ? '일시정지 · ' : ''}${state.title}` : '';
    connect.disabled = !canConnect || Boolean(state.linked && state.online && state.onThisTab);
    connect.textContent = state.linked && state.onThisTab ? state.online ? '연결됨' : '다시 연결' : state.linked ? '이 탭으로 변경' : '이 탭 연결';
    disconnect.disabled = !state.linked;
  } catch (_) {
    connection.dataset.state = 'offline'; connection.textContent = '⚠ 연결 상태를 확인하지 못했어요.';
    connect.disabled = disconnect.disabled = true;
  }
}
async function action(type) {
  busy = true; connect.disabled = disconnect.disabled = true; status.textContent = '';
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const result = await chrome.runtime.sendMessage({type, tabId: tab?.id});
    if (!result?.ok) throw new Error(result?.error || '연결 요청에 실패했어요.');
  } catch (error) { status.textContent = error.message; }
  finally { busy = false; await refreshStatus(); }
}
connect.onclick = () => action('connect');
disconnect.onclick = () => action('disconnect');
refreshStatus();
setInterval(refreshStatus, 2000);
