# DiscoJ Discord Activity

A DJ K.K. festival stage for the existing Mac mini player: current video, shared
playlist ("레코드 상자"), playback controls and YouTube volume. Built with
Vite, React and TypeScript (`src/`); DJ K.K. and the stage react to the
confirmed shared playback state on an island stage
(see [assets/README.md](assets/README.md)). Planning and design rules, including the
time-of-day ranges, are in [DESIGN.md](DESIGN.md).
The look is an Animal Crossing-style island theme drawn entirely in CSS with
bundled free fonts (Jua, Gowun Dodum); no game assets or external requests. Click a playlist title to play it on the selected
Mac mini YouTube tab, including when a manual video is currently playing.
Paste a YouTube video URL to add it without interrupting the current music.
Volume applies when the fader is released.
Each row has a delete button with a title confirmation and delete/cancel actions.
Activity rows hide stable track numbers; `/추가` and `/삭제` still work too.

## Build and run

```sh
cd activity-test
npm ci
npm run build
cd ..
docker compose up -d --build
docker compose -f compose.activity-test.yaml up -d
docker compose -f compose.activity-test.yaml logs tunnel
```

Add `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` to the root `.env`.
Never place secrets in Vite environment variables or this static directory.
Configure an OAuth2 redirect URI (`https://127.0.0.1`, as recommended for an
SDK-only Activity) in Developer Portal. The SDK handles the actual return.

Set Activity URL Mapping prefix `/` to the tunnel's generated hostname and
enable Activities. Launch from Discord App Launcher → 디스코제이 → 실행.
Authorize the basic Discord profile permission. Only members with access to
the configured channel can use the API. See [API contract](../docs/activity-api.md).

Local page: http://127.0.0.1:18767/ (Discord authentication requires Activity).

For UI work without Discord, run `npm run dev` and open `/?preview`
(also `?preview=paused`, `=loading`, `=waiting`; add `&sky=night` etc.,
`&crowd=0..7` for the listener count, `&toast` or `&error`) to render sample data.
Preview mode exists only in the dev server and never calls the API.
The static gateway proxies `/api/` to the separate authenticated port 18768.
It never forwards the extension bridge or its private bearer token.

The tunnel hostname is temporary and may change when recreated. Use a stable
hostname before ongoing operation. Remove its Discord mapping before stopping
or discarding the tunnel.

```sh
docker compose -f compose.activity-test.yaml down
```

## Verification

```sh
.venv/bin/python -m unittest discover -s tests
node tests/extension.test.cjs
node tests/extension-background.test.cjs
node tests/extension-popup.test.cjs
```

The Activity tests exercise code exchange and identity lookup over HTTP using
an aiohttp stand-in for the Discord endpoints. They cover access denial,
Discord outage, session expiry, disconnected playback, private fields and
idempotent control submission. A real Activity launch is still required to
verify Discord consent and SDK authentication.

## Mobile Discord

Activity Settings → Supported Platforms must include iOS and Android as well
as Web. Keep phone/tablet orientation unlocked. The same authenticated API
controls the Mac mini player; the phone does not need the browser extension.
Touch devices use larger buttons/slider hit areas and safe-area padding.
Unverified Activity tester/developer access restrictions still apply.
Real iOS/Android launch and consent need checking on a physical phone.

## Desktop Activity sizes

Discord's `platform=desktop` enables desktop-only responsive layouts. Mobile
keeps its existing styles; a coarse-pointer fallback is used only when the
platform query is absent (for standalone previews).

- Expanded: player and crate fit the window; the crate scrolls within its card.
- Chat alongside Activity: the stage shrinks with the available height; routine
  dialogue is hidden so track controls and volume stay visible.
- Short popup: stage left, track and controls right, crate below.
- Mini: compact stage, current title, previous/play-pause/next and volume. The
  crate and topbar are hidden; errors and reauthentication remain accessible.

Verified preview sizes: 1280×800, 1000×600, 1000×480, 760×430, 600×360,
500×500, 320×180 and 320×160. Mobile 390×844 retains the previous positions.
Actual Discord chat-alongside and mini containers were also checked after build.

Playback connectivity has a 30-second freshness window. Confirmed full-state
responses and stream messages/heartbeats renew it; queue-only responses do not.
A single failed read or stream reconnect preserves recently verified playback,
while stale playback disables controls. Authentication/permission failures bypass
the grace period and require reconnecting immediately.

```sh
node tests/activity-connection.test.mjs
node tests/activity-connection-integration.test.mjs
```
