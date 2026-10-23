import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from discoj.bot import ActivityLauncher, MusicBot


class LauncherTests(unittest.IsolatedAsyncioTestCase):
    async def test_launch_response_and_channel_scope(self):
        bot = MusicBot(SimpleNamespace(), 1, 2, set())
        view = ActivityLauncher(bot)
        self.assertTrue(view.is_persistent())
        interaction = SimpleNamespace(guild_id=1, channel_id=2,
            response=SimpleNamespace(launch_activity=AsyncMock(), send_message=AsyncMock()))
        await view.launch.callback(interaction)
        interaction.response.launch_activity.assert_awaited_once()
        interaction.channel_id = 3
        await view.launch.callback(interaction)
        self.assertEqual(interaction.response.launch_activity.await_count, 1)
        self.assertTrue(interaction.response.send_message.call_args.kwargs['ephemeral'])
        await bot.close()

    async def test_guide_reuses_saved_message_without_automatic_pinning(self):
        bot = MusicBot(SimpleNamespace(), 1, 2, set())
        bot._connection.user = SimpleNamespace(id=7)
        message = SimpleNamespace(id=123, author=SimpleNamespace(id=7), pinned=False,
                                  edit=AsyncMock(), pin=AsyncMock())
        async def pin(**kwargs):
            message.pinned = True
        message.pin.side_effect = pin
        async def history(**kwargs):
            if False:
                yield None
        channel = SimpleNamespace(send=AsyncMock(return_value=message),
            fetch_message=AsyncMock(return_value=message), history=history)
        bot.get_channel = Mock(return_value=channel)
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'launcher.json')
            with patch.dict(os.environ, {'ACTIVITY_LAUNCHER_PATH':path}):
                await bot.ensure_activity_launcher()
                await bot.ensure_activity_launcher()
                self.assertEqual(json.loads(Path(path).read_text())['message_id'], 123)
        channel.send.assert_awaited_once()
        message.pin.assert_not_awaited()
        message.edit.assert_awaited_once()
        self.assertEqual(message.edit.call_args.kwargs['view'].children[0].label, '디스코제이 열기')
        await bot.close()
