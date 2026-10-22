import asyncio
import logging
import os
import anyio
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .queue import Queue

load_dotenv()
log = logging.getLogger(__name__)
PUBLIC = Path(__file__).resolve().parent.parent / 'public'


def create_app(queue=None):
    queue = queue or Queue(os.getenv('FALLBACK_VIDEO_ID', ''), int(os.getenv('MAX_QUEUE_SIZE', '100')))
    origin = os.getenv('PLAYER_ORIGIN', 'http://127.0.0.1:8000').rstrip('/')
    bot = None
    token = os.getenv('DISCORD_TOKEN', '')
    if token:
        from .bot import MusicBot
        bot = MusicBot(queue, int(os.environ['DISCORD_GUILD_ID']), int(os.environ['DISCORD_CHANNEL_ID']),
                       {int(v.strip()) for v in os.getenv('EXCLUDED_USER_IDS', '').split(',') if v.strip()})

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(bot.start(token)) if bot else None
        if task:
            def report_failure(done):
                if not done.cancelled() and done.exception():
                    log.error('Discord bot stopped: %s', type(done.exception()).__name__)
            task.add_done_callback(report_failure)
        yield
        if bot:
            await bot.close()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    app = FastAPI(title='DiscoJ', lifespan=lifespan)
    app.state.queue = queue
    app.mount('/static', StaticFiles(directory=PUBLIC), name='static')

    @app.get('/', include_in_schema=False)
    async def index():
        return FileResponse(PUBLIC / 'index.html', headers={'Referrer-Policy': 'strict-origin-when-cross-origin'})

    @app.get('/health')
    async def health():
        return {'server': 'ok', 'player_connected': queue.connected,
                'bot': 'connected' if bot and bot.is_ready() else ('disconnected' if bot else 'not_configured')}

    @app.websocket('/ws/player')
    async def player(ws: WebSocket):
        if ws.headers.get('origin') != origin:
            await ws.close(code=1008)
            return
        async with queue.lock:
            if queue.connected:
                await ws.close(code=1008)
                return
            queue.connected = True
            queue.status = 'loading' if queue.current else 'idle'
            if not queue.current:
                queue.advance()
        await ws.accept()

        async def send_updates():
            previous = None
            while True:
                state = queue.snapshot()
                if state != previous:
                    await ws.send_json({'type': 'state', **state})
                    previous = state
                await asyncio.sleep(0.25)

        sender = asyncio.create_task(send_updates())
        try:
            while True:
                data = await asyncio.wait_for(ws.receive_json(), timeout=30)
                if not isinstance(data, dict):
                    await ws.close(code=1008)
                    break
                if data.get('type') == 'ping':
                    await ws.send_json({'type': 'pong'})
                elif data.get('type') == 'event':
                    title = data.get('title', '')
                    await queue.report(data.get('session'), data.get('event'), title if isinstance(title, str) else '')
        except (WebSocketDisconnect, asyncio.TimeoutError, ValueError):
            pass
        finally:
            with anyio.CancelScope(shield=True):
                sender.cancel()
                await asyncio.gather(sender, return_exceptions=True)
                async with queue.lock:
                    queue.connected = False
                    queue.status = 'offline'

    return app


app = create_app()
