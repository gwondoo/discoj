import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from aiohttp import ClientSession
from aiohttp.test_utils import TestServer
from discoj.host_launcher import Launcher
from discoj.playback import Playback
from discoj.recovery import Recovery
from discoj.youtube import PlaylistError


class RecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_launcher_auth_and_concurrent_clicks(self):
        launched = AsyncMock()
        launcher = Launcher('private', 'Default', launch=launched)
        server = TestServer(launcher.app())
        await server.start_server()
        try:
            async with ClientSession() as client:
                response = await client.post(server.make_url('/ensure'))
                self.assertEqual(response.status, 401)
                responses = await asyncio.gather(*[client.post(server.make_url('/ensure'),
                    headers={'Authorization':'Bearer private'}) for _ in range(3)])
                self.assertTrue(all(r.status == 200 for r in responses))
                self.assertEqual(launched.await_count, 1)
        finally:
            await server.close()

    async def test_already_playing_never_recovers_or_changes_video(self):
        playback = Playback('token')
        playback.recovery = SimpleNamespace(ensure=AsyncMock(), notify_control=AsyncMock())
        playback.updated = playback.clock()
        playback.data = {'state':'playing','session':'selected'}
        result = await playback.control('play')
        self.assertTrue(result['ok'])
        playback.recovery.ensure.assert_not_awaited()
        self.assertIsNone(playback.pending)

    async def test_play_recovers_missing_tab_and_does_not_pause_it(self):
        playback = Playback('token')
        async def recover():
            playback.updated = playback.clock()
            playback.data = {'state':'playing','session':'recovered'}
        playback.recovery = SimpleNamespace(ensure=AsyncMock(side_effect=recover))
        self.assertTrue((await playback.control('play'))['ok'])
        playback.recovery.ensure.assert_awaited_once()
        self.assertIsNone(playback.pending)

    async def test_authenticated_push_recovery_and_failure(self):
        playlist = SimpleNamespace(browser_queue=AsyncMock(return_value=[{'video_id':'12345678901'}]),
            youtube=SimpleNamespace(playlist_id='playlist',url='https://www.youtube.com/playlist?list=playlist'))
        async with ClientSession() as client:
            recovery = Recovery('private', playlist, client)
            from aiohttp import web
            app = web.Application()
            app.router.add_get('/events', recovery.events)
            server = TestServer(app)
            await server.start_server()
            try:
                ws = await client.ws_connect(server.make_url('/events'))
                await ws.send_json({'token':'wrong'})
                await ws.receive()
                self.assertFalse(recovery.ready.is_set())
                ws = await client.ws_connect(server.make_url('/events'))
                await ws.send_json({'token':'private'})
                self.assertEqual((await ws.receive_json())['type'],'ready')
                task = asyncio.create_task(recovery.ensure())
                command = await ws.receive_json()
                self.assertEqual(command['type'],'recover')
                self.assertIn('12345678901',command['url'])
                await ws.send_json({'type':'recoverResult','id':command['id'],'ok':True})
                await task
                await ws.close()
                await asyncio.sleep(0)
            finally:
                await server.close()

    async def test_closed_browser_launches_then_waits_for_extension(self):
        playlist = SimpleNamespace(browser_queue=AsyncMock(return_value=[]),
            youtube=SimpleNamespace(playlist_id='shared',url='https://www.youtube.com/playlist?list=shared'))
        async with ClientSession() as client:
            recovery = Recovery('extension-secret', playlist, client, launcher_token='host-secret')
            launch_calls = []
            class Socket:
                closed = False
                async def send_json(self, data):
                    self.command = data
                    recovery.pending[data['id']].set_result({'ok':True})
            socket = Socket()
            async def launch():
                launch_calls.append(True)
                recovery.socket = socket
                recovery.ready.set()
            host = TestServer(Launcher('host-secret','Default',launch=launch).app())
            await host.start_server()
            try:
                recovery.launcher_url = str(host.make_url('')).rstrip('/')
                await recovery.ensure()
                self.assertEqual(launch_calls,[True])
                self.assertEqual(socket.command['playlistId'],'shared')
                self.assertFalse(socket.command['hasTracks'])
                await recovery.ensure()
                self.assertEqual(len(launch_calls),1)
            finally:
                await host.close()

    async def test_launcher_opens_only_fixed_company_profile(self):
        process = SimpleNamespace(wait=AsyncMock(return_value=0))
        with patch('asyncio.create_subprocess_exec',new=AsyncMock(return_value=process)) as create:
            await Launcher('private','Default').open_chrome()
            self.assertEqual(create.call_args.args,('/usr/bin/open','-n','-a','Google Chrome','--args','--profile-directory=Default'))

    async def test_recovered_paused_video_receives_play_once(self):
        playback = Playback('token')
        async def recover():
            playback.updated=playback.clock()
            playback.data={'state':'paused','session':'recovered','url':'https://www.youtube.com/watch?v=12345678901'}
        async def notify():
            self.assertEqual(playback.pending['command']['action'],'play')
            playback.pending['future'].set_result({'ok':True})
        playback.recovery=SimpleNamespace(ensure=AsyncMock(side_effect=recover),notify_control=AsyncMock(side_effect=notify))
        self.assertTrue((await playback.control('play'))['ok'])
        playback.recovery.notify_control.assert_awaited_once()
