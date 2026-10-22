"""Persist only the next Pacific midnight after an observed quota error."""
import json
import os
from pathlib import Path
from datetime import datetime, timedelta, time, timezone
from zoneinfo import ZoneInfo


class QuotaState:
    def __init__(self, path=None, now=None):
        self.path = Path(path) if path else None
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.until = None
        if self.path and self.path.exists():
            value = json.loads(self.path.read_text()).get('blocked_until')
            if value:
                self.until = datetime.fromisoformat(value)
                if self.until.tzinfo is None:
                    raise ValueError('Quota expiry must include a timezone')

    def save(self):
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temp = self.path.with_suffix('.tmp')
            with temp.open('w') as output:
                json.dump({'blocked_until': self.until.isoformat() if self.until else None}, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temp, self.path)

    def block(self):
        zone = ZoneInfo('America/Los_Angeles')
        tomorrow = self.now().astimezone(zone).date() + timedelta(days=1)
        self.until = datetime.combine(tomorrow, time.min, tzinfo=zone)
        self.save()

    def blocked(self):
        if self.until is not None and self.now() >= self.until:
            self.until = None
            self.save()
        return self.until is not None

    def message(self):
        local = self.until.astimezone(ZoneInfo('Asia/Seoul'))
        return f'유튜브 일일 API 한도를 소진했어요. 한국 시간 {local:%m/%d %H:%M} 이후 자동으로 해제돼요.'
