"""macOS login-user helper. Only opens the fixed company Chrome profile on demand."""
import asyncio
import hmac
import json
import time
from pathlib import Path
from aiohttp import web


class Launcher:
    def __init__(self, token, profile, launch=None, clock=time.monotonic):
        self.token, self.profile, self.clock = token, profile, clock
        self.lock = asyncio.Lock()
        self.last_launch = float('-inf')
        self.launch = launch or self.open_chrome

    async def open_chrome(self):
        process = await asyncio.create_subprocess_exec('/usr/bin/open', '-n', '-a', 'Google Chrome',
                    '--args', '--profile-directory=' + self.profile,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        if await process.wait() != 0:
            raise RuntimeError('Chrome launch failed')

    async def ensure(self, request):
        if not self.token or not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + self.token):
            raise web.HTTPUnauthorized()
        async with self.lock:
            if self.clock() - self.last_launch >= 15:
                await self.launch()  # No caller-supplied executable, URL, profile, or shell commands.
                self.last_launch = self.clock()
        return web.json_response({'ok': True})

    def app(self):
        app = web.Application(client_max_size=1024)
        app.router.add_post('/ensure', self.ensure)
        return app


def main():
    config = json.loads((Path(__file__).resolve().parent / 'host-launcher.json').read_text())
    launcher = Launcher(config['token'], config['profile'])
    web.run_app(launcher.app(), host='127.0.0.1', port=18769, access_log=None, print=None)


if __name__ == '__main__':
    main()
