"""Probe the PDF's own layout - the most reliable source of truth for an exact HTML replica."""
import os

import fitz

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(REPO, "assets", "Cory Boris Curriculum Vitae.pdf")

doc = fitz.open(PDF)
page = doc[0]
print("page: %.2f x %.2f pt" % (page.rect.width, page.rect.height))

data = page.get_text("dict")
span_count = 0
min_x = 1e9
max_x = -1e9
min_y = 1e9
max_y = -1e9
fonts = {}

print("\n=== SPANS (first 40) ===")
for block in data["blocks"]:
    if block["type"] != 0:
        continue
    for line in block["lines"]:
        for span in line["spans"]:
            span_count += 1
            x0, y0, x1, y1 = span["bbox"]
            min_x = min(min_x, x0); max_x = max(max_x, x1)
            min_y = min(min_y, y0); max_y = max(max_y, y1)
            fonts[span["font"]] = fonts.get(span["font"], 0) + 1
            if span_count <= 40:
                print("  x=%6.2f y=%6.2f sz=%5.2f %-32s dir=%s %r"
                      % (x0, y0, span["size"], span["font"],
                         line.get("dir"), span["text"][:44]))

print("\ntotal spans: %d" % span_count)
print("text bbox: x %.2f..%.2f  y %.2f..%.2f pt" % (min_x, max_x, min_y, max_y))
print("implied margins: left %.4fin  right %.4fin  top %.4fin  bottom %.4fin"
      % (min_x / 72.0, (page.rect.width - max_x) / 72.0,
         min_y / 72.0, (page.rect.height - max_y) / 72.0))
print("\nfont usage: %s" % sorted(fonts.items(), key=lambda kv: -kv[1]))

print("\n=== VECTOR DRAWINGS (section rules) ===")
rules = 0
for d in page.get_drawings():
    r = d["rect"]
    # Section underlines are wide and very short
    if r.width > 100 and r.height < 4:
        rules += 1
        print("  rule x=%.2f..%.2f y=%.2f h=%.2f  color=%s fill=%s width=%s"
              % (r.x0, r.x1, r.y0, r.height, d.get("color"), d.get("fill"), d.get("width")))
print("  wide/short rules found: %d (expected 4 section underlines)" % rules)

print("\n=== LINKS ===")
for link in page.get_links():
    if link.get("uri"):
        r = link["from"]
        print("  %-52s x=%.2f..%.2f y=%.2f..%.2f" % (link["uri"][:50], r.x0, r.x1, r.y0, r.y1))
