const status = document.querySelector('#status');
document.querySelector('#connect').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const result = await chrome.runtime.sendMessage({type: 'connect', tabId: tab.id});
    status.textContent = result.ok ? '연결됐어요. /현재곡으로 확인하세요.' : result.error + ' 확장 설치 후 기존 유튜브 탭은 새로고침해주세요.';
  } catch (_) { status.textContent = '연결하지 못했어요. 유튜브 탭과 봇 실행을 확인해주세요.'; }
};
document.querySelector('#disconnect').onclick = async () => {
  const result = await chrome.runtime.sendMessage({type: 'disconnect'});
  status.textContent = result.ok ? '연결을 해제했어요.' : result.error;
};
