"""Trim the Nookipedia scenery icons in assets/source/scene/ into public/scene/.

Each icon is cropped to its visible pixels so CSS can place it by its base.
Run: python3 activity-test/assets/dj/build-scene.py  (needs Pillow)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/source/scene'
OUT = ROOT / 'public/scene'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for path in sorted(SOURCE.glob('*.png')):
        image = Image.open(path).convert('RGBA')
        image = image.crop(image.getchannel('A').getbbox())
        image.save(OUT / f'{path.stem}.webp', 'WEBP', quality=92, method=6)
        print(path.stem, image.size)


if __name__ == '__main__':
    main()
