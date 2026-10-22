"""No HTTP listener or frontend: Discord Gateway is the entry point."""
import asyncio
import logging
import os
import aiohttp
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
                          os.getenv('GOOGLE_REFRESH_TOKEN', ''))
        if not youtube.configured:
            logging.warning('유튜브 인증 미설정: 명령어는 연동 설정 필요 안내를 반환합니다.')
        playlist = Playlist(youtube, int(os.getenv('MAX_PLAYLIST_SIZE', '90')))
        bot = MusicBot(playlist, int(os.environ['DISCORD_GUILD_ID']), int(os.environ['DISCORD_CHANNEL_ID']),
                       {int(v.strip()) for v in os.getenv('EXCLUDED_USER_IDS', '').split(',') if v.strip()})
        async with bot:
            await bot.start(token)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
