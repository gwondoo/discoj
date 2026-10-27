import type {Discoj, View} from '../discoj.ts';
import {DjBooth} from './DjBooth.tsx';
import {Dialogue} from './Dialogue.tsx';
import {Progress} from './Progress.tsx';
import {displayTitle, splitPlaylist} from '../lib/title.ts';
import {Icon} from './icons.tsx';
import {Volume} from './Volume.tsx';

const sceneLines = {
  playing: '오늘의 선곡, 신나게 틀고 있어요!',
  paused: '잠깐 쉬는 중… 재생을 눌러 깨워주세요.',
  loading: '레코드 찾는 중…',
  waiting: '어? 재생 탭이 안 보여요. Mac mini 유튜브 탭을 확인해주세요.',
};

const stateLabels = {playing: '재생 중', paused: '일시정지', loading: '곡 불러오는 중', waiting: '연결 대기'};

export function Player({view, app}: {view: View, app: Discoj}) {
  const {current, loading, scene, canControl, notice} = view;
  const offline = view.authenticated && !view.online;
  // Short confirmations go to the phone toast; the dialogue keeps statuses and errors.
  const spoken = notice.temporary ? '' : notice.text;
  const reaction = !spoken && !offline ? view.reaction : null;
  const line = spoken || (offline ? '서버랑 연결이 끊겼어요. 다시 연결하는 중이에요.' : reaction ? reaction.text : view.authenticated ? sceneLines[scene] : '');
  const title = loading ? displayTitle(loading.title, '선택한 곡') : current ? displayTitle(current.title) : '연결된 유튜브 재생 탭이 없어요';
  const heading = splitPlaylist(title);
  const playing = current?.state === 'playing';
  const repeatOne = current?.repeatMode === 'one';


  return (
    <section className="card player" aria-labelledby="now-heading" data-attention={notice.error || view.needsReconnect || !view.authenticated}>
      <div className="card-head">
        <h2 id="now-heading"><Icon name="disc"/>{current?.state === 'paused' ? '일시정지한 곡' : '지금 듣는 곡'}</h2>
        <div className="pills">
          {view.crowd.length > 0 && <span className="listeners"><Icon name="headphones"/>{view.crowd.length}명</span>}
          <span className="state-pill" data-scene={scene}>{offline ? '상태 확인 필요' : stateLabels[scene]}</span>
        </div>
      </div>
      <DjBooth scene={scene}/>
      <Dialogue speaker="K.K." text={line} quiet={!spoken && !reaction && !offline} highlight={reaction?.highlight} error={notice.error && Boolean(spoken)}
        onDismiss={notice.error && !view.needsReconnect ? app.dismissNotice : undefined}>
        {view.needsReconnect && <button className="choice" onClick={app.start}>다시 연결할게!</button>}
      </Dialogue>
      <div className="now" aria-busy={Boolean(loading)}>
        {/* "Watch on YouTube" belongs to the song, so it sits at the end of the title. */}
        <div className="now-title">
          <h3 title={title}>{heading.playlist && <span className="plist"><span aria-hidden="true">플리</span><span className="sr-only">플레이리스트</span></span>}{heading.text}</h3>
          {current && !loading && <button className="yt-link" onClick={() => app.openYouTube(current.url)} aria-label="유튜브에서 보기" title="유튜브에서 보기"><Icon name="external"/></button>}
        </div>
        <p className="mini-meta" aria-hidden="true"><Icon name={view.volume === 0 ? 'mute' : 'volume'}/>{view.volume}%<span>· 눌러서 열면 조작할 수 있어요</span></p>
      </div>
      <Progress view={view} app={app}/>
      {/* Secondary actions sit at the ends of the transport row, like a music app: repeat left, volume right. */}
      <div className="transport" role="group" aria-label="재생 컨트롤">
        <button className="round side repeat" disabled={!canControl} aria-pressed={repeatOne}
          onClick={() => app.control('repeat', repeatOne ? 'all' : 'one')}
          aria-label={repeatOne ? '한 곡 반복 중' : '전체 반복 중'} title={repeatOne ? '한 곡 반복 중 · 누르면 전체 반복' : '전체 반복 중 · 누르면 한 곡 반복'}>
          <Icon name="repeat"/>{repeatOne && <b className="repeat-one" aria-hidden="true">1</b>}
        </button>
        <button className="round" disabled={!canControl} onClick={() => app.control('previous')} aria-label="이전곡" title="이전곡"><Icon name="previous"/></button>
        {playing
          ? <button className="round main" disabled={!canControl} onClick={() => app.control('pause')} aria-label="일시정지" title="일시정지"><Icon name="pause"/></button>
          : <button className="round main" disabled={!view.authenticated || !view.online || view.busy || Boolean(loading)} onClick={() => app.control('play')} aria-label={view.busy ? '연결 및 재생 처리 중' : '재생'} title="재생"><Icon name="play"/></button>}
        <button className="round" disabled={!canControl} onClick={() => app.control('next')} aria-label="다음곡" title="다음곡"><Icon name="next"/></button>
        <Volume view={view} app={app}/>
      </div>
    </section>
  );
}
