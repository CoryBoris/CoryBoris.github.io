"""Spatial analysis of the HTML-vs-PDF diff: where are the strong differences?"""
from PIL import Image, ImageChops

a = Image.open("/tmp/cv_pdf.png").convert("L")
b = Image.open("/tmp/cv_html.png").convert("L")
if a.size != b.size:
    b = b.resize(a.size, Image.LANCZOS)

diff = ImageChops.difference(a, b)
px = diff.load()
W, H = a.size

# Divide into a 6x8 grid and count strong (>120) pixels per cell
cols, rows = 6, 8
cw, ch = W // cols, H // rows
print("Strong (>120) pixels per grid cell:")
print("      " + " ".join("%8s" % ("c%d" % c) for c in range(cols)))
for r in range(rows):
    cells = []
    for c in range(cols):
        cnt = 0
        for y in range(r * ch, min((r + 1) * ch, H)):
            for x in range(c * cw, min((c + 1) * cw, W)):
                if px[x, y] > 120:
                    cnt += 1
        cells.append(cnt)
    print("r%d  " % r + " ".join("%8d" % n for n in cells))

# Also: are the differences concentrated on text strokes (high-freq) or
# in large flat areas?  Sample a few strong-diff pixels and report the
# local PDF luminance variance.
import statistics
samples = []
for y in range(0, H, 7):
    for x in range(0, W, 7):
        if px[x, y] > 120:
            # local 5x5 variance in PDF
            vals = []
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H:
                        vals.append(a.load()[xx, yy])
            samples.append(statistics.pvariance(vals) if len(vals) > 1 else 0)
            if len(samples) >= 2000:
                break
    if len(samples) >= 2000:
        break
print("\nLocal PDF luminance variance at %d strong-diff sample points:" % len(samples))
print("  mean=%.1f  median=%.1f  max=%.1f" % (
    statistics.mean(samples), statistics.median(samples), max(samples)))
print("  (high variance => differences are on text edges = antialiasing, not layout)")
