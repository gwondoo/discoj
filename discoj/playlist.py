import asyncio
import re
import time
from urllib.parse import parse_qs, urlparse
from .youtube import PlaylistError
from .numbers import TrackNumbers


def video_id(link):
    url = urlparse(link.strip())
    value = None
    if url.scheme not in ('http', 'https'):
        raise PlaylistError('유튜브 영상 링크를 입력해주세요.')
    if url.hostname == 'youtu.be':
        value = url.path.strip('/').split('/')[0]
    elif url.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'):
        if url.path == '/watch':
            value = parse_qs(url.query).get('v', [None])[0]
        else:
            match = re.fullmatch(r'/(?:shorts|live|embed)/([\w-]{11})/?', url.path)
            value = match.group(1) if match else None
    if not value or not re.fullmatch(r'[A-Za-z0-9_-]{11}', value):
        raise PlaylistError('재생목록이 아닌 유튜브 영상 링크를 입력해주세요.')
    return value


class Playlist:
    def __init__(self, youtube, limit=90, numbers_path=None):
        if limit < 1:
            raise ValueError('MAX_PLAYLIST_SIZE must be positive')
        self.youtube, self.limit = youtube, limit
        self.lock = asyncio.Lock()
        self.numbers = TrackNumbers(numbers_path)
        self.cached_items = []
        self.cache_time = 0
        self.queue_items = None
        self.recent_deletions = {}
        self.recent_additions = {}  # YouTube list reads can lag behind successful writes.

    async def _read(self):
        now = time.monotonic()
        self.recent_additions = {v: entry for v, entry in self.recent_additions.items() if now - entry[1] < 60}
        self.recent_deletions = {key: stamp for key, stamp in self.recent_deletions.items() if now - stamp < 60}
        items = [item for item in await self.youtube.items() if item['id'] not in self.recent_deletions]
        ids = {item['id'] for item in items}
        items.extend(entry[2] for entry in self.recent_additions.values() if entry[0] not in ids)
        items = self.numbers.assign(self.youtube.playlist_id, items)
        self.cached_items, self.cache_time, self.queue_items = items, now, items
        return items

    async def browser_queue(self):
        async with self.lock:
            if self.queue_items is None:
                await self._read()
            return [dict(item) for item in self.queue_items]

    async def add(self, link, user_id):
        vid = video_id(link)
        async with self.lock:
            now = time.monotonic()
            self.recent_additions = {v: entry for v, entry in self.recent_additions.items() if now - entry[1] < 60}
            if vid in self.recent_additions:
                raise PlaylistError('방금 재생목록에 추가한 영상이에요. 잠시 후 /목록을 확인해주세요.')
            items = await self._read()
            if any(t['video_id'] == vid for t in items):
                raise PlaylistError('이미 재생목록에 있는 영상이에요.')
            if len(items) >= self.limit:
                raise PlaylistError(f'재생목록이 최대 {self.limit}곡에 도달했어요. 목록 정리 후 다시 추가해주세요.')
            data = await self.youtube.insert(vid)
            item = {'id': data['id'], 'video_id': vid,
                    'title': data.get('snippet', {}).get('title') or '추가된 영상'}
            self.recent_additions[vid] = (data['id'], time.monotonic(), item)
            self.queue_items = self.numbers.assign(self.youtube.playlist_id, items + [item])
            self.cached_items, self.cache_time = self.queue_items, 0
            return self.queue_items[-1]['number']

    async def list(self):
        async with self.lock:
            items = await self._read()
            self.cached_items, self.cache_time = items, time.monotonic()
            return items

    async def choices(self, query):
        if not self.cache_time or time.monotonic() - self.cache_time > 30:
            try:
                await asyncio.wait_for(self.list(), timeout=1.5)
            except (PlaylistError, asyncio.TimeoutError):
                pass
        query = str(query).casefold().strip()
        return [item for item in self.cached_items
                if query in str(item['number']) or query in item['title'].casefold()][:25]

    async def find(self, number):
        return next((item for item in await self.list() if item['number'] == number), None)

    async def delete(self, number):
        async with self.lock:
            item_id = self.numbers.item_id(self.youtube.playlist_id, number)
            if item_id is None:
                raise PlaylistError('이미 삭제됐거나 없는 번호예요. /목록을 확인해주세요.')
            items = await self._read()
            if not any(t['id'] == item_id for t in items):
                raise PlaylistError('이미 삭제됐거나 없는 번호예요. /목록을 확인해주세요.')
            await self.youtube.remove(item_id)
            self.recent_deletions[item_id] = time.monotonic()
            self.queue_items = [item for item in items if item['id'] != item_id]
            self.cached_items = self.queue_items
            self.recent_additions = {v: entry for v, entry in self.recent_additions.items() if entry[0] != item_id}
