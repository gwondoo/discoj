# DiscoJ · 디스코제이

Discord에서 실제 공용 YouTube 재생목록을 관리하는 사내용 봇입니다.
Python + discord.py를 사용하며 프론트엔드, HTTP 서버, WebSocket, 재생 대기열은 없습니다.
음악은 맥미니의 YouTube 재생목록 페이지에서 직접 재생합니다.
자동 폴백, 현재 재생곡 감지, 봇 재생 상태 표시는 제공하지 않습니다.

## 명령어

| 명령어 | 기능 |
| --- | --- |
| `/추가 링크` | 유튜브 영상 하나를 목록에 추가. 실제 목록 조회 후 중복 검사 |
| `/목록 페이지` | 실제 목록을 조회하여 10곡씩 표시. 영상 제목·링크·삭제용 항목 ID 제공 |
| `/삭제 항목id` | 영상 자체가 아닌 재생목록의 항목만 제거 |

- Petasona 서버 `1526382640230432858`의 `#디스코제이` 채널 `1560519100021608598`에서만 실행합니다.
- 개인 제한은 없습니다. 현재 목록 최대 90곡을 기본값으로 사용하며 `MAX_PLAYLIST_SIZE`로 변경할 수 있습니다.
- 90곡은 **현재 곡 수 제한**이며 일일 추가 횟수나 API 할당량 보장은 아닙니다. 반복 추가·삭제도 할당량을 소비합니다.
- 자동 일일 삭제/초기화는 하지 않습니다. 관리자가 필요할 때 정리합니다.
- 추가·조회·삭제는 하나의 asyncio.Lock에서 순차 처리하며 목록 캐시는 유지하지 않습니다. YouTube 조회 반영 지연에 대비해 방금 성공한 추가 항목은 60초 동안 기억하여 연속 중복을 막습니다.
- 추천자 ID만 메모리에 저장합니다. 재시작 후 기존 곡이나 유튜브에서 직접 추가한 곡은 **관리자만 삭제 가능**합니다.
- 번호는 삭제 후 바뀌므로 `/삭제`는 `/목록`이 알려주는 **재생목록 항목 ID**를 사용합니다. 영상 ID와 다릅니다.
- 유튜브에서 사람이 동시에 편집하는 것까지 원자적으로 처리할 수는 없습니다. 봇 전용 목록 사용을 권장합니다.
- API 한도 초과를 감지하면 태평양 시간 날짜가 바뀔 때까지 추가 호출을 차단합니다. 재시작 시 차단 상태도 초기화됩니다.
- 통신 실패 후 쓰기 요청은 자동 재시도하지 않습니다. 성공 여부가 불확실하면 `/목록`으로 확인하세요.
- 예전 `/현재곡`, `/내추천`, `/도움말`은 시작 시 지정 서버의 명령어 동기화에서 제거됩니다.

## 실행

Python 3.9 이상, Docker에서는 3.12 사용.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 기존 .env가 있다면 덮어쓰지 말고 새 항목만 추가
python -m discoj.main
```

필수 설정: `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_ID`.
유튜브 설정이 비어 있어도 봇은 연결되지만 명령어는 연동 설정 필요 안내를 반환합니다.
`EXCLUDED_USER_IDS`에는 lab4dx의 숫자 사용자 ID를 지정하세요.
토큰·클라이언트 시크릿·리프레시 토큰은 `.env`에만 저장하고 커밋하지 마세요.
기존 `PLAYER_ORIGIN`, `FALLBACK_VIDEO_ID`, `MAX_QUEUE_SIZE`는 더 이상 사용하지 않습니다.

## YouTube 인증 (운영 전 필수)

1. 관리용 Google 계정으로 전용 YouTube 재생목록을 만듭니다. 다른 직원도 열 수 있도록 공개 범위를 선택합니다.
2. Google Cloud 프로젝트에서 YouTube Data API v3를 활성화합니다.
3. Google Auth Platform 동의 화면과 **데스크톱 앱 OAuth 클라이언트**를 만듭니다.
4. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_PLAYLIST_ID`를 `.env`에 넣습니다.
5. 아래 인증 도구를 설치하고 실행합니다. 재생목록 소유 계정으로 `youtube` 스코프 권한을 승인합니다.

```sh
pip install -r requirements-auth.txt
python -m discoj.authorize
```

도구는 토큰을 출력하지 않고 `.env`의 `GOOGLE_REFRESH_TOKEN`에 저장합니다. 로컬 콜백 포트는 자동 선택합니다.
Google 앱이 External/Testing이면 YouTube 권한의 리프레시 토큰은 일반적으로 7일 후 만료될 수 있습니다. 장기 운영은 브랜딩 문서 링크 설정 → 프로덕션 게시 → 위 인증 도구로 재인증 순서로 구성하세요. 프로덕션 전환은 Google 검증 심사와 별개이며 토큰 철회 등 다른 만료 사유는 남습니다.

현재 운영 프로젝트는 프로덕션 전환과 재인증을 완료했습니다(2026-10-22). 공개 안내 문서는 [서비스 소개](docs/index.md), [개인정보처리방침](docs/privacy.md), [이용 안내](docs/terms.md)에 있습니다.

[Google OAuth 문서](https://developers.google.com/identity/protocols/oauth2/native-app)
[YouTube 재생목록 관리 API](https://developers.google.com/youtube/data/guides/implementation/playlists)

## Discord 권한

`bot`, `applications.commands` 스코프와 채널 보기·메시지 보내기·링크 임베드 권한이 필요합니다.
이전 재생 현황 메시지를 갱신하려면 메시지 기록 보기, 고정 해제에는 메시지 고정 권한이 필요합니다.
특권 인텐트는 필요 없습니다. 봇 시작 시 기존 재생 현황 메시지를 안내문으로 바꾸고 고정을 해제합니다.

## Docker

```sh
docker compose up -d --build
```

서버 포트는 열지 않습니다. 메모리 추천자 정보를 공유하도록 컨테이너는 하나만 실행하세요.

## 검증

```sh
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

테스트는 공식 응답 구조를 바탕으로 만든 로컬 상태 유지 HTTP 모의 Google/YouTube 서버를 사용합니다.
실제 HTTP 클라이언트·페이지네이션·OAuth 토큰 캐시·동시 중복 방지·삭제 권한·할당량 차단을 검증하며 실제 Google 권한 검증을 대체하지 않습니다.
Postman CLI가 이 환경에 없어 로컬 aiohttp 테스트 서버를 사용합니다.
실제 추가·삭제는 Google 인증 후 별도 확인이 필요합니다.
