# DiscoJ pose assets — original-photo cutout rig

## Claude handoff

The 8 required PNG slots are available in `activity-test/public/dj/`. No Activity HTML, CSS, JS, dependencies or running services were modified for this asset delivery.

All PNGs are 1024 × 1024 with transparent alpha and under 83KB. The dog is cut directly from `../public/dj-original.jpeg` relative to the Activity project; no generative dog image, new face or altered expression is used. Body pivot is shared at canvas (512, 700). Original glasses width is approximately 300px at this scale. Layer console.png in front of every dog image on the same canvas. Console rear edge begins approximately y=640.

| Asset | Actual implementation |
| --- | --- |
| idle.png | Original photographed expression and upright pose |
| idle-blink.png | Byte-identical to idle.png; intentionally disable blinking per user decision |
| groove-left.png | Original dog rotated -15° around the common body pivot |
| groove-right.png | Original dog rotated +15°; no mirroring, asymmetric cap stays original |
| sleep.png | Slight whole-dog bow, down 32px, 4° rotation; eyes remain open |
| dig.png | Slight whole-dog bow, down 48px, -7° rotation; does not invent or lower a paw |
| confused.png | 20° head/body tilt, unchanged original expression |
| console.png | Original console cutout; front lettering covered using cloned original blank console fabric |

These are 2D cutout poses, not independently articulated new photographs. Deep 3D head turns, closed eyes and new limb actions are intentionally not represented. The source is only 399 × 501, so the 1024 canvas is enlarged source material, not newly recovered detail.

## Visual checks

- `preview.png`: six distinct dog poses overlaid with the fixed console.
- `alignment-overlay.png`: left/right groove at 50% opacity on idle.
- Size, alpha, transparent corners, file sizes and idle/blink identity were checked.

## Rebuild

Processing uses the standard `sharp` image library; it is not added to the application dependencies. No paid API or image-generation API is involved.

```sh
npm install --prefix /tmp/discoj-asset-tools sharp --no-audit --no-fund
NODE_PATH=/tmp/discoj-asset-tools/node_modules node activity-test/assets/dj/build-poses.cjs
NODE_PATH=/tmp/discoj-asset-tools/node_modules node activity-test/assets/dj/preview.cjs
```

The image tool's earlier console draft is not used. Optional stage-2 reaction images have not been produced.

## Paw cleanup after rebuild

`groove-right.png` and `confused.png` were cleaned by hand after this script ran:
the front paw that rests on the console in the photo rotated above the console
edge, so light pixels left of the headphones (around x 330–405, y 545–665) were
made transparent. Re-running `build-poses.cjs` overwrites that fix; repeat the
cleanup or mask the paw in the script before rebuilding.
