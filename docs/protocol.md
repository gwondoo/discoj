# 외부 연동 규약

입력은 Discord Gateway 슬래시 명령 3개(`/추가`, `/목록`, `/삭제`)입니다. HTTP/웹 프론트는 없습니다.
모든 명령은 지정 서버·채널에서 검사하고 API 호출 전에 defer로 응답합니다.

Google OAuth: `POST https://oauth2.googleapis.com/token`, grant_type=refresh_token. 반환 access_token은 만료 60초 전까지 메모리 캐시.
YouTube: `https://www.googleapis.com/youtube/v3/playlistItems`.

- GET: part=snippet, playlistId, maxResults=50, pageToken. nextPageToken이 없을 때까지 조회.
- POST: part=snippet, body.snippet.playlistId, body.snippet.resourceId.kind=youtube#video, videoId.
- DELETE: id=재생목록 항목 ID. 클라이언트가 준 ID가 지정 목록에 속하는지 조회 후 제거.
- Authorization: Bearer access token. 타임아웃 20초.
- 401만 토큰 갱신 후 한 번 재시도. 네트워크/5xx 쓰기는 재시도하지 않음.
- quotaExceeded/dailyLimitExceeded는 태평양 시간 기준 해당 날짜의 차단 상태 저장. 권한 403과 구별.

목록은 유튜브가 기준. 로컬 메모리는 성공한 추가의 60초 중복 방지 정보를 보존합니다. 목록 조회 반영이 늦어져도 연속 중복 쓰기를 막습니다.
새 인증이 없으면 봇은 안내만 하고 API를 호출하지 않습니다.
