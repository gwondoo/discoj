# Activity API

The Activity uses the same `Playback` and in-memory playlist as the Discord
commands. The public nginx service forwards only `/api/` to port 18768.
Extension routes on port 18766 are never forwarded.

| Request | Authentication | Response |
| --- | --- | --- |
| `POST /api/session` `{code}` | Discord authorization code, `identify` scope | `{session, accessToken}` |
| `GET /api/state` | `Authorization: Bearer <session>` | `{current, items, playlistUrl}` |
| `POST /api/control` `{action, value?, requestId}` | Same session | `{ok, message}` |

`current` is null when the selected extension tab has not reported for 45
seconds. Otherwise it contains only `title`, canonical YouTube `url`, `state`
(`playing` or `paused`), and integer `volume` (0–100). Queue items contain
`number`, `title`, and canonical YouTube `url`. Refreshes use the playlist's
in-memory browser queue; only its initial load needs a YouTube read.

Supported control actions: `previous`, `next`, `play`, `pause`, `volume`.
Only `volume` accepts `value` (integer 0–100). `requestId` is a fresh random
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
