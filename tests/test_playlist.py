"""Real HTTP client against a local stateful Google/YouTube stand-in.
Response shapes follow the official playlistItems and OAuth token contracts.
"""
import asyncio
import unittest
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, Mock
from aiohttp import web, ClientSession, ClientTimeout
from aiohttp.test_utils import TestServer
from discoj.youtube import YouTube, PlaylistError
from discoj.playlist import Playlist, video_id
from discoj.bot import MusicBot, PlaylistView


class PlaylistTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.items = []
        self.calls = []
        self.error = None
        self.auth_calls = 0
        self.insert_count = 0
        app = web.Application()
        app.router.add_post('/token', self.token)
        app.router.add_route('*', '/youtube/v3/playlistItems', self.handle)
        self.server = TestServer(app)
        await self.server.start_server()
        self.http = ClientSession(timeout=ClientTimeout(total=2))
        self.youtube = YouTube(self.http, 'playlist', 'client', 'secret', 'refresh',
            str(self.server.make_url('/youtube/v3')), str(self.server.make_url('/token')))
        self.playlist = Playlist(self.youtube, limit=90)

    async def asyncTearDown(self):
        await self.http.close()
        await self.server.close()

    async def token(self, request):
        self.auth_calls += 1
        self.assertEqual((await request.post())['grant_type'], 'refresh_token')
        return web.json_response({'access_token':'test-only-token', 'expires_in':3600})

    async def handle(self, request):
        self.calls.append(request.method)
        self.assertEqual(request.headers.get('Authorization'), 'Bearer test-only-token')
        if self.error:
            status, reason = self.error
            return web.json_response({'error':{'errors':[{'reason':reason}]}}, status=status)
        if request.method == 'GET':
            self.assertEqual(request.query['playlistId'], 'playlist')
            offset = int(request.query.get('pageToken', '0'))
            result = {'items':self.items[offset:offset+50]}
            if offset+50 < len(self.items):
                result['nextPageToken'] = str(offset+50)
            return web.json_response(result)
        if request.method == 'POST':
            body = await request.json()
            self.assertEqual(body['snippet']['playlistId'], 'playlist')
            self.insert_count += 1
            item = {'id':f'item-{self.insert_count}', 'snippet':{'title':'Test track', 'resourceId':body['snippet']['resourceId']}}
            self.items.append(item)
            return web.json_response(item)
        if request.method == 'DELETE':
            self.items = [x for x in self.items if x['id'] != request.query['id']]
            return web.Response(status=204)
        return web.Response(status=501)

    async def test_add_duplicate_delete_and_permissions(self):
        results = await asyncio.gather(*(self.playlist.add('https://youtu.be/12345678901', i) for i in range(5)), return_exceptions=True)
        self.assertEqual(sum(type(x) is int for x in results), 1)
        self.assertEqual(self.calls.count('POST'), 1)
        with self.assertRaises(PlaylistError):
            await self.playlist.delete(1, 99)
        await self.playlist.delete(1, 0)
        self.assertEqual(await self.playlist.list(), [])
        self.assertEqual(self.auth_calls, 1)

    async def test_pagination_external_items_restart_and_limit(self):
        self.items = [{'id':f'old-{i}', 'snippet':{'title':str(i), 'resourceId':{'videoId':f'{i:011d}'}}} for i in range(90)]
        self.assertEqual(len(await self.playlist.list()), 90)
        with self.assertRaises(PlaylistError):
            await self.playlist.add('https://youtu.be/abcdefghijk', 1)
        with self.assertRaises(PlaylistError):
            await self.playlist.delete(1, 1)
        await self.playlist.delete(1, 1, admin=True)
        self.assertEqual(len(self.items), 89)

    async def test_quota_circuit_breaker_and_permission_error(self):
        self.error = (403, 'quotaExceeded')
        with self.assertRaises(PlaylistError):
            await self.playlist.list()
        count = len(self.calls)
        with self.assertRaises(PlaylistError):
            await self.playlist.list()
        self.assertEqual(len(self.calls), count)
        self.youtube.blocked_day = None
        self.error = (403, 'forbidden')
        with self.assertRaises(PlaylistError):
            await self.playlist.list()
        self.assertIsNone(self.youtube.blocked_day)

    async def test_duplicate_when_youtube_list_lags(self):
        await self.playlist.add('https://youtu.be/12345678901', 1)
        self.items = []  # Successful insert is not visible to the next list request yet.
        with self.assertRaises(PlaylistError):
            await self.playlist.add('https://youtu.be/12345678901', 1)
        self.assertEqual(self.calls.count('POST'), 1)

    async def test_ambiguous_write_not_retried(self):
        self.error = (500, 'backendError')
        with self.assertRaises(PlaylistError):
            await self.youtube.insert('12345678901')
        self.assertEqual(self.calls, ['POST'])
        self.assertEqual(self.playlist.owners, {})

    async def test_unconfigured_and_commands(self):
        self.youtube.credentials['refresh_token'] = ''
        with self.assertRaises(PlaylistError):
            await self.playlist.list()
        self.assertEqual(self.calls, [])
        bot = MusicBot(self.playlist, 1, 2, set())
        self.assertEqual({x.name for x in bot.tree.get_commands()}, {'추가','목록','삭제'})
        for command in bot.tree.get_commands():
            command.to_dict(bot.tree)
        await bot.close()

    async def test_numbers_survive_restart_and_are_not_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'numbers.json'
            playlist = Playlist(self.youtube, numbers_path=path)
            one = await playlist.add('https://youtu.be/12345678901', 1)
            two = await playlist.add('https://youtu.be/abcdefghijk', 1)
            three = await playlist.add('https://youtu.be/ABCDEFGHIJK', 1)
            self.assertEqual((one, two, three), (1, 2, 3))
            await playlist.delete(two, 1)
            playlist = Playlist(self.youtube, numbers_path=path)
            four = await playlist.add('https://youtu.be/98765432109', 1)
            self.assertEqual(four, 4)
            self.assertEqual([item['number'] for item in await playlist.list()], [1, 3, 4])
            with self.assertRaises(PlaylistError):
                await playlist.delete(two, 1, admin=True)
            self.assertEqual(self.calls.count('DELETE'), 1)
            # Ownership stays in memory, so old entries still require an administrator.
            with self.assertRaises(PlaylistError):
                await playlist.delete(one, 1)
            await playlist.delete(one, 1, admin=True)

    async def test_listing_is_private_with_titles_and_link(self):
        await self.playlist.add('https://youtu.be/12345678901', 1)
        bot = MusicBot(self.playlist, 1, 2, set())
        interaction = Mock()
        interaction.response.defer = AsyncMock()
        interaction.followup.send = AsyncMock()
        await bot.tree.get_command('목록').callback(interaction)
        interaction.response.defer.assert_awaited_once_with(ephemeral=True, thinking=True)
        args, kwargs = interaction.followup.send.call_args
        self.assertTrue(kwargs['ephemeral'])
        self.assertIn('`1` · Test track', args[0])
        self.assertEqual(kwargs['view'].children[-1].url, self.youtube.url)
        view = PlaylistView([{'number':i+1, 'title':'영상 제목'} for i in range(21)], self.youtube.url)
        self.assertIn('1/3페이지', view.content())
        interaction.response.edit_message = AsyncMock()
        await view.next_page.callback(interaction)
        self.assertIn('`11` · 영상 제목', view.content())
        self.assertNotIn('`1` ·', view.content())
        await bot.close()

    async def test_invalid_links(self):
        for link in ('https://evil.test/watch?v=12345678901', 'https://youtube.com/playlist?list=x', 'file:///12345678901'):
            with self.assertRaises(PlaylistError):
                video_id(link)
        self.assertEqual(video_id('https://youtu.be/12345678901?t=12'), '12345678901')
