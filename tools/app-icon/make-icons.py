import sys, os
# Regenerate: python tools/app-icon/make-icons.py tools/app-icon/logo-tile.png src/assets/icons
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
tile = Image.open(src).convert("RGBA")
tile = tile.crop(tile.getbbox())
tw, th = tile.size

def render(size, width_frac):
    # Full-bleed opaque square: black fill matches the tile interior, so the OS mask (iOS squircle / Android shape) cuts only background.
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    w = round(size * width_frac); h = round(th * w / tw)
    t = tile.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(t, ((size - w) // 2, (size - h) // 2))
    return canvas.convert("RGB")

for s in [72, 96, 128, 144, 152, 167, 180, 192, 384, 512]:
    render(s, 0.84).save(os.path.join(out, f"icon-{s}x{s}.png"), optimize=True)
# Maskable: whole tile inside the 80% safe-zone circle.
diag = (tw**2 + th**2) ** 0.5
for s in [192, 512]:
    render(s, 0.80 * tw / diag).save(os.path.join(out, f"icon-{s}x{s}-maskable.png"), optimize=True)
