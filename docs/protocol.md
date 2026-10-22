# 외부 연동 규약

입력은 Discord Gateway 슬래시 명령 4개(`/추가`, `/목록`, `/삭제`, `/현재곡`)입니다. 현재곡 연결용 로컬 HTTP 수신만 있고 웹 프론트는 없습니다.
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

삭제는 번호 또는 제목 자동완성으로 선택 후 비공개 확인 버튼으로 실행합니다. 자동완성 후보는 30초 캐시하며 삭제 확인과 실행 시 실제 목록을 조회합니다. 목록 새로고침은 같은 메시지를 갱신합니다. 한도 초과 시 다음 태평양 자정 시각을 JSON 파일에 저장하여 재시작 후에도 차단하고 초기화 시각 이후 요청을 재개합니다.

`/현재곡`은 선택된 브라우저 탭의 최신 영상 정보를 비공개로 표시합니다. 브라우저 확장은 인증된 `POST /playback`으로 `{state, title, videoId}`를 전달합니다. 수신 포트는 호스트의 127.0.0.1:18766에만 게시하고, CORS를 허용하지 않습니다. 45초 만료 후에는 과거 정보를 표시하지 않습니다.

인증된 `GET /queue`는 공용 목록 ID·항목·revision을 반환합니다. 봇이 확인한 목록과 추가·삭제 성공 결과를 메모리에서 전달하며 초기 1회 외에는 브라우저 확인 자체로 YouTube API를 호출하지 않습니다. 확장은 선택된 탭에만 전달하고 재생 중 DOM 목록을 갱신합니다.

`/컨트롤`은 비공개 패널을 표시합니다. 인증된 `GET /control?session=…`은 해당 브라우저 세션의 만료 전 조작 요청을 한 번만 전달하며, `POST /control/ack`의 일치하는 요청 ID·세션 응답으로 처리 결과를 확인합니다. 조작은 12초 후 만료하며 다른 세션으로 재전달하지 않습니다. 음량 정보(0~100%)도 현재 재생 상태와 함께 메모리에 보관합니다.
