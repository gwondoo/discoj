# Agent notes

- Discord Activity UI (`activity/`): read [activity/DESIGN.md](activity/DESIGN.md)
  before changing screens, assets, colors or time-of-day behavior, and update it with
  your change. Time-of-day ranges live only in `skyAt()` in
  `activity/src/components/DjBooth.tsx` (morning 09–11, day 11–14, evening 14–16,
  night 16–09).
- Activity build: `cd activity && npm ci && npm run build`.
- Tests: `node tests/activity-*.test.mjs`, `.venv/bin/python -m unittest discover -s tests`.
- Character and scenery images are Nintendo assets for internal use only; never publish them.
