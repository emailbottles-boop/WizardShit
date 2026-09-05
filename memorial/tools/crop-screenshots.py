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
smoothness: along a row of the viewer's furniture neighbouring pixels are all
but identical, and along a row of a photograph they never are — even a night
sky carries noise. See photo_band().

Requires Pillow:  pip install Pillow
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is needed:  pip install Pillow")

# Ignore a band this short; it is a stray highlight, not a photograph.
MIN_ROWS = 200

SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".heic", ".PNG", ".JPG", ".JPEG"}


def photo_band(im):
    """Return (top, bottom) of the photograph, or None if there isn't one.

    What every viewer's furniture has in common is that it is SMOOTH: flat
    black, a flat grey, a vertical gradient, even Facebook's blurred wash
    behind a post. Along any of those rows, neighbouring pixels are all but
    identical. A photograph is never smooth like that — even a night sky
    carries sensor noise, so neighbouring pixels differ by a value or more.

    Measured on real screenshots, the mean change between neighbouring
    pixels along a row is 0.00-0.13 for furniture and 0.84 upward for the
    darkest photo rows, so 0.5 splits them with room on both sides. Text
    rows and thumbnail strips score high too, but smooth rows box them in,
    so they form short separate runs and the photo is the longest one.
    """
    rgb = im.convert("L")
    w, h = rgb.size
    px = rgb.load()
    photo = []
    for y in range(h):
        total = 0
        prev = px[0, y]
        for x in range(1, w):
            cur = px[x, y]
            total += cur - prev if cur >= prev else prev - cur
            prev = cur
        photo.append(total / (w - 1) >= 0.5)
    best = None
    y = 0
    while y < h:
        if photo[y]:
            start = y
            while y < h and photo[y]:
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
