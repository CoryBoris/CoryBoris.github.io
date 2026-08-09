"""Find the (dx, dy) shift that best aligns the HTML render with the PDF render."""
from PIL import Image, ImageChops

a = Image.open("/tmp/cv_pdf.png").convert("L")
b = Image.open("/tmp/cv_html.png").convert("L")
if a.size != b.size:
    b = b.resize(a.size, Image.LANCZOS)

total = a.size[0] * a.size[1]


def score(dx, dy):
    shifted = ImageChops.offset(b, dx, dy)
    diff = ImageChops.difference(a, shifted)
    hist = diff.histogram()
    return sum(hist[60:])


best = None
for dy in range(-4, 5):
    row = []
    for dx in range(-4, 5):
        s = score(dx, dy)
        row.append("%6d" % s)
        if best is None or s < best[0]:
            best = (s, dx, dy)
    print("dy=%+d  %s" % (dy, " ".join(row)))

s, dx, dy = best
print("\nbest shift: dx=%+d dy=%+d -> %d strong pixels (%.4f%%)" % (dx, dy, s, 100.0 * s / total))
print("baseline (no shift):              %d strong pixels (%.4f%%)"
      % (score(0, 0), 100.0 * score(0, 0) / total))

# Sub-pixel probe: is the residual just antialiasing?
shifted = ImageChops.offset(b, dx, dy)
diff = ImageChops.difference(a, shifted)
hist = diff.histogram()
print("\nafter best shift:")
print("  >120: %d" % sum(hist[120:]))
print("  60-120: %d" % sum(hist[60:120]))
print("  16-60: %d" % sum(hist[16:60]))
Image.blend(a.convert("RGB"), shifted.convert("RGB"), 0.5).save("/tmp/cv_aligned_blend.png")
diff.point(lambda v: min(255, v * 4)).save("/tmp/cv_aligned_diff.png")
print("\nwrote /tmp/cv_aligned_diff.png")
