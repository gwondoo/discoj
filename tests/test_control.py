import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from aiohttp import ClientSession
from aiohttp.test_utils import TestServer
from discoj.playback import Playback
from discoj.bot import MusicBot, ControlPanel
from discoj.youtube import PlaylistError


class ControlTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.playback = Playback('test-token')
        self.server = TestServer(self.playback.app())
        await self.server.start_server()
        self.http = ClientSession(headers={'Authorization':'Bearer test-token'})
        await self.http.post(self.server.make_url('/playback'), json={'state':'playing','title':'Track',
            'videoId':'12345678901','session':'browser-session','volume':75})

    async def asyncTearDown(self):
        await self.http.close()
        await self.server.close()

    async def test_command_is_delivered_once_and_acknowledged(self):
        task = asyncio.create_task(self.playback.control('volume_down'))
        await asyncio.sleep(0)
        async with self.http.get(self.server.make_url('/control?session=wrong')) as response:
            self.assertEqual(response.status, 204)
        async with self.http.get(self.server.make_url('/control?session=browser-session')) as response:
            command = await response.json()
            self.assertEqual(command['action'], 'volume_down')
        async with self.http.get(self.server.make_url('/control?session=browser-session')) as response:
            self.assertEqual(response.status, 204)
        body = {'id':command['id'],'session':'browser-session','result':{'ok':True,'message':'65%'}}
        async with self.http.post(self.server.make_url('/control/ack'), json=body) as response:
            self.assertEqual(response.status, 204)
        self.assertEqual((await task)['message'], '65%')
        self.assertIsNone(self.playback.pending)
        async with self.http.post(self.server.make_url('/control/ack'), json=body) as response:
            self.assertEqual(response.status, 409)

    async def test_auth_validation_busy_and_browser_failure(self):
        async with self.http.get(self.server.make_url('/control?session=browser-session'), headers={'Authorization':'bad'}) as response:
            self.assertEqual(response.status, 401)
        with self.assertRaises(PlaylistError):
            await self.playback.control('volume', 101)
        task = asyncio.create_task(self.playback.control('play'))
        await asyncio.sleep(0)
        with self.assertRaises(PlaylistError):
            await self.playback.control('pause')
        pending = self.playback.pending['command']
        async with self.http.post(self.server.make_url('/control/ack'), json={
            'id':pending['id'],'session':'browser-session','result':{'ok':False,'error':'브라우저에서 재생이 차단됐어요.'}}) as response:
            self.assertEqual(response.status, 204)
        with self.assertRaisesRegex(PlaylistError, '차단'):
            await task
        self.playback.updated = None
        with self.assertRaises(PlaylistError):
            await self.playback.control('play')

    async def test_control_panel_is_private_and_updates_same_message(self):
        bot = MusicBot(SimpleNamespace(), 1, 2, set(), playback=self.playback)
        interaction = Mock()
        interaction.user.id = 7
        interaction.response.defer = AsyncMock()
        interaction.followup.send = AsyncMock()
        interaction.edit_original_response = AsyncMock()
        await bot.tree.get_command('컨트롤').callback(interaction)
        self.assertTrue(interaction.followup.send.call_args.kwargs['ephemeral'])
        panel = interaction.followup.send.call_args.kwargs['view']
        self.assertIn('75%', panel.content())
        self.playback.control = AsyncMock(return_value={'message':'일시정지했어요.'})
        await panel.pause.callback(interaction)
        self.playback.control.assert_awaited_once_with('pause', None)
        self.assertIn('일시정지', interaction.edit_original_response.call_args.kwargs['content'])
        other = Mock(); other.user.id = 99; other.response.send_message = AsyncMock()
        self.assertFalse(await panel.interaction_check(other))
        await bot.close()
