"""Makes lighter copies of the screenshots for the PDF.

    python3 docs/user-guide/tools/optimize-images.py

The PNG screenshots in screenshots/ stay exactly as captured. For the PDF,
render-pdf.mjs uses the JPEG copies written here (build/img/), so the file is
about a third of the size while the text on every screen stays sharp
(1400 px wide at most, quality 84).
Needs the Pillow package.
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "screenshots"
OUT = ROOT / "build" / "img"
OUT.mkdir(parents=True, exist_ok=True)
MAX_W = 1400

total_in = total_out = 0
for png in sorted(SRC.glob("*.png")):
    im = Image.open(png).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    dst = OUT / (png.stem + ".jpg")
    im.save(dst, "JPEG", quality=84, subsampling=1, optimize=True)
    total_in += png.stat().st_size
    total_out += dst.stat().st_size
print(f"{len(list(OUT.glob('*.jpg')))} images: {total_in/1e6:.1f} MB PNG -> {total_out/1e6:.1f} MB JPEG")
