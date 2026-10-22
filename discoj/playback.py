"""Authenticated loopback bridge for one explicitly selected browser tab."""
import hmac
import asyncio
import uuid
import hashlib
import json
import re
import time
from aiohttp import web


class Playback:
    def __init__(self, token, clock=time.monotonic, playlist=None):
        self.token, self.clock, self.playlist = token, clock, playlist
        self.updated = None
        self.data = None
        self.control_lock = asyncio.Lock()
        self.pending = None

    def current(self):
        if self.updated is None or self.clock() - self.updated > 45:
            return None
        return self.data

    def authenticate(self, request):
        if not self.token or not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + self.token):
            raise web.HTTPUnauthorized()

    async def queue(self, request):
        self.authenticate(request)
        if self.playlist is None:
            raise web.HTTPServiceUnavailable()
        from .youtube import PlaylistError
        try:
            items = await self.playlist.browser_queue()
        except PlaylistError:
            raise web.HTTPServiceUnavailable()
        payload = {'playlistId': self.playlist.youtube.playlist_id, 'items': items}
        payload['revision'] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        return web.json_response(payload, headers={'Cache-Control': 'no-store'})

    async def report(self, request):
        self.authenticate(request)
        try:
            data = await request.json()
            if not isinstance(data, dict) or data.get('state') not in ('playing', 'paused', 'unavailable'):
                raise ValueError()
            if data['state'] != 'unavailable':
                if not isinstance(data.get('title'), str) or not 1 <= len(data['title'].strip()) <= 500:
                    raise ValueError()
                if not isinstance(data.get('videoId'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{11}', data['videoId']):
                    raise ValueError()
                volume = data.get('volume', 100)
                if type(volume) not in (int, float) or not 0 <= volume <= 100:
                    raise ValueError()
                session = data.get('session', '')
                if not isinstance(session, str) or len(session) > 100:
                    raise ValueError()
                data = {'state': data['state'], 'title': data['title'].strip(), 'volume': round(volume), 'session': session,
                        'url': 'https://www.youtube.com/watch?v=' + data['videoId']}
            else:
                data = None
        except (ValueError, TypeError):
            raise web.HTTPBadRequest()
        self.data, self.updated = data, self.clock()
        return web.Response(status=204)

    async def control(self, action, value=None):
        from .youtube import PlaylistError
        if action not in ('previous', 'next', 'pause', 'play', 'volume_up', 'volume_down', 'volume', 'select'):
            raise PlaylistError('지원하지 않는 조작이에요.')
        if action == 'volume' and (type(value) is not int or not 0 <= value <= 100):
            raise PlaylistError('음량은 0~100 사이로 입력해주세요.')
        if action == 'select' and (type(value) is not int or value < 1):
            raise PlaylistError('재생할 곡 번호를 확인해주세요.')
        if self.control_lock.locked():
            raise PlaylistError('다른 조작을 처리 중이에요. 잠시 후 다시 눌러주세요.')
        async with self.control_lock:
            current = self.current()
            if not current or not current.get('session'):
                raise PlaylistError('연결된 재생 탭을 확인할 수 없어요. 확장 프로그램 연결을 확인해주세요.')
            if action == 'select':
                items = await self.playlist.browser_queue()
                target = next((item for item in items if item['number'] == value), None)
                if target is None:
                    raise PlaylistError('이미 삭제됐거나 없는 곡이에요. 목록을 다시 확인해주세요.')
                value = target['video_id']
            future = asyncio.get_running_loop().create_future()
            pending = {'id': uuid.uuid4().hex, 'action': action, 'value': value,
                       'session': current['session'], 'videoId': current['url'].split('v=')[1],
                       'expiresAt': int((time.time() + 12) * 1000)}
            self.pending = {'command': pending, 'future': future, 'delivered': False}
            try:
                result = await asyncio.wait_for(future, timeout=12)
                if not result.get('ok'):
                    raise PlaylistError(result.get('error', '브라우저에서 조작을 적용하지 못했어요.'))
                return result
            except asyncio.TimeoutError:
                raise PlaylistError('브라우저의 조작 응답을 확인하지 못했어요. 재생 상태를 확인 후 다시 시도해주세요.') from None
            finally:
                self.pending = None

    async def take_control(self, request):
        self.authenticate(request)
        pending = self.pending
        current = self.current()
        if (not pending or pending['delivered'] or pending['future'].done() or not current
                or current.get('session') != pending['command']['session']
                or request.query.get('session') != pending['command']['session']):
            return web.Response(status=204)
        pending['delivered'] = True  # Never replay a relative volume change after a lost response.
        return web.json_response(pending['command'], headers={'Cache-Control': 'no-store'})

    async def acknowledge(self, request):
        self.authenticate(request)
        try:
            body = await request.json()
            if not isinstance(body, dict) or not isinstance(body.get('result'), dict):
                raise ValueError()
        except (ValueError, TypeError):
            raise web.HTTPBadRequest()
        pending = self.pending
        current = self.current()
        if (not current or current.get('session') != body.get('session')
                or not pending or body.get('id') != pending['command']['id']
                or body.get('session') != pending['command']['session'] or pending['future'].done()):
            raise web.HTTPConflict()
        result = body['result']
        if type(result.get('ok')) is not bool:
            raise web.HTTPBadRequest()
        pending['future'].set_result({'ok': result['ok'],
            'message': str(result.get('message', '조작을 적용했어요.'))[:200],
            'error': str(result.get('error', '브라우저에서 조작을 적용하지 못했어요.'))[:200]})
        return web.Response(status=204)

    def app(self):
        app = web.Application(client_max_size=4096)
        app.router.add_post('/playback', self.report)
        app.router.add_get('/queue', self.queue)
        app.router.add_get('/control', self.take_control)
        app.router.add_post('/control/ack', self.acknowledge)
        return app
