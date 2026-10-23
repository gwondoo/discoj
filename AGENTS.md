# Agent notes

- Discord Activity UI (`activity-test/`): read [activity-test/DESIGN.md](activity-test/DESIGN.md)
  before changing screens, assets, colors or time-of-day behavior, and update it with
  your change. Time-of-day ranges live only in `skyAt()` in
  `activity-test/src/components/DjBooth.tsx` (morning 05–11, day 11–18, evening 18–21,
  night 21–05).
- Activity build: `cd activity-test && npm ci && npm run build`.
- Tests: `node tests/activity-*.test.mjs`, `.venv/bin/python -m unittest discover -s tests`.
- Character and scenery images are Nintendo assets for internal use only; never publish them.
