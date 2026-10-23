# DJ K.K. stage

The booth uses the official Animal Crossing render of DJ K.K. ("K.K. Slider DJ
NL", 2480×2320 with transparency, from Nookipedia), stored losslessly as
`source/kk-dj.webp`, for this internal Activity only. Don't publish it outside
the team. [dj/build-layers.py](dj/build-layers.py) scales it to 1400px wide and
splits it into the layers in `../public/dj/`, all on the same canvas so they
stack without offsets:

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
| playing | grooves on the beat | LEDs and neon logo on, records spin, notes and bubbles |
| paused | slumps and dozes, Zzz | neon dim |
| loading | rummages | records spin backwards, LEDs blink |
| waiting | tilts, question mark | neon dim |

K.K. is framed close on an island: sky, sea on the horizon, a rolling grass hill
with round trees and a few flowers, all drawn in CSS. The booth is sized by the
stage height so the console's base runs off the bottom edge. The scene
follows the viewer's local time on office-friendly ranges (morning 5–11, day
11–18, evening 18–21, night 21–5); each time of day grades the background with a filter and K.K. and
the console with a multiply tint plus colored side light clipped to each layer. At night K.K. is dimmed to the
scene's level while the neon logo and LEDs stay bright. Reduced-motion preferences stop all
animation.
