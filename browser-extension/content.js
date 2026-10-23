(() => {
  globalThis.discojContentCleanup?.();
  // Old extension worlds can survive an extension reload. Fence them without reloading media.
  const root = document.documentElement;
  const legacyPanels = [...document.querySelectorAll('#discoj-live-queue')];
  if (legacyPanels.length && !root.dataset.discojOwner) {
    const url = new URL(location.href);
    if (url.searchParams.has('list')) {
      url.searchParams.set('discoj_list', url.searchParams.get('list'));
      url.searchParams.delete('list');
      history.replaceState(history.state, '', url.href);
    }
  }
  legacyPanels.forEach(element => element.remove());
  const owner = String(Date.now()) + Math.random();
  root.dataset.discojOwner = owner;
  const ownsPage = () => root.dataset.discojOwner === owner;
  const pagePlaylist = () => {
    const params = new URL(location.href).searchParams;
    return params.get('list') || params.get('discoj_list');
  };
  let navigating = false, connected = false, snapshot = null, received = 0, panel = null, nativePanel = null;
  let disconnected = false, transition = false, pending = null;
  const queue = new globalThis.DiscoJQueue();
  const listeners = [];
  const currentId = () => new URL(location.href).searchParams.get('v');
  const active = () => ownsPage() && connected && snapshot && location.pathname === '/watch' &&
    pagePlaylist() === snapshot.playlistId;
  function listen(target, event, callback, capture = false) {
    target.addEventListener(event, callback, capture);
    listeners.push(() => target.removeEventListener(event, callback, capture));
  }
  function restore() {
    panel?.remove(); panel = null;
    if (nativePanel) { nativePanel.style.removeProperty('display'); nativePanel = null; }
  }
  function navigate(item) {
    if (!item || transition || disconnected || Date.now() - received > 30000) return;
    transition = true;
    const url = new URL('https://www.youtube.com/watch');
    url.searchParams.set('v', item.video_id); url.searchParams.set('list', snapshot.playlistId);
    location.assign(url.href);
  }
  function saveCursor() {
    chrome.runtime.sendMessage({type: 'saveCursor', cursor: {...queue.cursor(), waitingForNext: pending?.auto === true}}).catch(() => {});
  }
  function applyPending(requestedAt) {
    if (!pending || !active() || navigating || requestedAt < pending.createdAt) return;
    const video = document.querySelector('video.html5-main-video');
    if (pending.auto && !video?.ended) { pending = null; saveCursor(); return; }
    const item = pending.id ? queue.items.find(item => item.video_id === pending.id) :
      pending.direction === 'next' ? queue.next() : queue.previous();
    if (item) { pending = null; saveCursor(); navigate(item); }
    else if (!pending.auto) { pending = null; saveCursor(); }
  }
  function step(direction, auto = false, id = null) {
    if (!active() || transition) return;
    const action = {direction, auto, id, createdAt: Date.now()};
    pending = action;
    saveCursor();
    chrome.runtime.sendMessage({type: 'syncNow'}).then(result => {
      if (result?.ok === false) throw new Error('sync failed');
    }).catch(() => {
      if (pending !== action) return;
      disconnected = true;
      if (!pending?.auto) pending = null;
      render();
    });
  }
  function render() {
    if (!active()) { restore(); return; }
    const native = document.querySelector('ytd-playlist-panel-renderer');
    if (!native) return;
    if (!panel || !panel.isConnected) {
      panel = document.createElement('section'); panel.id = 'discoj-live-queue';
      native.parentElement.insertBefore(panel, native);
      panel.attachShadow({mode: 'open'});
    }
    nativePanel = native; native.style.setProperty('display', 'none', 'important');
    const root = panel.shadowRoot; root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = ':host{display:block;color:var(--yt-spec-text-primary,#eee);background:var(--yt-spec-badge-chip-background,#222);border-radius:12px;padding:14px;font:14px sans-serif}h3{margin:0 0 8px}p{font-size:12px;opacity:.8}button{color:inherit;background:transparent;border:1px solid #777;border-radius:7px;padding:9px;cursor:pointer}button:disabled{opacity:.4;cursor:default}.track{display:block;width:100%;text-align:left;margin:5px 0;border-color:transparent}.current{border-color:#9bc86d}.list{max-height:450px;overflow:auto}';
    root.append(style);
    const heading = document.createElement('h3'); heading.textContent = `DiscoJ · ${queue.items.length}곡`; root.append(heading);
    const info = document.createElement('p');
    info.textContent = disconnected ? '봇 연결 끊김 · 마지막 동기화 목록' : '전체 반복 · 추가·삭제 자동 반영'; root.append(info);
    if (!queue.items.some(item => item.video_id === currentId())) {
      const removed = document.createElement('p'); removed.textContent = '현재 영상은 목록에서 제거됐어요. 재생은 끝까지 유지해요.'; root.append(removed);
    }
    const previous = document.createElement('button'); previous.textContent = '이전'; previous.disabled = disconnected || !queue.previous(); previous.onclick = () => step('previous'); root.append(previous);
    const next = document.createElement('button'); next.textContent = '다음'; next.disabled = disconnected || !queue.next(); next.onclick = () => step('next'); root.append(next);
    const list = document.createElement('div'); list.className = 'list';
    for (const item of queue.items) {
      const button = document.createElement('button'); button.className = 'track' + (item.video_id === currentId() ? ' current' : '');
      button.textContent = item.title; button.disabled = disconnected; button.onclick = () => step(null, false, item.video_id); list.append(button);
    }
    root.append(list);
  }
  function report() {
    if (!ownsPage()) return;
    const id = currentId();
    const video = document.querySelector('video.html5-main-video');
    const title = document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent?.trim();
    const valid = !navigating && location.pathname === '/watch' && /^[\w-]{11}$/.test(id || '') && video && video.readyState >= 2 && title;
    const data = valid ? {state: video.paused || video.ended ? 'paused' : 'playing', title: title.slice(0, 500), videoId: id, volume: Math.round(video.muted ? 0 : video.volume * 100)} : {state: 'unavailable'};
    chrome.runtime.sendMessage({type: 'report', data}).catch(() => {});
    if (connected && Date.now() - received > 30000 && !disconnected) { disconnected = true; render(); }
  }
  async function executeControl(command) {
    if (!ownsPage() || !connected || navigating || transition || Date.now() >= command.expiresAt || command.videoId !== currentId())
      return {ok: false, error: '현재 영상이나 연결 상태가 바뀌었어요. 다시 요청해주세요.'};
    const video = document.querySelector('video.html5-main-video');
    if (!video || video.readyState < 2) return {ok: false, error: '재생 가능한 영상을 찾지 못했어요.'};
    let message;
    if (command.action === 'pause' || command.action === 'play') {
      pending = null;
      if (command.action === 'pause') video.pause();
      else await video.play();
      await new Promise(resolve => setTimeout(resolve, 300));
      const expectedPaused = command.action === 'pause';
      if (!ownsPage() || navigating || command.videoId !== currentId() ||
          document.querySelector('video.html5-main-video') !== video ||
          video.paused !== expectedPaused || (!expectedPaused && video.ended)) {
        report();
        return {ok: false, error: '유튜브의 실제 재생 상태를 확인하지 못했어요. 현재 상태를 확인 후 다시 눌러주세요.'};
      }
      message = expectedPaused ? '일시정지했어요.' : '재생했어요.';
    }
    else if (['previous', 'next', 'select'].includes(command.action)) {
      if ((command.action !== 'select' && !active()) || !snapshot || disconnected || Date.now() - received > 30000)
        return {ok: false, error: '최신 재생목록을 확인하지 못했어요.'};
      const item = command.action === 'select' ? queue.items.find(item => item.video_id === command.value) :
        command.action === 'next' ? queue.next() : queue.previous();
      if (command.action === 'select' && !item) return {ok: false, error: '이미 삭제됐거나 없는 곡이에요. 목록을 다시 확인해주세요.'};
      if (!item) return {ok: false, error: command.action === 'next' ? '다음 곡이 없어요.' : '이전 곡이 없어요.'};
      pending = null; saveCursor();
      // Acknowledge the navigation request before this document is unloaded.
      setTimeout(() => { if (ownsPage()) navigate(item); }, 150);
      return {ok: true, message: command.action === 'select' ? '선택한 곡 재생을 요청했어요.' :
        command.action === 'next' ? '다음 곡 재생을 요청했어요.' : '이전 곡 재생을 요청했어요.'};
    } else if (['volume', 'volume_up', 'volume_down'].includes(command.action)) {
      const current = video.muted ? 0 : Math.round(video.volume * 100);
      const value = command.action === 'volume' ? command.value : current + (command.action === 'volume_up' ? 10 : -10);
      if (!Number.isInteger(value)) return {ok: false, error: '음량은 0~100 사이로 입력해주세요.'};
      video.volume = Math.max(0, Math.min(100, value)) / 100;
      video.muted = video.volume === 0;
      message = `유튜브 음량을 ${Math.round(video.volume * 100)}%로 설정했어요.`;
    } else return {ok: false, error: '지원하지 않는 조작이에요.'};
    report();
    return {ok: true, message, playback: {state: video.paused || video.ended ? 'paused' : 'playing',
      videoId: currentId(), volume: Math.round(video.muted ? 0 : video.volume * 100),
      title: document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent?.trim()?.slice(0, 500) || '현재 영상'}};
  }
  function onMessage(message, sender, respond) {
    if (!ownsPage()) return;
    if (message.type === 'control') {
      executeControl(message.command).then(respond).catch(() => respond({ok: false, error: '브라우저에서 재생 조작을 적용하지 못했어요.'}));
      return true;
    }
    if (message.type === 'reportNow') report();
    if (message.type === 'disconnectQueue') { saveCursor(); connected = false; snapshot = null; pending = null; restore(); }
    if (message.type === 'queueSnapshot' && message.data && Array.isArray(message.data.items)) {
      const changed = snapshot?.revision !== message.data.revision || !connected || disconnected || queue.current !== currentId();
      const first = !connected;
      if (first) {
        queue.restore(message.cursor, message.data.playlistId, currentId());
        if (message.cursor?.waitingForNext && message.cursor.current === currentId() &&
            message.cursor.playlistId === message.data.playlistId &&
            document.querySelector('video.html5-main-video')?.ended) {
          pending = {direction: 'next', auto: true, createdAt: message.requestedAt || Date.now()};
        }
      }
      connected = true; received = Date.now(); disconnected = false; snapshot = message.data;
      queue.update(snapshot, currentId());
      saveCursor();
      applyPending(message.requestedAt || 0);
      if (changed || !panel?.isConnected) render();
    }
  }
  chrome.runtime.onMessage.addListener(onMessage);
  listen(document, 'yt-navigate-start', () => { navigating = true; pending = null; report(); });
  listen(document, 'yt-navigate-finish', () => { navigating = false; transition = false; if (snapshot) queue.update(snapshot, currentId()); render(); report(); });
  for (const event of ['play', 'pause', 'volumechange', 'loadeddata', 'emptied']) listen(document, event, () => {
    if (pending?.auto && !document.querySelector('video.html5-main-video')?.ended) { pending = null; saveCursor(); }
    report();
  }, true);
  // Capture the natural end before target/document listeners use YouTube's stale queue.
  listen(window, 'ended', event => {
    if (!active() || event.target !== document.querySelector('video.html5-main-video') ||
        document.querySelector('.html5-video-player.ad-showing')) return;
    event.stopImmediatePropagation();
    step('next', true);
    report();
  }, true);
  listen(window, 'click', event => {
    if (!active()) return;
    const button = event.target.closest?.('.ytp-next-button, .ytp-prev-button');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    step(button.classList.contains('ytp-next-button') ? 'next' : 'previous');
  }, true);
  listen(window, 'keydown', event => {
    if (!active() || !event.shiftKey || !['N','P'].includes(event.key.toUpperCase()) ||
        event.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); step(event.key.toUpperCase() === 'N' ? 'next' : 'previous');
  }, true);
  const timer = setInterval(report, 5000);
  globalThis.discojContentCleanup = () => { clearInterval(timer); listeners.forEach(remove => remove()); chrome.runtime.onMessage.removeListener(onMessage); restore(); };
  report();
})();
