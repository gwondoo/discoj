import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from aiohttp import ClientSession
from aiohttp.test_utils import TestServer
from discoj.playback import Playback
from discoj.bot import MusicBot


class PlaybackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.now = 100
        self.playback = Playback('local-test-token', lambda: self.now)
        self.server = TestServer(self.playback.app())
        await self.server.start_server()
        self.http = ClientSession()

    async def asyncTearDown(self):
        await self.http.close()
        await self.server.close()

    async def report(self, data, token='local-test-token'):
        async with self.http.post(self.server.make_url('/playback'), json=data,
                                  headers={'Authorization': 'Bearer ' + token}) as response:
            return response.status

    async def test_auth_validation_and_expiry(self):
        track = {'state':'playing', 'title':'영상 제목', 'videoId':'12345678901'}
        self.assertEqual(await self.report(track, 'wrong'), 401)
        self.assertIsNone(self.playback.current())
        self.assertEqual(await self.report(dict(track, videoId='https://evil.test')), 400)
        self.assertEqual(await self.report(track), 204)
        self.assertEqual(self.playback.current()['url'], 'https://www.youtube.com/watch?v=12345678901')
        self.now += 46
        self.assertIsNone(self.playback.current())
        self.assertEqual(await self.report(dict(track, state='paused')), 204)
        self.assertEqual(self.playback.current()['state'], 'paused')
        self.assertEqual(await self.report({'state':'unavailable'}), 204)
        self.assertIsNone(self.playback.current())

    async def test_queue_is_authenticated_and_revision_tracks_changes(self):
        self.playback.playlist = SimpleNamespace(
            youtube=SimpleNamespace(playlist_id='playlist'),
            browser_queue=AsyncMock(return_value=[{'id':'item', 'number':1, 'video_id':'12345678901', 'title':'Test'}]))
        async with self.http.get(self.server.make_url('/queue')) as response:
            self.assertEqual(response.status, 401)
        headers = {'Authorization': 'Bearer local-test-token'}
        async with self.http.get(self.server.make_url('/queue'), headers=headers) as response:
            data = await response.json()
            self.assertEqual(data['items'][0]['number'], 1)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.playback.playlist.browser_queue.return_value = []
        async with self.http.get(self.server.make_url('/queue'), headers=headers) as response:
            self.assertNotEqual((await response.json())['revision'], data['revision'])

    async def test_current_video_is_private_and_distinguishes_pause(self):
        bot = MusicBot(SimpleNamespace(), 1, 2, set(), playback=self.playback)
        interaction = Mock()
        interaction.response.send_message = AsyncMock()
        command = bot.tree.get_command('현재곡')
        await command.callback(interaction)
        self.assertIn('확인할 수 없어요', interaction.response.send_message.call_args.args[0])
        for state, text in [('playing','현재 재생'), ('paused','일시정지')]:
            await self.report({'state':state, 'title':'영상 제목', 'videoId':'12345678901'})
            await command.callback(interaction)
            args, kwargs = interaction.response.send_message.call_args
            self.assertTrue(kwargs['ephemeral'])
            self.assertIn(text, args[0])
            self.assertEqual(kwargs['view'].children[0].url, 'https://www.youtube.com/watch?v=12345678901')
        await bot.close()
