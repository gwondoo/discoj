"""Split assets/source/kk-dj.webp into the booth layers in public/dj/.

The source is Nookipedia's 2480x2320 "K.K. Slider DJ NL" render. It is scaled to
WIDTH and every layer shares that canvas, so they stack without offsets.

  kk-dog.webp      K.K. above the console's back edge, with the body extended
                   downward so it never shows a gap while bobbing behind it
  kk-console.webp  the console with its level-meter LEDs dimmed (the "off" state)
  kk-leds.webp     only the lit LEDs, faded in and out while music plays
  kk-logo.webp     white mask of the front "KK" logo, tinted as neon in CSS

Run: python3 activity/assets/dj/build-layers.py  (needs Pillow)
"""
import colorsys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/source/kk-dj.webp'
OUT = ROOT / 'public/dj'

WIDTH = 1400
# Measurements below are in a 1000x934 reference frame and scale to WIDTH.
REF = (1000, 934)

# Console back edge (first console row) where K.K. stands behind it, measured per column.
EDGE = [(340, 401), (360, 414), (380, 415), (400, 412), (420, 412), (440, 414), (460, 416),
        (480, 419), (500, 428), (520, 431), (540, 434), (560, 436), (580, 439), (600, 442),
        (620, 445), (640, 447), (660, 451), (680, 453), (700, 455), (720, 452), (740, 454), (760, 457)]
BODY = (480, 760)  # columns whose bottom edge is torso (extended), not the resting paw
SKIRT = 48
LEDS = (430, 425, 700, 500)
LOGO = (230, 530, 540, 830)


def edge(x, kx, ky):
    x /= kx
    if x < EDGE[0][0] or x > EDGE[-1][0]:
        return None
    for (x0, y0), (x1, y1) in zip(EDGE, EDGE[1:]):
        if x0 <= x <= x1:
            return round((y0 + (y1 - y0) * (x - x0) / (x1 - x0)) * ky)


def scale_box(box, kx, ky):
    x0, y0, x1, y1 = box
    return round(x0 * kx), round(y0 * ky), round(x1 * kx), round(y1 * ky)


def is_led(r, g, b, loose=False):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    floor = .3 if loose else .55
    return s > floor and v > floor and h < .4


def main():
    src = Image.open(SOURCE).convert('RGBA')
    src = src.resize((WIDTH, round(WIDTH * src.height / src.width)), Image.LANCZOS)
    w, h = src.size
    kx, ky = w / REF[0], h / REF[1]
    lip, probe, seam = round(8 * ky), round(10 * ky), round(3 * ky)
    px = src.load()
    dog = Image.new('RGBA', src.size)
    console = src.copy()
    leds = Image.new('RGBA', src.size)
    logo = Image.new('RGBA', src.size)
    dp, cp, lp, gp = dog.load(), console.load(), leds.load(), logo.load()

    for x in range(w):
        cut = edge(x, kx, ky)
        if cut is None:
            continue
        for y in range(cut):
            # Near the edge, only pixels hanging from fur above belong to K.K.; the
            # console's bright back lip (with only background above it) stays put.
            if y >= cut - lip:
                r, g, b, a = px[x, y - probe]
                if a < 250 or (r + g + b) / 3 < 150:
                    continue
            dp[x, y] = px[x, y]
            cp[x, y] = (0, 0, 0, 0)
        # Extend the torso: repeat a row just above the edge into the hidden area.
        if BODY[0] * kx <= x <= BODY[1] * kx and px[x, cut - seam][3] > 200:
            for y in range(cut, min(h, cut + round(SKIRT * ky))):
                dp[x, y] = px[x, cut - seam]

    x0, y0, x1, y1 = scale_box(LEDS, kx, ky)
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a > 200 and is_led(r, g, b, loose=True):
                lp[x, y] = (r, g, b, 255) if is_led(r, g, b) else (r, g, b, 150)
                grey = int((r + g + b) / 3 * .35)
                cp[x, y] = (grey, grey, grey + 6, a)

    x0, y0, x1, y1 = scale_box(LOGO, kx, ky)
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            light = (r + g + b) / 3
            if a > 200 and light > 120 and abs(r - b) < 40:
                gp[x, y] = (255, 255, 255, min(255, int((light - 120) * 4)))

    OUT.mkdir(parents=True, exist_ok=True)
    for name, image in [('kk-dog', dog), ('kk-console', console), ('kk-leds', leds), ('kk-logo', logo)]:
        image.save(OUT / f'{name}.webp', 'WEBP', quality=90, method=6)
        print(name, (OUT / f'{name}.webp').stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
