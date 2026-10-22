import {DiscordSDK} from '@discord/embedded-app-sdk';
import './style.css';

const $ = selector => document.querySelector(selector);
const clientId = '1562673893205086288';
let sdk, session, snapshot, busy = false, online = false, refreshing, timer, volumeDirty = false, pollGeneration = 0;
let queueSignature = '';
const notice = (text, error = false) => { $('#notice').textContent = text; $('#notice').classList.toggle('error', error); };
const timeout = (promise, ms, message) => {
  let handle;
  return Promise.race([promise, new Promise((_, reject) => {handle = setTimeout(() => reject(new Error(message)), ms);})]).finally(() => clearTimeout(handle));
};
async function api(path, body, authenticated = true) {
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(authenticated ? {Authorization: 'Bearer ' + session} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'); }
  if (!response.ok) {
    if (response.status === 401 && authenticated) {session = null; $('#reconnect').hidden = false;}
    throw new Error(data.message || '요청을 처리하지 못했어요.');
  }
  return data;
}
function updateControls() {
  const enabled = Boolean(session && online && snapshot?.current && !busy);
  document.querySelectorAll('[data-action],#volume,#volume-apply').forEach(el => {el.disabled = !enabled;});
  $('#refresh').disabled = !session || busy;
  $('#connection').textContent = !session ? '인증 필요' : !online ? '연결 확인 필요' : busy ? '조작 중…' : snapshot?.current ? '연결됨' : '재생 탭 확인 필요';
  $('#connection').classList.toggle('connected', Boolean(session && online && snapshot?.current));
}
async function openYouTube(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.youtube.com') return;
    await sdk.commands.openExternalLink({url});
  } catch {notice('유튜브 링크를 열지 못했어요.', true);}
}
function render(data) {
  snapshot = data;
  const current = data.current;
  $('#title').textContent = current?.title || '연결된 유튜브 재생 탭이 없어요';
  $('#play-state').textContent = current ? current.state === 'playing' ? '재생 중' : '일시정지' : '연결 대기';
  $('#video-link').hidden = !current;
  $('#video-link').onclick = () => current && openYouTube(current.url);
  if (current && !volumeDirty) {$('#volume').value = current.volume; $('#volume-value').textContent = current.volume + '%';}
  $('#total').textContent = data.items.length + '곡';
  $('#empty').hidden = data.items.length > 0;
  $('#playlist-link').hidden = false;
  $('#playlist-link').onclick = () => openYouTube(data.playlistUrl);
  const signature = JSON.stringify([data.items, current?.url]);
  if (signature !== queueSignature) {
    queueSignature = signature;
    const fragment = document.createDocumentFragment();
    for (const track of data.items) {
      const li = document.createElement('li'), number = document.createElement('span'), title = document.createElement('button');
      number.className = 'number'; number.textContent = '#' + track.number;
      title.textContent = track.title; title.onclick = () => openYouTube(track.url);
      li.append(number, title);
      if (current?.url === track.url) {li.className = 'active'; const badge = document.createElement('span');badge.className = 'now';badge.textContent = '현재곡';li.append(badge);}
      fragment.append(li);
    }
    $('#tracks').replaceChildren(fragment);
  }
  updateControls();
}
async function refresh(manual = false) {
  if (!session) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {const data = await api('state'); online = true; render(data); if (manual) notice('목록을 갱신했어요.');}
    catch (error) {online = false; notice(error.message, true); updateControls();}
    finally {refreshing = null;}
  })();
  return refreshing;
}
async function poll() {
  const generation = ++pollGeneration;
  clearTimeout(timer);
  await refresh();
  if (session && generation === pollGeneration) timer = setTimeout(poll, document.hidden ? 10000 : 2000);
}
async function control(action, value) {
  if (busy || !online || !session || !snapshot?.current) return;
  busy = true; updateControls(); notice('재생 탭에 조작을 전달하고 있어요…');
  try {
    const result = await api('control', {action, ...(value === undefined ? {} : {value}), requestId: crypto.randomUUID()});
    volumeDirty = false;
    await refresh();
    notice(result.message, !result.ok);
  } catch (error) {notice(error.name === 'TimeoutError' ? '응답이 늦어 조작 결과를 확인하지 못했어요. 현재 상태를 확인해주세요.' : error.message, true);}
  finally {busy = false; updateControls();}
}
document.querySelectorAll('[data-action]').forEach(button => {button.onclick = () => control(button.dataset.action);});
$('#volume').oninput = () => {volumeDirty = true; $('#volume-value').textContent = $('#volume').value + '%';};
$('#volume-form').onsubmit = event => {event.preventDefault(); control('volume', Number($('#volume').value));};
$('#refresh').onclick = () => refresh(true);
$('#reconnect').onclick = () => start();
document.addEventListener('visibilitychange', () => {if (!document.hidden && session) poll();});
async function start() {
  ++pollGeneration; clearTimeout(timer); session = null; online = false; updateControls();
  $('#reconnect').hidden = true;
  if (!new URLSearchParams(location.search).has('frame_id')) {
    notice('Discord의 앱 → 디스코제이 → 실행으로 열어주세요.'); return;
  }
  notice('Discord 사용자 인증 중…');
  try {
    sdk ||= new DiscordSDK(clientId);
    await timeout(sdk.ready(), 15000, 'Discord 연결 응답이 없어요. Activity를 다시 열어주세요.');
    const {code} = await timeout(sdk.commands.authorize({client_id: clientId, response_type: 'code', state: crypto.randomUUID(), prompt: 'none', scope: ['identify']}), 60000, '인증 시간이 지났어요. 다시 연결해주세요.');
    const data = await api('session', {code}, false);
    await timeout(sdk.commands.authenticate({access_token: data.accessToken}), 15000, 'Discord 인증 응답이 없어요. 다시 연결해주세요.');
    session = data.session; notice('');
    await poll();
  } catch (error) {session = null; notice(error.message || '인증을 완료하지 못했어요.', true); $('#reconnect').hidden = false; updateControls();}
}
start();
