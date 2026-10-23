"""Discord-authenticated Activity API. Never exposes the extension bridge token."""
import asyncio
import secrets
import time
from collections import OrderedDict

import aiohttp
from aiohttp import web
from .youtube import PlaylistError


class Activity:
    def __init__(self, playback, bot, http, client_id, client_secret,
                 discord_api='https://discord.com/api/v10', clock=time.monotonic):
        self.playback, self.bot, self.http = playback, bot, http
        self.client_id, self.client_secret = client_id, client_secret
        self.discord_api, self.clock = discord_api.rstrip('/'), clock
        self.sessions = {}
        self.auth_attempts = []
        self.auth_slots = asyncio.Semaphore(4)

    async def discord(self, method, path, **kwargs):
        try:
            async with self.http.request(method, self.discord_api + path,
                                         timeout=aiohttp.ClientTimeout(total=10), **kwargs) as response:
                if response.status >= 400:
                    if response.status >= 500 or response.status == 429:
                        raise web.HTTPServiceUnavailable(text='Discord 인증 서버가 응답하지 않아요. 잠시 후 다시 시도해주세요.')
                    raise web.HTTPUnauthorized(text='Discord 인증을 완료하지 못했어요. 화면을 다시 열어주세요.')
                data = await response.json()
                if not isinstance(data, dict):
                    raise ValueError()
                return data
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            raise web.HTTPServiceUnavailable(text='Discord 인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.') from None

    async def check_member(self, user_id):
        import discord
        guild = self.bot.get_guild(self.bot.guild_id)
        channel = guild.get_channel(self.bot.channel_id) if guild else None
        if not channel:
            raise web.HTTPServiceUnavailable(text='봇이 서버에 연결 중이에요. 잠시 후 다시 시도해주세요.')
        try:
            member = await guild.fetch_member(int(user_id))
        except discord.NotFound:
            raise web.HTTPForbidden(text='디스코제이 채널 멤버만 사용할 수 있어요.') from None
        except discord.HTTPException:
            raise web.HTTPServiceUnavailable(text='서버 멤버 권한을 확인하지 못했어요.') from None
        if int(user_id) in self.bot.excluded or not channel.permissions_for(member).view_channel:
            raise web.HTTPForbidden(text='디스코제이 채널에 접근할 권한이 없어요.')

    async def create_session(self, request):
        if not self.client_secret:
            raise web.HTTPServiceUnavailable(text='Discord OAuth2 설정이 필요해요.')
        now = self.clock()
        self.sessions = {k: v for k, v in self.sessions.items() if v['expires'] > now}
        self.auth_attempts = [t for t in self.auth_attempts if now - t < 60]
        if len(self.auth_attempts) >= 30 or len(self.sessions) >= 256:
            raise web.HTTPTooManyRequests(text='인증 요청이 많아요. 잠시 후 다시 열어주세요.')
        self.auth_attempts.append(now)
        body = await self.body(request)
        code = body.get('code')
        if not isinstance(code, str) or not 1 <= len(code) <= 2048:
            raise web.HTTPBadRequest(text='올바른 인증 코드가 필요해요.')
        async with self.auth_slots:
            token = await self.discord('POST', '/oauth2/token', data={
                'client_id': self.client_id, 'client_secret': self.client_secret,
                'grant_type': 'authorization_code', 'code': code})
            access = token.get('access_token')
            if not isinstance(access, str) or 'identify' not in token.get('scope', '').split():
                raise web.HTTPUnauthorized(text='Discord 사용자 인증 권한이 필요해요.')
            user = await self.discord('GET', '/users/@me', headers={'Authorization': 'Bearer ' + access})
            user_id = user.get('id')
            if not isinstance(user_id, str) or not user_id.isdigit():
                raise web.HTTPUnauthorized()
            await self.check_member(user_id)
        session_token = secrets.token_urlsafe(32)
        self.sessions[session_token] = {'user': user_id, 'checked': self.clock(),
            'expires': self.clock() + min(3600, max(1, int(token.get('expires_in', 3600)))),
            'commands': OrderedDict(), 'last_control': -100}
        return web.json_response({'session': session_token, 'accessToken': access},
                                 headers={'Cache-Control': 'no-store'})

    async def authenticate(self, request):
        auth = request.headers.get('Authorization', '')
        session = self.sessions.get(auth.removeprefix('Bearer ')) if auth.startswith('Bearer ') else None
        if not session or session['expires'] <= self.clock():
            raise web.HTTPUnauthorized(text='인증이 만료됐어요. 화면을 다시 열어주세요.')
        if self.clock() - session['checked'] > 60:
            await self.check_member(session['user'])
            session['checked'] = self.clock()
        return session

    @staticmethod
    async def body(request):
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise ValueError()
            return body
        except (ValueError, TypeError):
            raise web.HTTPBadRequest(text='요청 형식을 확인해주세요.') from None

    async def state(self, request):
        await self.authenticate(request)
        try:
            items = await self.playback.playlist.browser_queue()
        except PlaylistError as error:
            raise web.HTTPServiceUnavailable(text=str(error)) from None
        current = self.playback.current()
        safe_current = {key: current[key] for key in ('title', 'url', 'state', 'volume')} if current else None
        return web.json_response({'current': safe_current,
            'playlistUrl': self.playback.playlist.youtube.url,
            'items': [{'number': item['number'], 'title': item['title'],
                       'url': 'https://www.youtube.com/watch?v=' + item['video_id']} for item in items]},
            headers={'Cache-Control': 'no-store'})

    async def control(self, request):
        session = await self.authenticate(request)
        body = await self.body(request)
        action, value, command_id = body.get('action'), body.get('value'), body.get('requestId')
        if (action not in ('previous', 'next', 'pause', 'play', 'volume', 'select') or
            not isinstance(command_id, str) or not 8 <= len(command_id) <= 100 or
            (action == 'volume' and (type(value) is not int or not 0 <= value <= 100)) or
            (action == 'select' and (type(value) is not int or value < 1)) or
            (action not in ('volume', 'select') and value is not None)):
            raise web.HTTPBadRequest(text='조작 요청을 확인해주세요.')
        return await self.execute(session, action, value, command_id)

    async def add(self, request):
        from .playlist import video_id
        session = await self.authenticate(request)
        body = await self.body(request)
        link, command_id = body.get('link'), body.get('requestId')
        if (not isinstance(link, str) or not 1 <= len(link) <= 2048 or
                not isinstance(command_id, str) or not 8 <= len(command_id) <= 100):
            raise web.HTTPBadRequest(text='유튜브 영상 링크를 입력해주세요.')
        try:
            canonical = 'https://www.youtube.com/watch?v=' + video_id(link)
        except PlaylistError as error:
            raise web.HTTPBadRequest(text=str(error)) from None
        return await self.execute(session, 'add', canonical, command_id)

    async def delete(self, request):
        session = await self.authenticate(request)
        body = await self.body(request)
        number, command_id = body.get('number'), body.get('requestId')
        if (type(number) is not int or number < 1 or not isinstance(command_id, str)
                or not 8 <= len(command_id) <= 100):
            raise web.HTTPBadRequest(text='삭제할 곡을 확인해주세요.')
        return await self.execute(session, 'delete', number, command_id)

    async def execute(self, session, action, value, command_id):
        commands = session['commands']
        if command_id in commands:
            entry = commands[command_id]
            if entry[:2] != (action, value):
                raise web.HTTPConflict(text='이미 사용된 요청 번호예요.')
            return web.json_response(await asyncio.shield(entry[2]))
        if self.clock() - session['last_control'] < 1:
            raise web.HTTPTooManyRequests(text='조작을 처리 중이에요. 잠시 후 다시 눌러주세요.')
        session['last_control'] = self.clock()
        future = asyncio.get_running_loop().create_future()
        commands[command_id] = (action, value, future)
        # Keep all request IDs for this session: an old relative command must never replay.
        if len(commands) > 500:
            commands.pop(command_id)
            raise web.HTTPTooManyRequests(text='조작 횟수가 많아요. 화면을 다시 열어주세요.')
        try:
            if action == 'add':
                number = await self.playback.playlist.add(value, int(session['user']))
                payload = {'ok': True, 'number': number, 'message': '재생목록에 추가했어요. 현재 음악은 계속 재생됩니다.'}
            elif action == 'delete':
                await self.playback.playlist.delete(value)
                payload = {'ok': True, 'message': '재생목록에서 삭제했어요.'}
            else:
                result = await self.playback.control(action, value)
                payload = {'ok': True, 'message': result['message']}
        except PlaylistError as error:
            payload = {'ok': False, 'message': str(error)}
        except BaseException:
            future.set_result({'ok': False, 'message': '조작 결과를 확인하지 못했어요. 현재 상태를 확인해주세요.'})
            raise
        future.set_result(payload)
        return web.json_response(payload, headers={'Cache-Control': 'no-store'})

    def app(self):
        @web.middleware
        async def errors(request, handler):
            try:
                response = await handler(request)
            except web.HTTPException as error:
                response = web.json_response({'message': error.text}, status=error.status)
            response.headers['Cache-Control'] = 'no-store'
            response.headers['X-Content-Type-Options'] = 'nosniff'
            return response
        app = web.Application(client_max_size=4096, middlewares=[errors])
        app.router.add_post('/api/session', self.create_session)
        app.router.add_get('/api/state', self.state)
        app.router.add_post('/api/control', self.control)
        app.router.add_post('/api/add', self.add)
        app.router.add_post('/api/delete', self.delete)
        return app
