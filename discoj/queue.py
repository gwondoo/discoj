"""Single-process queue. All mutations run inside one asyncio lock."""
import asyncio
import re
from dataclasses import asdict, dataclass
from typing import Optional
from urllib.parse import parse_qs, urlparse
from uuid import uuid4


def video_id(link: str) -> str:
    url = urlparse(link.strip())
    value = None
    if url.scheme not in ('http', 'https'):
        raise ValueError('유튜브 영상 링크를 입력해주세요.')
    if url.hostname == 'youtu.be':
        value = url.path.strip('/').split('/')[0]
    elif url.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'):
        if url.path == '/watch':
            value = parse_qs(url.query).get('v', [None])[0]
        else:
            match = re.fullmatch(r'/(?:shorts|live|embed)/([\w-]{11})/?', url.path)
            value = match.group(1) if match else None
    if not value or not re.fullmatch(r'[A-Za-z0-9_-]{11}', value):
        raise ValueError('재생목록이 아닌 유튜브 영상 링크를 입력해주세요.')
    return value


@dataclass
class Track:
    number: int
    video_id: str
    user_id: str
    requester: str
    title: str
    fallback: bool = False


class Queue:
    def __init__(self, fallback: str = '', limit: int = 100):
        if fallback and not re.fullmatch(r'[A-Za-z0-9_-]{11}', fallback):
            raise ValueError('FALLBACK_VIDEO_ID는 11자리 영상 ID여야 합니다.')
        self.fallback, self.limit = fallback, limit
        self._lock = None
        self.pending = []
        self.current: Optional[Track] = None
        self.session = ''
        self.status = 'offline'
        self.connected = False
        self.counter = 0

    @property
    def lock(self):
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    def snapshot(self):
        return {'current': asdict(self.current) if self.current else None,
                'pending': [asdict(t) for t in self.pending],
                'session': self.session, 'status': self.status, 'connected': self.connected}

    def advance(self, allow_fallback=True):
        self.current = self.pending.pop(0) if self.pending else (
            Track(0, self.fallback, '', '기본 음악', '카페 음악', True)
            if self.fallback and allow_fallback else None)
        self.session = uuid4().hex
        self.status = 'loading' if self.connected and self.current else ('idle' if self.connected else 'offline')

    async def add(self, link, user_id, requester):
        vid = video_id(link)
        async with self.lock:
            tracks = self.pending + ([self.current] if self.current else [])
            if any(t.video_id == vid for t in tracks):
                raise ValueError('현재 재생 또는 대기 중인 곡입니다.')
            if len(tracks) >= self.limit:
                raise ValueError('전체 대기열이 가득 찼어요. 곡이 재생된 후 다시 추천해주세요.')
            self.counter += 1
            track = Track(self.counter, vid, str(user_id), requester, f'YouTube · {vid}')
            self.pending.append(track)
            if not self.current or self.current.fallback:
                self.advance()
            return track

    async def delete(self, number, user_id, admin=False):
        async with self.lock:
            track = next((t for t in self.pending + ([self.current] if self.current else [])
                          if t.number == number and not t.fallback), None)
            if not track:
                raise ValueError('해당 곡번호를 찾을 수 없어요.')
            if not admin and track.user_id != str(user_id):
                raise ValueError('본인이 추천한 곡만 삭제할 수 있어요.')
            if track is self.current:
                self.advance()
            else:
                self.pending.remove(track)

    async def report(self, session, event, title=''):
        async with self.lock:
            if session != self.session or not self.current:
                return
            if event in ('ended', 'error'):
                # Broken fallback must not reload forever.
                self.advance(allow_fallback=not (event == 'error' and self.current.fallback))
                if event == 'error' and not self.current:
                    self.status = 'error'
            elif event in ('playing', 'paused', 'buffering', 'blocked'):
                self.status = event
                if title:
                    self.current.title = title[:200]
