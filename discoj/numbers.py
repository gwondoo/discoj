"""Persistent monotonic labels; playlist contents remain owned by YouTube."""
import json
import os
from pathlib import Path


class TrackNumbers:
    def __init__(self, path=None):
        self.path = Path(path) if path else None
        self.next_number = 1
        self.entries = {}
        if self.path and self.path.exists():
            data = json.loads(self.path.read_text())
            self.next_number, self.entries = data['next_number'], data['entries']
            values = list(self.entries.values())
            if (type(self.next_number) is not int or self.next_number < 1
                    or any(type(n) is not int or n < 1 or n >= self.next_number for n in values)
                    or len(set(values)) != len(values)):
                raise ValueError('Invalid track number state; refusing to reuse numbers')

    def assign(self, playlist_id, items):
        entries = dict(self.entries)
        next_number = self.next_number
        for item in items:
            key = playlist_id + ':' + item['id']
            if key not in entries:
                entries[key] = next_number
                next_number += 1
        if entries != self.entries:
            if self.path:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                temp = self.path.with_suffix('.tmp')
                with temp.open('w') as output:
                    json.dump({'next_number': next_number, 'entries': entries}, output)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temp, self.path)
            self.entries, self.next_number = entries, next_number
        return [dict(item, number=entries[playlist_id + ':' + item['id']]) for item in items]

    def item_id(self, playlist_id, number):
        prefix = playlist_id + ':'
        return next((key[len(prefix):] for key, value in self.entries.items()
                     if key.startswith(prefix) and value == number), None)
