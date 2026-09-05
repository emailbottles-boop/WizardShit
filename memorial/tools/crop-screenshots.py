#!/usr/bin/env python3
"""
Trim the phone and Facebook furniture off screenshots of photos.

    python3 crop-screenshots.py <folder-of-screenshots> [output-folder]

Originals are never modified; cropped copies are written to the output folder
(default: a `cropped/` folder alongside the input).

Only needed for photos you screenshotted. If you can still reach the album,
the `...` menu in Facebook's photo viewer has a Save/Download that gives you
the real full-resolution file with none of this to undo — always prefer that.

How it decides where the photo is
---------------------------------
A screenshot is a tall black canvas with the photo as a band across the
middle. The obvious approach — look for the bright rows — quietly fails on
photos taken at night: a dim indoor shot is darker than the white UI text
above it, so brightness picks the toolbar and throws the photo away.

What actually separates them is COVERAGE, not brightness. Letterbox rows are
pure black edge to edge; a UI row is black with a little text on it, so under
10% of its width is non-black. Even a very dark photograph covers more than
40%. So each row is scored by the fraction of its width that isn't black, and
the photo is the longest run of rows above that line.

Requires Pillow:  pip install Pillow
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is needed:  pip install Pillow")

# A pixel this dark counts as "black". Not 0 — video compression and screen
# dimming leave true black sitting a shade above it.
BLACK = 4
# Fraction of a row's width that must be non-black for it to be photo. Real
# rows measured on Facebook screenshots: UI <= 0.10, darkest photo 0.44.
COVER = 0.30
# Ignore a band this short; it is a stray highlight, not a photograph.
MIN_ROWS = 200

SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".heic", ".PNG", ".JPG", ".JPEG"}


def photo_band(im):
    """Return (top, bottom) of the photograph, or None if there isn't one."""
    grey = im.convert("L")
    w, h = grey.size
    px = grey.load()
    # Sample across the width rather than reading every pixel: 120 columns is
    # plenty to tell a black row from a photographic one, and it keeps this
    # fast enough to run over a few hundred screenshots.
    cols = range(0, w, max(1, w // 120))
    n = len(list(cols))

    lit = [sum(1 for x in cols if px[x, y] > BLACK) / n > COVER for y in range(h)]

    best = None
    y = 0
    while y < h:
        if lit[y]:
            start = y
            while y < h and lit[y]:
                y += 1
            if best is None or y - start > best[1] - best[0]:
                best = (start, y)
        y += 1
    if best is None or best[1] - best[0] < MIN_ROWS:
        return None
    return best


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip().split("\n\n")[1])
    src = Path(sys.argv[1])
    if not src.is_dir():
        sys.exit(f"Not a folder: {src}")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src / "cropped"
    out.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in src.iterdir() if p.suffix in SUFFIXES and p.is_file())
    if not files:
        sys.exit(f"No images found in {src}")

    done = skipped = 0
    for p in files:
        try:
            im = Image.open(p)
        except Exception as e:
            print(f"  skip  {p.name}  ({e})")
            skipped += 1
            continue
        band = photo_band(im)
        if band is None:
            # Already cropped, or not a screenshot. Leaving it alone is the
            # safe answer — better an untouched file than a mangled one.
            print(f"  skip  {p.name}  (no photo band found; already cropped?)")
            skipped += 1
            continue
        top, bottom = band
        if top == 0 and bottom == im.height:
            print(f"  skip  {p.name}  (nothing to trim)")
            skipped += 1
            continue
        crop = im.crop((0, top, im.width, bottom)).convert("RGB")
        target = out / (p.stem + ".jpg")
        crop.save(target, "JPEG", quality=92)
        print(f"  crop  {p.name}  {im.width}x{im.height} -> {crop.width}x{crop.height}")
        done += 1

    print(f"\n{done} cropped, {skipped} left alone. Written to: {out}")
    if done:
        print("Originals were not touched.")


if __name__ == "__main__":
    main()
