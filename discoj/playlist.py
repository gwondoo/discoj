import asyncio
import re
import time
from urllib.parse import parse_qs, urlparse
from .youtube import PlaylistError


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
    def __init__(self, youtube, limit=90):
        if limit < 1:
            raise ValueError('MAX_PLAYLIST_SIZE must be positive')
        self.youtube, self.limit = youtube, limit
        self.lock = asyncio.Lock()
        self.owners = {}
        self.recent_additions = {}  # YouTube list reads can lag behind successful writes.

    async def add(self, link, user_id):
        vid = video_id(link)
        async with self.lock:
            now = time.monotonic()
            self.recent_additions = {v: entry for v, entry in self.recent_additions.items() if now - entry[1] < 60}
            if vid in self.recent_additions:
                raise PlaylistError('방금 재생목록에 추가한 영상이에요. 잠시 후 /목록을 확인해주세요.')
            items = await self.youtube.items()
            if any(t['video_id'] == vid for t in items):
                raise PlaylistError('이미 재생목록에 있는 영상이에요.')
            if len(items) >= self.limit:
                raise PlaylistError(f'재생목록이 최대 {self.limit}곡에 도달했어요. 목록 정리 후 다시 추천해주세요.')
            data = await self.youtube.insert(vid)
            self.owners[data['id']] = str(user_id)
            self.recent_additions[vid] = (data['id'], time.monotonic())
            return data['id']

    async def list(self):
        async with self.lock:
            return await self.youtube.items()

    async def delete(self, item_id, user_id, admin=False):
        async with self.lock:
            if not admin and self.owners.get(item_id) != str(user_id):
                raise PlaylistError('본인이 이번 실행 중 추천한 곡만 삭제할 수 있어요. 이전 곡은 관리자에게 요청해주세요.')
            items = await self.youtube.items()
            if not any(t['id'] == item_id for t in items):
                raise PlaylistError('해당 항목이 재생목록에 없어요. /목록을 다시 확인해주세요.')
            await self.youtube.remove(item_id)
            self.owners.pop(item_id, None)
            self.recent_additions = {v: entry for v, entry in self.recent_additions.items() if entry[0] != item_id}
