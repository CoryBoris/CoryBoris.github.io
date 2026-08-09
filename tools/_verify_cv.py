"""Screenshot cv-content.html in headless Chrome and diff it against the real PDF."""
import os
import subprocess
import sys

import fitz
from PIL import Image, ImageChops

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(REPO, "assets", "Cory Boris Curriculum Vitae.pdf")
HTML = os.path.join(REPO, "cv-content.html")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

DPI = 120
SCALE = DPI / 72.0
W = int(round(612 * SCALE))
H = int(round(792 * SCALE))

shot = "/tmp/cv_html.png"
ref = "/tmp/cv_pdf.png"
diff_out = "/tmp/cv_diff.png"

# 1. Reference render straight from the PDF.
page = fitz.open(PDF)[0]
page.get_pixmap(dpi=DPI, colorspace=fitz.csRGB).save(ref)

# 2. Headless Chrome render of the generated HTML. Served over http:// because
#    file:// blocks the webfont load in some Chrome versions.
if os.path.exists(shot):
    os.remove(shot)
url = "http://127.0.0.1:8001/cv-content.html"
proc = subprocess.run([
    CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--virtual-time-budget=6000",
    "--window-size=%d,%d" % (W, H),
    "--screenshot=" + shot,
    url,
], capture_output=True, text=True, timeout=120)
if not os.path.exists(shot):
    print(proc.stdout[-2000:]); print(proc.stderr[-2000:])
    sys.exit("chrome produced no screenshot (is simpleserver.py running on :8001?)")

a = Image.open(ref).convert("RGB")
b = Image.open(shot).convert("RGB")
print("pdf render : %dx%d" % a.size)
print("html render: %dx%d" % b.size)
if a.size != b.size:
    b = b.resize(a.size, Image.LANCZOS)
    print("resized html render to match")

diff = ImageChops.difference(a, b).convert("L")
bbox = diff.getbbox()
hist = diff.histogram()
total = a.size[0] * a.size[1]

# Anti-aliasing always differs slightly; count only clearly-wrong pixels.
strong = sum(hist[60:])
faint = sum(hist[16:60])
print("\npixels differing strongly (>60/255): %d  (%.4f%%)" % (strong, 100.0 * strong / total))
print("pixels differing faintly (16-60):    %d  (%.4f%%)" % (faint, 100.0 * faint / total))
print("difference bbox: %s" % (bbox,))

# Side-by-side plus amplified diff for eyeballing.
amp = diff.point(lambda v: min(255, v * 4))
canvas = Image.new("RGB", (a.size[0] * 3 + 20, a.size[1]), "white")
canvas.paste(a, (0, 0))
canvas.paste(b, (a.size[0] + 10, 0))
canvas.paste(amp.convert("RGB"), (a.size[0] * 2 + 20, 0))
canvas.save(diff_out)
print("\nwrote %s  (left: PDF, middle: HTML, right: amplified diff)" % diff_out)
