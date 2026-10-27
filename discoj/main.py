"""Discord bot with an optional authenticated local browser bridge."""
import asyncio
import logging
import os
import aiohttp
from aiohttp import web
from .playback import Playback
from .recovery import Recovery
from .activity import Activity
from dotenv import load_dotenv
from .bot import MusicBot
from .playlist import Playlist
from .youtube import YouTube


async def main():
    load_dotenv()
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        raise SystemExit('DISCORD_TOKEN 설정이 필요합니다.')
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as session:
        youtube = YouTube(session, os.getenv('YOUTUBE_PLAYLIST_ID', ''),
                          os.getenv('GOOGLE_CLIENT_ID', ''), os.getenv('GOOGLE_CLIENT_SECRET', ''),
                          os.getenv('GOOGLE_REFRESH_TOKEN', ''),
                          quota_path=os.getenv('QUOTA_STATE_PATH', 'data/quota-state.json'))
        if not youtube.configured:
            logging.warning('유튜브 인증 미설정: 명령어는 연동 설정 필요 안내를 반환합니다.')
        playlist = Playlist(youtube, int(os.getenv('MAX_PLAYLIST_SIZE', '90')),
                            os.getenv('TRACK_NUMBERS_PATH', 'data/track-numbers.json'))
        playback = Playback(os.getenv('PLAYBACK_TOKEN', ''), playlist=playlist)
        bot = MusicBot(playlist, int(os.environ['DISCORD_GUILD_ID']), int(os.environ['DISCORD_CHANNEL_ID']),
                       {int(v.strip()) for v in os.getenv('EXCLUDED_USER_IDS', '').split(',') if v.strip()}, playback=playback)
        playback.recovery = Recovery(playback.token, playlist, session,
            os.getenv('HOST_LAUNCH_URL', ''), os.getenv('HOST_LAUNCH_TOKEN', ''))
        runner = web.AppRunner(playback.app(), access_log=None)
        activity_runner = None
        if playback.token:
            await runner.setup()
            await web.TCPSite(runner, os.getenv('PLAYBACK_HOST', '127.0.0.1'), 18766).start()
        try:
            if os.getenv('DISCORD_CLIENT_SECRET'):
                activity = Activity(playback, bot, session,
                    os.getenv('DISCORD_CLIENT_ID', '1562673893205086288'), os.environ['DISCORD_CLIENT_SECRET'])
                activity_runner = web.AppRunner(activity.app(), access_log=None)
                await activity_runner.setup()
                await web.TCPSite(activity_runner, os.getenv('ACTIVITY_HOST', '127.0.0.1'), 18768).start()
            async with bot:
                await bot.start(token)
        finally:
            if activity_runner:
                await activity_runner.cleanup()
            await runner.cleanup()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
