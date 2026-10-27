"""On-demand browser recovery through an authenticated extension push channel."""
import asyncio
import hmac
import uuid
from aiohttp import web, ClientTimeout, WSMsgType
from .youtube import PlaylistError


class Recovery:
    def __init__(self, token, playlist, http, launcher_url='', launcher_token=''):
        self.token, self.playlist, self.http = token, playlist, http
        self.launcher_url, self.launcher_token = launcher_url, launcher_token
        self.socket = None
        self.ready = asyncio.Event()
        self.pending = {}

    async def events(self, request):
        ws = web.WebSocketResponse(heartbeat=20)
        await ws.prepare(request)
        try:
            try:
                hello = await asyncio.wait_for(ws.receive_json(), 5)
            except (ValueError, TypeError, asyncio.TimeoutError):
                await ws.close(code=1008)
                return ws
            if not isinstance(hello, dict) or not self.token or not hmac.compare_digest(str(hello.get('token', '')), self.token):
                await ws.close(code=1008)
                return ws
            if self.socket and not self.socket.closed:
                await self.socket.close(code=1000)
            self.socket = ws
            self.ready.set()
            await ws.send_json({'type': 'ready'})
            async for message in ws:
                if message.type != WSMsgType.TEXT:
                    continue
                try:
                    data = message.json()
                    if isinstance(data, dict) and data.get('type') == 'recoverResult':
                        future = self.pending.get(data.get('id'))
                        if future and not future.done():
                            future.set_result(data)
                except (ValueError, TypeError):
                    continue
        finally:
            if self.socket is ws:
                self.socket = None
                self.ready.clear()
        return ws

    async def ensure(self):
        if not self.socket or self.socket.closed:
            if not self.launcher_url or not self.launcher_token:
                raise PlaylistError('맥미니의 Chrome 실행 도우미를 확인해주세요.')
            try:
                async with self.http.post(self.launcher_url + '/ensure',
                        headers={'Authorization': 'Bearer ' + self.launcher_token},
                        timeout=ClientTimeout(total=5)) as response:
                    if response.status != 200:
                        raise RuntimeError()
                await asyncio.wait_for(self.ready.wait(), 12)
            except (Exception, asyncio.TimeoutError):
                raise PlaylistError('회사 Chrome 연결을 확인하지 못했어요. 맥미니 로그인과 실행 도우미를 확인해주세요.') from None
        # Read the existing shared queue, never search YouTube or modify playback here.
        items = await self.playlist.browser_queue()
        playlist_id = self.playlist.youtube.playlist_id
        target = ('https://www.youtube.com/watch?v=' + items[0]['video_id'] + '&list=' + playlist_id) if items else self.playlist.youtube.url
        key = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self.pending[key] = future
        try:
            await self.socket.send_json({'type': 'recover', 'id': key, 'playlistId': playlist_id,
                                         'url': target, 'hasTracks': bool(items)})
            result = await asyncio.wait_for(future, 18)
            if not result.get('ok'):
                raise PlaylistError(str(result.get('error', '재생 탭을 복구하지 못했어요.'))[:200])
        except (ConnectionError, asyncio.TimeoutError, AttributeError, RuntimeError):
            raise PlaylistError('Chrome 재생 탭 연결이 늦어지고 있어요. 잠시 후 다시 눌러주세요.') from None
        finally:
            self.pending.pop(key, None)

    async def notify_control(self):
        if self.socket and not self.socket.closed:
            try:
                await self.socket.send_json({'type': 'controlReady'})
            except ConnectionError:
                pass
