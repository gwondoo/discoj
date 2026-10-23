import {useRef} from 'react';
import type {Discoj, View} from '../discoj.ts';
import {DjBooth} from './DjBooth.tsx';
import {Dialogue} from './Dialogue.tsx';
import {Icon} from './icons.tsx';

const sceneLines = {
  playing: '오늘의 선곡, 신나게 틀고 있어요!',
  paused: '잠깐 쉬는 중… 재생을 눌러 깨워주세요.',
  loading: '레코드 찾는 중…',
  waiting: '어? 재생 탭이 안 보여요. Mac mini 유튜브 탭을 확인해주세요.',
};

const stateLabels = {playing: '재생 중', paused: '일시정지', loading: '곡 불러오는 중', waiting: '연결 대기'};

export function Player({view, app}: {view: View, app: Discoj}) {
  const {current, loading, scene, canControl, notice} = view;
  const commitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const offline = view.authenticated && !view.online;
  // Short confirmations go to the phone toast; the dialogue keeps statuses and errors.
  const spoken = notice.temporary ? '' : notice.text;
  const line = spoken || (offline ? '서버랑 연결이 끊겼어요. 다시 연결하는 중이에요.' : view.authenticated ? sceneLines[scene] : '');
  const title = loading ? loading.title || '선택한 곡' : current?.title || '연결된 유튜브 재생 탭이 없어요';
  const playing = current?.state === 'playing';

  const draft = (value: number) => {
    app.setVolumeDraft(value);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(app.commitVolume, 600);
  };
  const commit = () => { clearTimeout(commitTimer.current); void app.commitVolume(); };

  return (
    <section className="card player" aria-labelledby="now-heading">
      <div className="card-head">
        <h2 id="now-heading"><Icon name="radio"/>{current?.state === 'paused' ? '일시정지한 곡' : '지금 듣는 곡'}</h2>
        <span className="state-pill" data-scene={scene}>{offline ? '상태 확인 필요' : stateLabels[scene]}</span>
      </div>
      <DjBooth scene={scene}/>
      <Dialogue speaker="K.K." text={line} error={notice.error && Boolean(spoken)}>
        {view.needsReconnect && <button className="choice" onClick={app.start}>다시 연결할게!</button>}
      </Dialogue>
      <div className="now" aria-busy={Boolean(loading)}>
        <h3 title={title}>{title}</h3>
        {current && !loading && <button className="text-button" onClick={() => app.openYouTube(current.url)}>유튜브에서 보기 <Icon name="external"/></button>}
      </div>
      <div className="transport" role="group" aria-label="재생 컨트롤">
        <button className="round" disabled={!canControl} onClick={() => app.control('previous')} aria-label="이전곡" title="이전곡"><Icon name="previous"/></button>
        {playing
          ? <button className="round main" disabled={!canControl} onClick={() => app.control('pause')} aria-label="일시정지" title="일시정지"><Icon name="pause"/></button>
          : <button className="round main" disabled={!canControl} onClick={() => app.control('play')} aria-label="재생" title="재생"><Icon name="play"/></button>}
        <button className="round" disabled={!canControl} onClick={() => app.control('next')} aria-label="다음곡" title="다음곡"><Icon name="next"/></button>
      </div>
      <div className="fader">
        <label htmlFor="volume"><Icon name={view.volume === 0 ? 'mute' : 'volume'}/><span>유튜브 음량</span></label>
        <input id="volume" type="range" min={0} max={100} step={1} value={view.volume}
          style={{'--fill': view.volume + '%'} as React.CSSProperties}
          disabled={!view.authenticated || !view.online || !current}
          onChange={event => draft(Number(event.target.value))}
          onPointerUp={commit}/>
        <output htmlFor="volume">{view.volume}%</output>
      </div>
    </section>
  );
}
