import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from aiohttp import ClientSession, web
from aiohttp.test_utils import TestServer
from discoj.activity import Activity
from discoj.playback import Playback


class ActivityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.now = 100
        self.oauth_status = 200
        self.calls = []
        async def oauth(request):
            data = await request.post()
            self.calls.append(('token', dict(data)))
            if self.oauth_status != 200:
                return web.Response(status=self.oauth_status, text='upstream private error')
            if data.get('code') != 'valid-code' or data.get('client_secret') != 'private-secret':
                return web.json_response({'error': 'invalid_grant'}, status=400)
            return web.json_response({'access_token': 'discord-access', 'expires_in': 7200, 'scope': 'identify', 'token_type': 'Bearer'})
        async def identity(request):
            self.assertEqual(request.headers.get('Authorization'), 'Bearer discord-access')
            self.calls.append(('identity', None))
            return web.json_response({'id': '123', 'username': 'member'})
        upstream = web.Application()
        upstream.router.add_post('/oauth2/token', oauth)
        upstream.router.add_get('/users/@me', identity)
        self.upstream = TestServer(upstream)
        await self.upstream.start_server()
        self.http = ClientSession()
        self.channel = Mock()
        self.channel.permissions_for.return_value = SimpleNamespace(view_channel=True)
        self.guild = Mock()
        self.guild.get_channel.return_value = self.channel
        self.guild.fetch_member = AsyncMock(return_value=object())
        self.bot = SimpleNamespace(guild_id=1, channel_id=2, excluded=set(), get_guild=lambda _: self.guild)
        self.playlist = SimpleNamespace(browser_queue=AsyncMock(return_value=[
            {'id': 'private-item-id', 'number': 15, 'title': '<script>song</script>', 'video_id': '12345678901'}]),
            youtube=SimpleNamespace(url='https://www.youtube.com/playlist?list=test'))
        self.playback = Playback('private-extension-token', clock=lambda: self.now, playlist=self.playlist)
        self.playback.data = {'title': 'Current', 'url': 'https://www.youtube.com/watch?v=12345678901',
                              'state': 'playing', 'volume': 100, 'session': 'private-browser-session'}
        self.playback.updated = self.now
        self.activity = Activity(self.playback, self.bot, self.http, 'client', 'private-secret',
                                 discord_api=str(self.upstream.make_url('')).rstrip('/'), clock=lambda: self.now)
        self.server = TestServer(self.activity.app())
        await self.server.start_server()

    async def asyncTearDown(self):
        await self.server.close()
        await self.http.close()
        await self.upstream.close()

    async def login(self):
        async with self.http.post(self.server.make_url('/api/session'), json={'code': 'valid-code'}) as response:
            self.assertEqual(response.status, 200)
            data = await response.json()
        return {'Authorization': 'Bearer ' + data['session']}

    async def test_authentication_state_and_revoked_channel_access(self):
        async with self.http.get(self.server.make_url('/api/state')) as response:
            self.assertEqual(response.status, 401)
        headers = await self.login()
        async with self.http.get(self.server.make_url('/api/state'), headers=headers) as response:
            self.assertEqual(response.status, 200)
            data = await response.json()
            self.assertEqual(data['items'][0]['number'], 15)
            self.assertEqual(data['current']['volume'], 100)
            text = str(data)
            for private in ('private-extension-token', 'private-browser-session', 'private-item-id', 'discord-access'):
                self.assertNotIn(private, text)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual([c[0] for c in self.calls], ['token', 'identity'])
        self.channel.permissions_for.return_value.view_channel = False
        self.now += 61
        async with self.http.get(self.server.make_url('/api/state'), headers=headers) as response:
            self.assertEqual(response.status, 403)

    async def test_reject_nonmembers_invalid_codes_and_discord_outage(self):
        self.channel.permissions_for.return_value.view_channel = False
        async with self.http.post(self.server.make_url('/api/session'), json={'code': 'valid-code'}) as response:
            self.assertEqual(response.status, 403)
        self.assertEqual(self.activity.sessions, {})
        async with self.http.post(self.server.make_url('/api/session'), json={'code': 'bad-code'}) as response:
            self.assertEqual(response.status, 401)
        self.oauth_status = 503
        async with self.http.post(self.server.make_url('/api/session'), json={'code': 'valid-code'}) as response:
            self.assertEqual(response.status, 503)
            self.assertNotIn('private', await response.text())

    async def test_control_round_trip_and_no_duplicate_replay(self):
        headers = await self.login()
        command = {'action': 'volume', 'value': 100, 'requestId': 'request-123'}
        task = asyncio.create_task(self.http.post(self.server.make_url('/api/control'), headers=headers, json=command))
        for _ in range(100):
            if self.playback.pending:
                break
            await asyncio.sleep(.001)
        pending = self.playback.pending
        self.assertIsNotNone(pending)
        pending['future'].set_result({'ok': True, 'message': '음량 적용'})
        response = await task
        self.assertEqual((await response.json())['message'], '음량 적용')
        response.release()
        self.assertIsNone(self.playback.pending)
        async with self.http.post(self.server.make_url('/api/control'), headers=headers, json=command) as response:
            self.assertTrue((await response.json())['ok'])
        self.assertIsNone(self.playback.pending)
        async with self.http.post(self.server.make_url('/api/control'), headers=headers,
                                  json=dict(command, value=20)) as response:
            self.assertEqual(response.status, 409)
        async with self.http.post(self.server.make_url('/api/control'), headers=headers,
                                  json=dict(command, requestId='request-456', value=101)) as response:
            self.assertEqual(response.status, 400)

    async def test_expiry_and_disconnected_playback(self):
        headers = await self.login()
        self.playback.data = None
        async with self.http.post(self.server.make_url('/api/control'), headers=headers,
            json={'action': 'next', 'requestId': 'request-next'}) as response:
            data = await response.json()
            self.assertFalse(data['ok'])
            self.assertIn('확장', data['message'])
        self.now += 3601
        async with self.http.get(self.server.make_url('/api/state'), headers=headers) as response:
            self.assertEqual(response.status, 401)

    async def test_all_controls_reach_authenticated_extension_bridge(self):
        headers = await self.login()
        bridge = TestServer(self.playback.app())
        await bridge.start_server()
        extension_auth = {'Authorization': 'Bearer private-extension-token'}
        try:
            for index, action in enumerate(('previous', 'next', 'play', 'pause', 'volume', 'select')):
                self.now += 2
                body = {'action': action, 'requestId': f'control-{index}'}
                if action == 'volume':
                    body['value'] = 71
                if action == 'select':
                    body['value'] = 15
                task = asyncio.create_task(self.http.post(self.server.make_url('/api/control'), headers=headers, json=body))
                command = None
                for _ in range(100):
                    async with self.http.get(bridge.make_url('/control?session=private-browser-session'), headers=extension_auth) as response:
                        if response.status == 200:
                            command = await response.json()
                            break
                    await asyncio.sleep(.001)
                self.assertIsNotNone(command)
                self.assertEqual(command['action'], action)
                self.assertEqual(command['value'], '12345678901' if action == 'select' else body.get('value'))
                async with self.http.post(bridge.make_url('/control/ack'), headers=extension_auth, json={
                    'id': command['id'], 'session': command['session'], 'result': {'ok': True, 'message': action + ' applied'}}) as response:
                    self.assertEqual(response.status, 204)
                response = await task
                self.assertEqual((await response.json())['message'], action + ' applied')
                response.release()
        finally:
            await bridge.close()

    async def test_add_is_authenticated_idempotent_and_does_not_control_playback(self):
        self.playlist.add = AsyncMock(return_value=16)
        self.playback.control = AsyncMock()
        current = dict(self.playback.current())
        body = {'link': 'https://youtu.be/abcdefghijk', 'requestId': 'add-request-1'}
        async with self.http.post(self.server.make_url('/api/add'), json=body) as response:
            self.assertEqual(response.status, 401)
        headers = await self.login()
        for _ in range(2):
            async with self.http.post(self.server.make_url('/api/add'), headers=headers, json=body) as response:
                payload = await response.json()
                self.assertEqual(payload['number'], 16)
        self.playlist.add.assert_awaited_once_with('https://www.youtube.com/watch?v=abcdefghijk', 123)
        self.playback.control.assert_not_called()
        self.assertEqual(self.playback.current(), current)
        async with self.http.post(self.server.make_url('/api/add'), headers=headers,
            json=dict(body, link='https://example.com/not-youtube')) as response:
            self.assertEqual(response.status, 400)
        self.now += 2
        from discoj.youtube import PlaylistError
        self.playlist.add.side_effect = PlaylistError('API 한도에 도달했어요.')
        async with self.http.post(self.server.make_url('/api/add'), headers=headers,
            json=dict(body, requestId='add-request-2')) as response:
            self.assertFalse((await response.json())['ok'])
        self.playback.control.assert_not_called()

    async def test_select_deleted_track_never_reaches_the_browser(self):
        headers = await self.login()
        async with self.http.post(self.server.make_url('/api/control'), headers=headers,
            json={'action': 'select', 'value': 999, 'requestId': 'select-missing'}) as response:
            data = await response.json()
            self.assertFalse(data['ok'])
            self.assertIn('없는 곡', data['message'])
        self.assertIsNone(self.playback.pending)
