import {DiscordSDK} from '@discord/embedded-app-sdk';
import './style.css';
import {PlaybackTransition} from './playback-transition.js';

const $ = selector => document.querySelector(selector);
const clientId = '1562673893205086288';
let sdk, session, snapshot, busy = false, adding = false, online = false, refreshing, timer, volumeDirty = false, pollGeneration = 0;
let queueSignature = '';
let deleteTarget = null, deleting = false;
const transition = new PlaybackTransition();
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
  const enabled = Boolean(session && online && snapshot?.current && !busy && !transition.pending);
  document.querySelectorAll('[data-action],#volume,#volume-apply,.track-play').forEach(el => {el.disabled = !enabled;});
  document.querySelectorAll('.track-delete').forEach(el => {el.disabled = !session || !online || deleting;});
  $('#add-link').disabled = $('#add-submit').disabled = !session || !online || adding;
  $('#add-submit').textContent = adding ? '추가 중…' : '추가';
  $('#refresh').disabled = !session || busy;
  $('#connection').textContent = !session ? '인증 필요' : !online ? '연결 확인 필요' : transition.pending ? '곡 전환 중…' : busy ? '조작 중…' : snapshot?.current ? '연결됨' : '재생 탭 확인 필요';
  $('#connection').classList.toggle('connected', Boolean(session && online && (snapshot?.current || transition.pending)));
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
  const {loading, expired} = transition.update(current);
  if (expired) notice('선택한 곡의 재생을 확인하지 못했어요. 재생 탭 연결을 확인해주세요.', true);
  $('#title').textContent = loading ? loading.title || '선택한 곡' : current?.title || '연결된 유튜브 재생 탭이 없어요';
  $('#play-state').textContent = loading ? '곡을 불러오는 중…' : current ? current.state === 'playing' ? '재생 중' : '일시정지' : '연결 대기';
  $('.player').setAttribute('aria-busy', String(Boolean(loading)));
  $('#video-link').hidden = !current || Boolean(loading);
  $('#video-link').onclick = () => current && openYouTube(current.url);
  if (current && !volumeDirty) {$('#volume').value = current.volume; $('#volume-value').textContent = current.volume + '%';}
  $('#total').textContent = data.items.length + '곡';
  $('#empty').hidden = data.items.length > 0;
  $('#playlist-link').hidden = false;
  $('#playlist-link').onclick = () => openYouTube(data.playlistUrl);
  const signature = JSON.stringify([data.items, current?.url, current?.state]);
  if (signature !== queueSignature) {
    queueSignature = signature;
    const fragment = document.createDocumentFragment();
    for (const track of data.items) {
      const li = document.createElement('li'), title = document.createElement('button');
      const trackTitle = track.title?.trim() || '제목을 확인할 수 없는 영상';
      title.textContent = trackTitle; title.onclick = () => control('select', track.number);
      title.className = 'track-play';
      title.setAttribute('aria-label', trackTitle + ' 재생');
      li.append(title);
      const badge = document.createElement('span');
      if (current?.url === track.url) {li.className = 'active'; badge.className = 'now';badge.textContent = current.state === 'playing' ? '재생 중' : '일시정지';}
      else {badge.className = 'play-hint';badge.textContent = '재생';}
      li.append(badge);
      const remove = document.createElement('button');
      remove.className = 'track-delete'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', trackTitle + ' 삭제');
      remove.onclick = () => {
        if (deleting) return;
        deleteTarget = {...track, requestId: crypto.randomUUID()};
        $('#delete-title').textContent = trackTitle;
        $('#delete-note').textContent = snapshot?.current?.url === track.url ? '현재 음악은 끝까지 재생됩니다.' : '공용 재생목록에서 삭제합니다.';
        $('#delete-error').textContent = '';
        $('#delete-dialog').showModal();
      };
      li.append(remove);
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
    catch (error) {online = false; transition.clear(); if (snapshot) render(snapshot); notice(error.message, true); updateControls();}
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
  if (busy || transition.pending || !online || !session || !snapshot?.current) return;
  if (action === 'select') {
    const track = snapshot.items.find(track => track.number === value);
    if (track) {transition.begin(track, snapshot.current.url); render(snapshot);}
  }
  busy = true; updateControls(); notice('재생 탭에 조작을 전달하고 있어요…');
  try {
    const result = await api('control', {action, ...(value === undefined ? {} : {value}), requestId: crypto.randomUUID()});
    volumeDirty = false;
    if (!result.ok) transition.clear();
    await refresh();
    notice(result.message, !result.ok);
  } catch (error) {transition.clear(); if (snapshot) render(snapshot); notice(error.name === 'TimeoutError' ? '응답이 늦어 조작 결과를 확인하지 못했어요. 현재 상태를 확인해주세요.' : error.message, true);}
  finally {busy = false; updateControls();}
}
document.querySelectorAll('[data-action]').forEach(button => {button.onclick = () => control(button.dataset.action);});
$('#volume').oninput = () => {volumeDirty = true; $('#volume-value').textContent = $('#volume').value + '%';};
$('#volume-form').onsubmit = event => {event.preventDefault(); control('volume', Number($('#volume').value));};
$('#add-form').onsubmit = async event => {
  event.preventDefault();
  if (adding || !session || !online) return;
  const link = $('#add-link').value.trim();
  if (!link) return;
  adding = true; updateControls(); notice('곡을 추가하고 있어요. 현재 음악은 계속 재생됩니다.');
  try {
    const result = await api('add', {link, requestId: crypto.randomUUID()});
    if (result.ok) $('#add-link').value = '';
    await refresh(); notice(result.message, !result.ok);
  } catch (error) {notice(error.name === 'TimeoutError' ? '추가 결과를 확인하지 못했어요. 다시 추가하기 전에 목록을 확인해주세요.' : error.message, true);}
  finally {adding = false; updateControls();}
};
$('#refresh').onclick = () => refresh(true);
$('#delete-cancel').onclick = () => {if (!deleting) $('#delete-dialog').close();};
$('#delete-dialog').addEventListener('cancel', event => {if (deleting) event.preventDefault();});
$('#delete-dialog').addEventListener('close', () => {deleteTarget = null;});
$('#delete-confirm').onclick = async () => {
  if (deleting || !deleteTarget || !session) return;
  deleting = true;
  $('#delete-confirm').disabled = $('#delete-cancel').disabled = true;
  $('#delete-confirm').textContent = '삭제 중…';
  $('#delete-error').textContent = '';
  updateControls();
  try {
    const result = await api('delete', {number: deleteTarget.number, requestId: deleteTarget.requestId});
    if (result.ok) {$('#delete-dialog').close(); notice(result.message);}
    else $('#delete-error').textContent = result.message;
    await refresh();
  } catch (error) {$('#delete-error').textContent = error.name === 'TimeoutError' ? '삭제 결과를 확인하지 못했어요. 취소 후 목록을 확인해주세요.' : error.message;}
  finally {
    deleting = false;
    $('#delete-confirm').disabled = $('#delete-cancel').disabled = false;
    $('#delete-confirm').textContent = '삭제';
    updateControls();
  }
};
$('#reconnect').onclick = () => start();
document.addEventListener('visibilitychange', () => {if (!document.hidden && session) poll();});
async function start() {
  transition.clear();
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
