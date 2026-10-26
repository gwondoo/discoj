# Activity API

The Activity uses the same `Playback` and in-memory playlist as the Discord
commands. The public nginx service forwards only `/api/` to port 18768.
Extension routes on port 18766 are never forwarded.

| Request | Authentication | Response |
| --- | --- | --- |
| `POST /api/session` `{code}` | Discord authorization code, `identify` scope | `{session, accessToken}` |
| `GET /api/state` | `Authorization: Bearer <session>` | `{current, items, playlistUrl}` |
| `POST /api/control` `{action, value?, requestId}` | Same session | `{ok, message}` |
| `POST /api/add` `{link, requestId}` | Same session | `{ok, message, number?}` |

`current` is null when the selected extension tab has not reported for 45
seconds. Otherwise it contains only `title`, canonical YouTube `url`, `state`
(`playing` or `paused`), and integer `volume` (0–100). Queue items contain
`number`, `title`, and canonical YouTube `url`. Refreshes use the playlist's
in-memory browser queue; only its initial load needs a YouTube read.

Supported control actions: `previous`, `next`, `play`, `pause`, `volume`, `select`.
`volume` accepts `value` (integer 0–100); `select` accepts a positive stable track
number. The server resolves it from the memory queue to a video ID, then the
extension fetches a fresh snapshot and validates the item still exists before
navigating. Selection works even when the current video is outside the playlist.
The new video opens with the public playlist ID, enabling normal sequencing and
whole-playlist repeat. The result acknowledges the navigation request; playback
reports determine the displayed current title/state.

`/api/add` accepts only YouTube video URLs. It shares the existing Discord add
command's validation, duplicate prevention, capacity and quota handling. It never
calls playback controls or changes the current tab. Adds use YouTube API quota;
selection uses the memory queue and extension. The same request ID does not
repeat an add, including after an ambiguous result. Check the list before
submitting a new request after a timeout.

`requestId` is a fresh random
UUID. The same ID and payload returns its original result without repeating
the browser command, including failures. Never retry a timed-out relative
command with a new ID. Commands are serialized with the existing Discord
control panel. A disconnected tab or missing acknowledgement produces
`{ok:false,message}`. Acknowledgements have the existing 12-second deadline.

The server exchanges codes with Discord using its private client secret,
fetches the authenticated user, and checks membership and channel visibility
for the configured guild/channel. Excluded users are rejected. Permissions
are rechecked at most 60 seconds apart. App tokens and tab session IDs are
not accepted as Activity sessions. Session tokens stay in browser memory,
expire after at most one hour, and disappear on server restart. Reopen or
reconnect the Activity to authenticate again. The OAuth access token is
returned once for the SDK authenticate call; it is not used for control API
requests or stored by the server.

Errors use JSON `{message}`: 400 invalid input, 401 expired/invalid auth,
403 no channel access, 409 reused ID with different content, 429 excessive
requests, 503 Discord/bot/playlist unavailable. Responses are `no-store`;
there is no cross-origin CORS access or cookie authentication.

`POST /api/delete` takes `{number, requestId}` with the same authenticated
session. It uses the stable positive track number, never a displayed row
position. The Activity hides numbers and shows a title confirmation dialog
before submitting. Cancel/Escape makes no delete request. A refresh while the
dialog is open cannot retarget it to another song. Everyone with channel access
can delete, matching `/삭제`. The existing playlist delete path enforces quota,
removes the item from the shared memory queue, and preserves current playback.
Duplicate request IDs return the original result without repeating the write.

### GET /api/playback-events

기존 Activity Bearer 세션으로 인증하는 NDJSON 스트림입니다. 연결 직후와 공개 재생 상태 변경 시에만 `{current, observedAt}`를 보내며 `current`는 `/api/state`와 동일한 공개 재생 정보입니다. `observedAt`은 서버의 단조 증가 밀리초 값이며, 클라이언트는 이전 상태가 최신 재생 상태를 덮어쓰지 않도록 비교합니다. `/api/state`도 같은 필드를 제공합니다. 변경이 없으면 15초마다 `{heartbeat:true}`를 보냅니다. 약 55초마다 연결을 마치므로 클라이언트가 재접속해야 하며 재접속 시 세션·멤버 권한을 확인합니다. 이 경로는 재생목록 조회나 YouTube API를 호출하지 않습니다.

스트림 연결이 정상일 때 목록 갱신은 `GET /api/state?queueOnly=1`을 사용해 `current`와 `observedAt`을 중복 전송하지 않습니다. 스트림이 끊기면 전체 상태 조회로 복구합니다. 서버는 250ms 간격으로 메모리의 공개 상태만 비교하며, 브라우저의 동일 상태 보고는 변경 이벤트로 보내지 않습니다.

Activity sessions last up to 8 hours, capped by the Discord access token lifetime. Channel membership is rechecked every 60 seconds when used. Sessions remain in memory, so restarting the bot invalidates existing sessions.

### Repeat mode
`current.repeatMode` is `all` (default) or `one`, reported by the selected extension tab and shared by state and playback events. `POST /api/control` accepts `{action:"repeat",value:"all"|"one",requestId}`. The extension persists the confirmed mode locally and applies the media loop flag without seeking, playing, pausing, or navigating. Manual next/previous/select remain unchanged. No YouTube Data API calls are made.
