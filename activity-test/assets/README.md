# DJ character

The Activity's DJ booth is built from cutouts of the original photograph
(`../public/dj-original.jpeg`). The dog's facial expression is never changed;
only posture differs between poses. See [dj/README.md](dj/README.md) for how
the pose PNGs in `../public/dj/` are produced and
[POSE_REQUEST.md](POSE_REQUEST.md) for the asset request.

Confirmed shared playback picks the pose (`src/components/DjBooth.tsx`):

| Scene | Pose | Extras |
| --- | --- | --- |
| playing | `groove-left` → `idle` → `groove-right` → `idle`, swapped every 340ms | bounce, floating notes, spinning records |
| paused | `sleep` | slow breathing, Zzz |
| loading | `dig` | wiggle, records spin backwards |
| waiting | `confused` | question mark |

`console.png` is always layered in front. The two records are CSS drawn over
the console's red and blue platters, measured on the 1024 canvas. Reduced-motion
preferences stop the pose swapping and all animation.

The stage sky follows the viewer's local clock: morning (5–10), day (10–17),
evening (17–20, lamp on) and night (stars, moon, fireflies).
