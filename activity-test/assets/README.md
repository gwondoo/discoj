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

K.K. performs on a stone plaza on an island: sky, sea on the horizon, a rolling
grass hill with round trees and a few flowers, all drawn in CSS. The scene
follows the viewer's local time (morning 5–10, day 10–17, evening 17–20,
night 20–5); each time of day grades the background with a filter and K.K. and
the console with a multiply tint plus colored side light clipped to each layer,
and a contact shadow sits them on the plaza. Reduced-motion preferences stop all
animation.
