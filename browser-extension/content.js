(() => {
  globalThis.discojContentCleanup?.();
  let navigating = false, connected = false, snapshot = null, received = 0, panel = null, nativePanel = null;
  let disconnected = false, transition = false;
  const queue = new globalThis.DiscoJQueue();
  const listeners = [];
  const currentId = () => new URL(location.href).searchParams.get('v');
  const active = () => connected && snapshot && location.pathname === '/watch' &&
    new URL(location.href).searchParams.get('list') === snapshot.playlistId;
  function listen(target, event, callback, capture = false) {
    target.addEventListener(event, callback, capture);
    listeners.push(() => target.removeEventListener(event, callback, capture));
  }
  function restore() {
    panel?.remove(); panel = null;
    if (nativePanel) { nativePanel.style.removeProperty('display'); nativePanel = null; }
  }
  function navigate(item) {
    if (!item || transition) return;
    transition = true;
    const url = new URL('https://www.youtube.com/watch');
    url.searchParams.set('v', item.video_id); url.searchParams.set('list', snapshot.playlistId);
    location.assign(url.href);
  }
  function step(direction) { navigate(direction === 'next' ? queue.next() : queue.previous()); }
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
    info.textContent = disconnected ? '봇 연결 끊김 · 마지막 동기화 목록' : '추가·삭제 자동 반영 · 현재 영상은 유지'; root.append(info);
    if (!queue.items.some(item => item.video_id === currentId())) {
      const removed = document.createElement('p'); removed.textContent = '현재 영상은 목록에서 제거됐어요. 재생은 끝까지 유지해요.'; root.append(removed);
    }
    const previous = document.createElement('button'); previous.textContent = '이전'; previous.disabled = !queue.previous(); previous.onclick = () => step('previous'); root.append(previous);
    const next = document.createElement('button'); next.textContent = '다음'; next.disabled = !queue.next(); next.onclick = () => step('next'); root.append(next);
    const list = document.createElement('div'); list.className = 'list';
    for (const item of queue.items) {
      const button = document.createElement('button'); button.className = 'track' + (item.video_id === currentId() ? ' current' : '');
      button.textContent = `${item.number} · ${item.title}`; button.onclick = () => navigate(item); list.append(button);
    }
    root.append(list);
  }
  function report() {
    const id = currentId();
    const video = document.querySelector('video.html5-main-video');
    const title = document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent?.trim();
    const valid = !navigating && location.pathname === '/watch' && /^[\w-]{11}$/.test(id || '') && video && video.readyState >= 2 && title;
    const data = valid ? {state: video.paused || video.ended ? 'paused' : 'playing', title: title.slice(0, 500), videoId: id} : {state: 'unavailable'};
    chrome.runtime.sendMessage({type: 'report', data}).catch(() => {});
    if (connected && Date.now() - received > 30000 && !disconnected) { disconnected = true; render(); }
  }
  function onMessage(message) {
    if (message.type === 'reportNow') report();
    if (message.type === 'disconnectQueue') { connected = false; snapshot = null; restore(); }
    if (message.type === 'queueSnapshot' && message.data && Array.isArray(message.data.items)) {
      const changed = snapshot?.revision !== message.data.revision || !connected || disconnected || queue.current !== currentId();
      connected = true; received = Date.now(); disconnected = false; snapshot = message.data;
      queue.update(snapshot, currentId());
      if (changed || !panel?.isConnected) render();
    }
  }
  chrome.runtime.onMessage.addListener(onMessage);
  listen(document, 'yt-navigate-start', () => { navigating = true; report(); });
  listen(document, 'yt-navigate-finish', () => { navigating = false; transition = false; if (snapshot) queue.update(snapshot, currentId()); render(); report(); });
  for (const event of ['play', 'pause', 'loadeddata', 'emptied']) listen(document, event, report, true);
  // Capture the natural end before target/document listeners use YouTube's stale queue.
  listen(window, 'ended', event => {
    if (!active() || event.target !== document.querySelector('video.html5-main-video') ||
        document.querySelector('.html5-video-player.ad-showing')) return;
    event.stopImmediatePropagation();
    step('next');
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
