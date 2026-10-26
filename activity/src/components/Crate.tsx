import {useState} from 'react';
import type {Discoj, View} from '../discoj.ts';
import {Icon} from './icons.tsx';
import {thumbnailUrl} from '../lib/thumbnail.ts';

// Each title gets a stable sleeve color so the crate reads like a shelf of records.
function sleeveHue(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

// The video thumbnail is printed on the jacket. While it loads, or if it fails,
// the title-colored jacket underneath shows instead.
function Sleeve({title, url}: {title: string, url: string}) {
  const src = thumbnailUrl(url);
  const [cover, setCover] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed');
  return (
    <span className="sleeve" data-cover={cover} style={{'--hue': sleeveHue(title)} as React.CSSProperties} aria-hidden="true">
      <i/>
      {src && cover !== 'failed' && <img className="cover" src={src} alt="" loading="lazy" decoding="async" draggable={false}
        // A missing video still answers with YouTube's 120px grey placeholder; treat that as a failure.
        onLoad={event => setCover(event.currentTarget.naturalWidth > 120 ? 'loaded' : 'failed')}
        onError={() => setCover('failed')}/>}
    </span>
  );
}

export function Crate({view, app}: {view: View, app: Discoj}) {
  const [link, setLink] = useState('');
  const items = view.snapshot?.items ?? [];
  const current = view.current;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await app.add(link.trim())) setLink('');
  };

  return (
    <section className="card crate" aria-labelledby="crate-heading">
      <div className="card-head">
        <h2 id="crate-heading"><Icon name="queue"/>레코드 상자 <span className="count">{items.length}곡</span></h2>
        <button className="text-button" disabled={!view.authenticated || view.busy} onClick={app.manualRefresh}><Icon name="refresh"/>새로고침</button>
      </div>
      <form className="request" onSubmit={submit}>
        <Icon name="link"/>
        <input type="url" value={link} onChange={event => setLink(event.target.value)}
          aria-label="신청할 유튜브 영상 링크" placeholder="유튜브 링크로 곡 신청"
          maxLength={2048} autoComplete="off" required disabled={!view.canEdit || view.adding}/>
        <button disabled={!view.canEdit || view.adding}><Icon name="plus"/>{view.adding ? '신청 중…' : '신청'}</button>
      </form>
      {items.length > 0 ? (
        <ol className="tracks">
          {items.map(track => {
            const title = track.title?.trim() || '제목을 확인할 수 없는 영상';
            const active = current?.url === track.url;
            return (
              <li key={track.number} className={active ? 'active' : undefined} data-state={active ? current?.state : undefined}>
                <Sleeve key={track.url} title={title} url={track.url}/>
                <button className="track-play" disabled={!view.canControl} onClick={() => app.control('select', track.number)} aria-label={title + ' 재생'}>{title}</button>
                {active
                  ? <span className="now-badge">{!view.online ? '확인 필요' : current?.state === 'playing' ? '재생 중' : '일시정지'}</span>
                  : <span className="play-hint" aria-hidden="true">재생</span>}
                <button className="track-delete" disabled={!view.canEdit || view.deleting} onClick={() => app.askDelete(track)} aria-label={title + ' 삭제'} title="삭제"><Icon name="trash"/></button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">상자가 비어 있어요. 첫 신청곡을 넣어주세요!</p>
      )}
      {view.snapshot && <div className="crate-foot"><button className="text-button playlist-link" onClick={() => app.openYouTube(view.snapshot?.playlistUrl)}>유튜브 재생목록 열기 <Icon name="external"/></button></div>}
    </section>
  );
}
