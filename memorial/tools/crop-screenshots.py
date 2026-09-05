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
A screenshot is a tall flat-coloured canvas with the photo as a band across
the middle. Looking for bright rows quietly fails on photos taken at night —
a dim shot is darker than the white UI text above it. What separates them is
flatness: the viewer's bars are one exact colour, and a photograph's rows
never are, not even its darkest sky. See photo_band() for the two rules.

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
    """Return (top, bottom) of the photograph, or None if there isn't one.

    Two rules, tried in order.

    1. Exact-colour. A viewer's bars are a single flat colour — Facebook's is
       pure black, Instagram's stories viewer a dark grey — and the top-left
       pixel is always that colour. Any row that is 90% that exact colour is
       furniture. A photograph's darkest sky never is: its pixels vary by a
       few values, so almost none match exactly. Text rows and thumbnail
       strips dip below 90%, but they are cut off from the photo by flat
       rows on either side, so they form short separate runs and the photo
       is still the longest one.

    2. Coverage, as a fallback when the bars really are black and rule 1
       finds nothing usable: rows where under 30% of the width is non-black
       are furniture (UI rows measure 0.00-0.10, the darkest photo 0.44).
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    cols = list(range(0, w, max(1, w // 160)))
    n = len(cols)
    corner = px[0, 0]

    def longest(flags):
        best = None
        y = 0
        while y < h:
            if flags[y]:
                start = y
                while y < h and flags[y]:
                    y += 1
                if best is None or y - start > best[1] - best[0]:
                    best = (start, y)
            y += 1
        return best

    exact = [sum(1 for x in cols if px[x, y] == corner) / n for y in range(h)]
    band = longest([e < 0.9 for e in exact])
    if band and band[1] - band[0] >= MIN_ROWS:
        return band

    grey = im.convert("L")
    g = grey.load()
    lit = [sum(1 for x in cols if g[x, y] > BLACK) / n > COVER for y in range(h)]
    band = longest(lit)
    if band and band[1] - band[0] >= MIN_ROWS:
        return band
    return None


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
