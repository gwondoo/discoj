const el = id => document.getElementById(id);
let player, socket, state, activeSession = '', started = false, heartbeat, reconnectTimer;
const labels = {idle:'추천 대기 중',loading:'영상 로드 중',playing:'재생 중',paused:'일시정지',buffering:'버퍼링 중',blocked:'영상 안의 재생 버튼을 눌러주세요',offline:'서버 연결 끊김',error:'재생 오류'};
function report(event) {
  if (socket?.readyState !== WebSocket.OPEN || !activeSession) return;
  socket.send(JSON.stringify({type:'event', session:activeSession, event, title:player?.getVideoData()?.title || ''}));
}
function applyState() {
  if (!state) return;
  el('current').textContent = state.current ? `${state.current.fallback ? '☕' : '🎵'} ${state.current.title} · ${state.current.requester}` : '현재 곡 없음';
  el('status').textContent = started ? (labels[state.status] || state.status) : '재생 시작 버튼을 눌러주세요.';
  if (!started || state.session === activeSession) return;
  activeSession = state.session;
  // New iframe per session keeps old video's delayed events from advancing the new track.
  if (player) player.destroy();
  const slot = document.createElement('div'); slot.id = 'player';
  document.querySelector('.video').replaceChildren(slot);
  if (state.current) createPlayer(state.current.video_id, activeSession);
}
function createPlayer(videoId, session) {
  player = new YT.Player('player', {
    width:'100%', height:'100%', videoId,
    playerVars:{playsinline:1, origin:location.origin},
    events:{
      onReady: ({target}) => {
        if (session !== activeSession) return;
        target.setVolume(30); target.unMute();
        if (started && videoId) target.playVideo();
      },
      onStateChange: ({data}) => {
        if (session !== activeSession) return;
        const event = ({0:'ended',1:'playing',2:'paused',3:'buffering'})[data];
        if (event) report(event);
      },
      onAutoplayBlocked: () => { if(session === activeSession) report('blocked'); },
      onError: () => { if(session === activeSession) report('error'); },
    },
  });
}
function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/player`);
  socket.onopen = () => {
    el('connection').textContent = '서버 연결됨';
    clearInterval(heartbeat);
    heartbeat = setInterval(() => { if(socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:'ping'})); },10000);
  };
  socket.onmessage = ({data}) => { const message = JSON.parse(data); if(message.type === 'state') {state = message; applyState();} };
  socket.onclose = () => {
    clearInterval(heartbeat);
    if(player?.pauseVideo) player.pauseVideo();
    started = false; activeSession = ''; state = null;
    el('connection').textContent = '연결 끊김 · 다른 재생기가 연결됐거나 서버가 재시작됐어요';
    el('status').textContent = '5초 후 다시 연결합니다. 연결 후 재생 시작을 눌러주세요.';
    clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect,5000);
  };
}
window.onYouTubeIframeAPIReady = () => {
  el('start').disabled = false;
  el('start').onclick = () => {
    if(socket?.readyState !== WebSocket.OPEN) return;
    started = true; activeSession = ''; applyState();
    if(player?.playVideo && state?.current) player.playVideo();
  };
  connect();
};
window.addEventListener('pagehide', () => { clearTimeout(reconnectTimer); clearInterval(heartbeat); if(socket) { socket.onclose=null; socket.close(); } });
