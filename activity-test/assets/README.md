# DJ K.K. stage

The booth uses an Animal Crossing render of DJ K.K. (`source/kk-dj.webp`,
1000×934 with transparency) for this internal Activity only. Don't publish it
outside the team. [dj/build-layers.py](dj/build-layers.py) splits it into the
layers in `../public/dj/`, all on the same canvas so they stack without offsets:

| Layer | Role |
| --- | --- |
| `kk-dog.webp` | K.K. above the console's back edge; the torso is extended downward so bobbing never shows a gap. Drawn behind the console. |
| `kk-console.webp` | The console with its level-meter LEDs dimmed (off state) |
| `kk-leds.webp` | Just the lit LEDs, flickered on the beat while playing |
| `kk-logo.webp` | White mask of the front KK logo, tinted as cyan neon in CSS |

```sh
python3 activity-test/assets/dj/build-layers.py
```

Confirmed shared playback drives the stage (`src/components/DjBooth.tsx`):

| Scene | K.K. | Stage |
| --- | --- | --- |
| playing | grooves on the beat | LEDs and neon on, records spin, beams sweep, bunting flutters, bubbles, crowd waves glowsticks |
| paused | slumps and dozes, Zzz | neon dim, lights still |
| loading | rummages | records spin backwards, LEDs blink |
| waiting | tilts, question mark | neon dim |

The sky follows the viewer's local clock: morning (5–10), day (10–17), a sunset
festival look (17–20), and a night beach party with neon beams, stars and
fireflies (20–5). The crowd is everyone connected to the Activity instance
(`getInstanceConnectedParticipants`); avatars fall back to initials if the
Discord CDN image can't load. Reduced-motion preferences stop all animation.
