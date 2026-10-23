import {DiscordSDK} from '@discord/embedded-app-sdk';
import {FreshRead} from './lib/fresh-read.ts';
import {PlaybackConnection} from './lib/playback-connection.ts';
import {PlaybackTransition, type PendingTrack} from './lib/playback-transition.ts';
import {playbackScene} from './lib/playback-scene.ts';
import type {Current, Scene, Snapshot, Track} from './lib/types.ts';

const clientId = '1562673893205086288';

export interface Notice { text: string; error: boolean; temporary: boolean }

export interface Fan { id: string; name: string; avatar: string | null }

interface Participant { id: string; username: string; bot: boolean; avatar?: string | null; global_name?: string | null; nickname?: string }

function toFan(user: Participant): Fan {
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
  return {id: user.id, name: user.nickname || user.global_name || user.username, avatar};
}

export interface View {
  authenticated: boolean;
  online: boolean;
  needsReconnect: boolean;
  snapshot: Snapshot | null;
  current: Current | null;
  loading: PendingTrack | null;
  scene: Scene;
  canControl: boolean;
  canEdit: boolean;
  busy: boolean;
  adding: boolean;
  deleting: boolean;
  volume: number;
  connection: string;
  connected: boolean;
  notice: Notice;
  deleteTarget: (Track & {requestId: string}) | null;
  deleteError: string;
  crowd: Fan[];
}

interface ControlResult { ok: boolean; message: string }

// All server coordination lives here; React only renders the published View.
export class Discoj {
  private sdk: DiscordSDK | null = null;
  private session: string | null = null;
  private snapshot: Snapshot | null = null;
  private online = false;
  private busy = false;
  private adding = false;
  private deleting = false;
  private needsReconnect = false;
  private loading: PendingTrack | null = null;
  private volumeDraft: number | null = null;
  private volumeQueued = false;
  private notice: Notice = {text: 'Discord 인증 중…', error: false, temporary: false};
  private deleteTarget: View['deleteTarget'] = null;
  private deleteError = '';
  private crowd: Fan[] = [];
  private followingCrowd = false;
  private timer?: ReturnType<typeof setTimeout>;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private pollGeneration = 0;
  private liveGeneration = 0;
  private liveConnection: AbortController | null = null;
  private lastPlaybackAt = -1;
  private lastLiveAt = 0;
  private connectionHealth = new PlaybackConnection();
  private healthTimer?: ReturnType<typeof setTimeout>;
  private transition = new PlaybackTransition();
  private stateRead = new FreshRead(() => this.api<Snapshot>(Date.now() - this.lastLiveAt < 25000 ? 'state?queueOnly=1' : 'state'));
  private listeners = new Set<() => void>();
  private view: View = this.compute();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getView = () => this.view;

  private emit() {
    this.view = this.compute();
    this.listeners.forEach(listener => listener());
  }

  private compute(): View {
    const current = this.snapshot?.current ?? null;
    const authenticated = Boolean(this.session);
    const pending = Boolean(this.transition?.pending);
    return {
      authenticated, online: this.online, needsReconnect: this.needsReconnect,
      snapshot: this.snapshot, current, loading: this.loading,
      scene: playbackScene({online: this.online, current, loading: this.loading}),
      canControl: Boolean(authenticated && this.online && current && !this.busy && !pending),
      canEdit: Boolean(authenticated && this.online),
      busy: this.busy, adding: this.adding, deleting: this.deleting,
      volume: this.volumeDraft ?? current?.volume ?? 100,
      connection: !authenticated ? '인증 필요' : !this.online ? '연결 확인 필요' : pending ? '곡 전환 중…' : this.busy ? '조작 중…' : current ? '연결됨' : '재생 탭 확인 필요',
      connected: Boolean(authenticated && this.online && (current || pending)),
      notice: this.notice, deleteTarget: this.deleteTarget, deleteError: this.deleteError, crowd: this.crowd,
    };
  }

  private setNotice(text: string, error = false, temporary = false) {
    clearTimeout(this.noticeTimer);
    this.notice = {text, error, temporary: temporary && !error};
    if (temporary && text && !error) this.noticeTimer = setTimeout(() => this.setNotice(''), 3000);
    this.emit();
  }

  private async api<T>(path: string, body?: object, authenticated = true): Promise<T> {
    const response = await fetch('/api/' + path, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(authenticated ? {Authorization: 'Bearer ' + this.session} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'); }
    if (!response.ok) {
      if ([401, 403].includes(response.status) && authenticated) this.invalidateConnection();
      throw Object.assign(new Error(data.message || '요청을 처리하지 못했어요.'), {status: response.status});
    }
    return data as T;
  }

  async openYouTube(url: string | undefined) {
    if (!url || !this.sdk) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.youtube.com') return;
      await this.sdk.commands.openExternalLink({url});
    } catch { this.setNotice('유튜브 링크를 열지 못했어요.', true); }
  }

  private render(data: Snapshot) {
    if (data.observedAt !== undefined && data.observedAt < this.lastPlaybackAt && this.snapshot) data = {...data, current: this.snapshot.current};
    else if (data.observedAt !== undefined) this.lastPlaybackAt = data.observedAt;
    this.snapshot = data;
    const {loading, expired} = this.transition.update(data.current);
    this.loading = loading;
    if (expired) this.setNotice('선택한 곡의 재생을 확인하지 못했어요. 재생 탭 연결을 확인해주세요.', true);
    this.emit();
  }

  private invalidateConnection() {
    this.session = null; this.needsReconnect = true;
    ++this.liveGeneration; this.liveConnection?.abort(); this.lastLiveAt = 0;
    this.connectionHealth.reset(); clearTimeout(this.healthTimer);
    this.online = false; this.emit();
  }

  private confirmConnection() {
    this.connectionHealth.received(); this.online = true;
    clearTimeout(this.healthTimer);
    this.healthTimer = setTimeout(() => {
      if (!this.connectionHealth.healthy) { this.online = false; this.emit(); }
    }, this.connectionHealth.grace);
  }

  private async refresh(manual = false, force = false) {
    if (!this.session) return;
    try {
      const data = await this.stateRead.run(manual || force);
      if (data.observedAt !== undefined) this.confirmConnection();
      else this.online = Boolean(this.session && this.connectionHealth.healthy);
      this.render({...this.snapshot, ...data} as Snapshot);
      if (manual) this.setNotice('');
    } catch (error) {
      this.online = Boolean(this.session && this.connectionHealth.healthy);
      if (!this.online) this.transition.clear();
      if (this.snapshot) this.render(this.snapshot);
      // A queue failure must not mark a healthy shared player as disconnected.
      if (manual || !this.online) this.setNotice((error as Error).message, true);
    }
  }

  private async poll() {
    const generation = ++this.pollGeneration;
    clearTimeout(this.timer);
    await this.refresh();
    if (this.session && generation === this.pollGeneration) this.timer = setTimeout(() => this.poll(), document.hidden ? 10000 : 2000);
  }

  private async followPlayback(generation: number) {
    while (this.session && generation === this.liveGeneration) {
      const controller = new AbortController();
      this.liveConnection = controller;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const watch = () => { clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(), 25000); };
      watch();
      try {
        const response = await fetch('/api/playback-events', {
          headers: {Authorization: 'Bearer ' + this.session}, cache: 'no-store', signal: controller.signal,
        });
        if ([401, 403].includes(response.status)) {
          this.invalidateConnection();
          this.setNotice('인증 또는 채널 권한을 다시 확인해주세요.', true);
          return;
        }
        if (!response.ok || !response.body) throw new Error('재생 상태 연결을 확인해주세요.');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        while (generation === this.liveGeneration) {
          const {value, done} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const update = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
            if (generation === this.liveGeneration) {
              this.lastLiveAt = Date.now(); watch();
              if (this.snapshot) {
                this.confirmConnection();
                if (update.heartbeat) this.emit();
                else this.render({...this.snapshot, ...update});
              }
            }
          }
        }
      } catch {
        if (generation === this.liveGeneration && this.snapshot) {
          this.lastLiveAt = 0;
          this.online = Boolean(this.session && this.connectionHealth.healthy);
          this.render(this.snapshot);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } finally { clearTimeout(watchdog); }
    }
  }

  control = async (action: string, value?: number) => {
    if (this.busy || this.transition.pending || !this.online || !this.session || !this.snapshot?.current) return;
    if (action === 'select') {
      const track = this.snapshot.items.find(track => track.number === value);
      if (track) { this.transition.begin(track, this.snapshot.current.url); this.render(this.snapshot); }
    }
    this.busy = true; this.setNotice('');
    try {
      const result = await this.api<ControlResult>('control', {action, ...(value === undefined ? {} : {value}), requestId: crypto.randomUUID()});
      if (action === 'volume' && this.volumeDraft === value) this.volumeDraft = null;
      if (!result.ok) this.transition.clear();
      this.lastLiveAt = 0; await this.refresh(false, true);
      if (!result.ok) this.setNotice(result.message, true);
    } catch (error) {
      this.transition.clear();
      if (this.snapshot) this.render(this.snapshot);
      this.setNotice((error as Error).name === 'TimeoutError' ? '응답이 늦어 조작 결과를 확인하지 못했어요. 현재 상태를 확인해주세요.' : (error as Error).message, true);
    } finally {
      this.busy = false; this.emit();
      if (this.volumeQueued) { this.volumeQueued = false; void this.commitVolume(); }
    }
  };

  setVolumeDraft = (volume: number) => { this.volumeDraft = volume; this.emit(); };

  // Volume applies on release; a change made during another command waits for it.
  commitVolume = async () => {
    if (this.volumeDraft === null) return;
    if (this.busy || this.transition.pending) { this.volumeQueued = true; return; }
    await this.control('volume', this.volumeDraft);
  };

  add = async (link: string): Promise<boolean> => {
    if (this.adding || !this.session || !this.online || !link) return false;
    this.adding = true; this.setNotice('');
    let added = false;
    try {
      const result = await this.api<ControlResult>('add', {link, requestId: crypto.randomUUID()});
      added = result.ok;
      this.lastLiveAt = 0; await this.refresh(false, true);
      this.setNotice(result.ok ? '신청곡 받았어요! 레코드 상자에 넣었어요.' : result.message, !result.ok, result.ok);
    } catch (error) {
      this.setNotice((error as Error).name === 'TimeoutError' ? '추가 결과를 확인하지 못했어요. 다시 추가하기 전에 목록을 확인해주세요.' : (error as Error).message, true);
    } finally { this.adding = false; this.emit(); }
    return added;
  };

  manualRefresh = () => this.refresh(true);

  askDelete = (track: Track) => {
    if (this.deleting) return;
    this.deleteTarget = {...track, requestId: crypto.randomUUID()};
    this.deleteError = '';
    this.emit();
  };

  cancelDelete = () => {
    if (this.deleting) return;
    this.deleteTarget = null; this.emit();
  };

  confirmDelete = async () => {
    const target = this.deleteTarget;
    if (this.deleting || !target || !this.session) return;
    this.deleting = true; this.deleteError = ''; this.emit();
    try {
      const result = await this.api<ControlResult>('delete', {number: target.number, requestId: target.requestId});
      if (result.ok) { this.deleteTarget = null; this.setNotice('레코드를 상자에서 뺐어요.', false, true); }
      else this.deleteError = result.message;
      this.lastLiveAt = 0; await this.refresh(false, true);
    } catch (error) {
      this.deleteError = (error as Error).name === 'TimeoutError' ? '삭제 결과를 확인하지 못했어요. 취소 후 목록을 확인해주세요.' : (error as Error).message;
    } finally { this.deleting = false; this.emit(); }
  };

  // Everyone in this Activity instance shows up in the booth's crowd.
  private async followCrowd() {
    if (this.followingCrowd || !this.sdk) return;
    this.followingCrowd = true;
    const update = ({participants}: {participants: Participant[]}) => {
      this.crowd = participants.filter(user => !user.bot).map(toFan);
      this.emit();
    };
    try {
      update(await this.sdk.commands.getInstanceConnectedParticipants());
      await this.sdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', update);
    } catch { this.followingCrowd = false; }
  }

  resume = () => { if (this.session && this.session !== 'preview') void this.poll(); };

  start = async () => {
    this.transition.clear(); this.loading = null;
    this.connectionHealth.reset(); clearTimeout(this.healthTimer);
    ++this.liveGeneration; this.liveConnection?.abort(); this.lastPlaybackAt = -1; this.lastLiveAt = 0;
    ++this.pollGeneration; clearTimeout(this.timer); this.session = null; this.online = false;
    this.needsReconnect = false;
    if (!new URLSearchParams(location.search).has('frame_id')) {
      this.setNotice('Discord의 앱 → 디스코제이 → 실행으로 열어주세요.'); return;
    }
    this.setNotice('Discord 사용자 인증 중…');
    try {
      this.sdk ||= new DiscordSDK(clientId);
      await timeout(this.sdk.ready(), 15000, 'Discord 연결 응답이 없어요. Activity를 다시 열어주세요.');
      const {code} = await timeout(this.sdk.commands.authorize({client_id: clientId, response_type: 'code', state: crypto.randomUUID(), prompt: 'none', scope: ['identify']}), 60000, '인증 시간이 지났어요. 다시 연결해주세요.');
      const data = await this.api<{session: string, accessToken: string}>('session', {code}, false);
      await timeout(this.sdk.commands.authenticate({access_token: data.accessToken}), 15000, 'Discord 인증 응답이 없어요. 다시 연결해주세요.');
      this.session = data.session; this.setNotice('');
      void this.followCrowd();
      await this.poll();
      void this.followPlayback(this.liveGeneration);
    } catch (error) {
      this.session = null; this.needsReconnect = true;
      this.setNotice((error as Error).message || '인증을 완료하지 못했어요.', true);
    }
  };

  // Lets the dev preview render without Discord; never used inside the Activity.
  previewNotice(text: string, error = false, temporary = false) { this.setNotice(text, error, temporary); }
  previewCrowd(crowd: Fan[]) { this.crowd = crowd; this.emit(); }

  preview(snapshot: Snapshot, loading?: Track) {
    this.session = 'preview'; this.online = true; this.notice = {text: '', error: false, temporary: false};
    if (loading) this.transition.begin(loading, snapshot.current?.url);
    this.render(snapshot);
  }
}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([promise, new Promise<never>((_, reject) => { handle = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(handle));
}
