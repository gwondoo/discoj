# DiscoJ Discord Activity

Current video, shared playlist, playback controls and YouTube volume for the
existing Mac mini player. Click a playlist title to play it on the selected
Mac mini YouTube tab, including when a manual video is currently playing.
Paste a YouTube video URL to add it without interrupting the current music.
Deleting songs remains in the Discord command; `/추가` still works too.

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
