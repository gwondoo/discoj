"""Authenticated loopback bridge for one explicitly selected browser tab."""
import hmac
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
                data = {'state': data['state'], 'title': data['title'].strip(),
                        'url': 'https://www.youtube.com/watch?v=' + data['videoId']}
            else:
                data = None
        except (ValueError, TypeError):
            raise web.HTTPBadRequest()
        self.data, self.updated = data, self.clock()
        return web.Response(status=204)

    def app(self):
        app = web.Application(client_max_size=4096)
        app.router.add_post('/playback', self.report)
        app.router.add_get('/queue', self.queue)
        return app
