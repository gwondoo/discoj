"""YouTube playlist source of truth; no playback or local playlist cache."""
import asyncio
import time
import aiohttp
from .quota import QuotaState


class PlaylistError(ValueError):
    pass


class YouTube:
    def __init__(self, session, playlist_id, client_id, client_secret, refresh_token,
                 base_url='https://www.googleapis.com/youtube/v3',
                 token_url='https://oauth2.googleapis.com/token', quota_path=None):
        self.http = session
        self.playlist_id = playlist_id
        self.credentials = dict(client_id=client_id, client_secret=client_secret,
                                refresh_token=refresh_token, grant_type='refresh_token')
        self.base_url, self.token_url = base_url, token_url
        self.token = ''
        self.expires = 0
        self.auth_lock = asyncio.Lock()
        self.quota = QuotaState(quota_path)

    @property
    def configured(self):
        return bool(self.playlist_id and all(self.credentials.values()))

    @property
    def url(self):
        return 'https://www.youtube.com/playlist?list=' + self.playlist_id

    async def access_token(self):
        async with self.auth_lock:
            if self.token and time.monotonic() < self.expires:
                return self.token
            try:
                async with self.http.post(self.token_url, data=self.credentials) as response:
                    data = await response.json(content_type=None)
                    if response.status != 200 or not data.get('access_token'):
                        raise PlaylistError('유튜브 인증에 실패했어요. 관리자에게 Google 인증 갱신을 요청해주세요.')
                    self.token = data['access_token']
                    self.expires = time.monotonic() + max(0, int(data.get('expires_in', 3600)) - 60)
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
                if isinstance(error, PlaylistError):
                    raise
                raise PlaylistError('Google 인증 서버에 연결할 수 없어요.') from None
            return self.token

    async def request(self, method, resource, params=None, body=None):
        if not self.configured:
            raise PlaylistError('유튜브 재생목록 연동 설정이 필요해요. 관리자에게 문의해주세요.')
        if self.quota.blocked():
            raise PlaylistError(self.quota.message())
        # Only authentication failures are retried. Ambiguous write failures are not replayed.
        for attempt in range(2):
            token = await self.access_token()
            try:
                async with self.http.request(method, self.base_url + '/' + resource,
                        params=params, json=body, headers={'Authorization': 'Bearer ' + token}) as response:
                    if response.status == 204:
                        return {}
                    try:
                        data = await response.json(content_type=None)
                    except (ValueError, aiohttp.ClientError):
                        raise PlaylistError('유튜브 응답을 확인할 수 없어요. /목록 확인 후 다시 시도해주세요.') from None
                    if 200 <= response.status < 300:
                        return data
                    if response.status == 401 and attempt == 0:
                        self.token, self.expires = '', 0
                        continue
                    details = data.get('error', {}).get('errors', []) if isinstance(data, dict) else []
                    reasons = {item.get('reason') for item in details if isinstance(item, dict)}
                    if reasons & {'quotaExceeded', 'dailyLimitExceeded'}:
                        self.quota.block()
                        raise PlaylistError(self.quota.message())
                    if response.status == 404:
                        raise PlaylistError('영상 또는 재생목록 항목을 찾을 수 없어요. /목록을 다시 확인해주세요.')
                    if response.status == 403:
                        raise PlaylistError('유튜브 접근 권한이 없어요. 재생목록 소유 계정의 인증을 확인해주세요.')
                    raise PlaylistError('유튜브 요청에 실패했어요. /목록 확인 후 다시 시도해주세요.')
            except (aiohttp.ClientError, asyncio.TimeoutError):
                raise PlaylistError('유튜브 연결이 끊겼어요. 추가·삭제 결과는 /목록에서 확인해주세요.') from None

    async def items(self):
        result, page = [], None
        seen = set()
        while True:
            params = {'part': 'snippet', 'playlistId': self.playlist_id, 'maxResults': 50}
            if page:
                params['pageToken'] = page
            data = await self.request('GET', 'playlistItems', params)
            for item in data.get('items', []):
                snippet = item.get('snippet', {})
                result.append({'id': item['id'], 'title': snippet.get('title', '알 수 없는 영상'),
                               'video_id': snippet.get('resourceId', {}).get('videoId', '')})
            page = data.get('nextPageToken')
            if not page:
                return result
            if page in seen:
                raise PlaylistError('재생목록 페이지 조회에 실패했어요. 잠시 후 다시 시도해주세요.')
            seen.add(page)

    async def insert(self, video_id):
        return await self.request('POST', 'playlistItems', {'part': 'snippet'},
            {'snippet': {'playlistId': self.playlist_id,
                         'resourceId': {'kind': 'youtube#video', 'videoId': video_id}}})

    async def remove(self, item_id):
        await self.request('DELETE', 'playlistItems', {'id': item_id})
