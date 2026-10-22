# 재생 통신 규약

- `GET /`: 관리자 화면이 아닌 맥미니 전용 재생 페이지.
- `GET /health`: 프로세스·봇·플레이어 연결 상태. 비밀정보 없음.
- `WS /ws/player`: 동일 Origin에서 플레이어 한 대만 연결 가능. 두 번째 연결은 1008로 거부.
- 서버 → 클라이언트: `{type: "state", current, pending, session, status, connected}`.
- 클라이언트 → 서버: `{type: "event", session, event, title?}`. event는 playing/paused/buffering/blocked/ended/error.
- 10초마다 `{type: "ping"}`, 서버는 `{type: "pong"}` 반환. 30초 무응답 시 연결 해제.
- 곡마다 session 변경. 이전 session의 종료·오류 이벤트는 무시.
- disconnect 시 현재 곡 유지, offline 표시. 재연결 후 시작 버튼을 누르면 현재 곡 처음부터 재생.
- 재생 중 삭제는 다음 곡으로 전환. 재생 실패 곡은 건너뛰고, 기본 영상 실패는 무한 반복하지 않음.
- 대기열은 FIFO, 현재 포함 기본 100개(환경변수로 변경). 일일/개인 한도 없음.
- 자정 초기화 없음. 미재생곡은 유지, 재생 완료 시 제거. 프로세스 재시작 시 모두 초기화.
- 영상 제목은 실제 플레이어에서 가져옴. 재생 전에는 영상 ID 표시. Data API 호출 없음.
- 공유 프로세스에 대한 변경은 asyncio.Lock으로 직렬화. 워커/컨테이너 복제 금지.
- 서버는 기본적으로 로컬에서만 노출. Docker도 127.0.0.1에 바인딩. 외부 네트워크 공개 전 인증 설계 필요.
