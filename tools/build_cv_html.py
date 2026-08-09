#!/usr/bin/env python3
"""
Generate cv-content.html - an exact HTML replica of the CV PDF.

Approach
--------
Rather than hand-authoring flowing HTML and hoping the browser breaks lines the
same way Word did, this reuses the PDF's own layout. Word already decided where
every word sits; we read those decisions straight out of the PDF and replay
them, so the result matches by construction.

The page is emitted as inline SVG with a viewBox in PDF points:

  * <text y> in SVG *is* the alphabetic baseline, so there is no line-height,
    half-leading or browser-specific baseline maths to get wrong - the usual
    failure mode when absolutely positioning HTML spans.
  * textLength pins each run to the exact width it occupies in the PDF, so even
    if a device substitutes a different serif the line cannot drift.
  * The viewBox makes the whole document scale to any width while keeping true
    8.5x11 proportions, which is what makes it work on a phone.
  * Text stays real text (selectable, searchable) and links stay real links.

Run this whenever the CV changes:  python3 tools/build_cv_html.py
"""

import html
import os

import fitz

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(REPO, "assets", "Cory Boris Curriculum Vitae.pdf")
OUT = os.path.join(REPO, "cv-content.html")

# PDF font name -> (css weight, css style). Everything Times-ish maps onto Tinos,
# which is metrically identical to Times New Roman (see tools/build_cv_fonts.py).
FONT_MAP = {
    "TimesNewRomanPSMT": ("400", "normal"),
    "TimesNewRomanPS-BoldMT": ("700", "normal"),
    "TimesNewRomanPS-ItalicMT": ("400", "italic"),
    "TimesNewRomanPS-BoldItalicMT": ("700", "italic"),
}

# Word writes list bullets in SymbolMT; render them as a real bullet character.
BULLET_FONTS = {"SymbolMT"}


def css_color(value):
    if value is None:
        return "#000000"
    return "#%06X" % (value & 0xFFFFFF)


def collect(page):
    """Pull every visible text run, with its baseline origin and exact width."""
    runs = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                text = span["text"]
                # Whitespace-only runs (Word emits them in Calibri/Arial/Sylfaen)
                # paint nothing - dropping them keeps the output clean.
                if not text.strip():
                    continue

                base_font = span["font"].split("+")[-1]
                if base_font in BULLET_FONTS:
                    text = "\u2022"
                    weight, style = "400", "normal"
                else:
                    weight, style = FONT_MAP.get(base_font, ("400", "normal"))

                x0, _, x1, _ = span["bbox"]
                ox, oy = span["origin"]
                runs.append({
                    "text": text,
                    "x": ox,
                    "y": oy,
                    "width": max(0.0, x1 - x0),
                    "size": span["size"],
                    "weight": weight,
                    "style": style,
                    "color": css_color(span.get("color")),
                })
    return runs


def collect_rules(page):
    """Section underlines and link underlines are vector fills in the PDF."""
    rules = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        if not fill:
            continue
        # Word paints invisible white cell borders; skip those.
        if all(c > 0.99 for c in fill[:3]):
            continue
        r = drawing["rect"]
        if r.height > 6 or r.width < 4:
            continue
        rules.append({
            "x": r.x0, "y": r.y0, "w": r.width, "h": max(r.height, 0.5),
            "color": "#%02X%02X%02X" % tuple(int(round(c * 255)) for c in fill[:3]),
        })
    return rules


def build_svg(page):
    runs = collect(page)
    rules = collect_rules(page)
    links = [l for l in page.get_links() if l.get("uri")]

    w, h = page.rect.width, page.rect.height
    out = []
    out.append('<svg class="cv-page" xmlns="http://www.w3.org/2000/svg" '
               'xmlns:xlink="http://www.w3.org/1999/xlink" '
               'viewBox="0 0 %.2f %.2f" role="img" aria-label="Curriculum Vitae">' % (w, h))
    out.append('<rect x="0" y="0" width="%.2f" height="%.2f" fill="#ffffff"/>' % (w, h))

    for rule in rules:
        out.append('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="%s"/>'
                   % (rule["x"], rule["y"], rule["w"], rule["h"], rule["color"]))

    for run in runs:
        attrs = [
            'x="%.2f"' % run["x"],
            'y="%.2f"' % run["y"],
            'font-size="%.2f"' % run["size"],
            'fill="%s"' % run["color"],
        ]
        if run["weight"] != "400":
            attrs.append('font-weight="%s"' % run["weight"])
        if run["style"] != "normal":
            attrs.append('font-style="%s"' % run["style"])
        # Pin the advance width so a substituted font cannot change the line.
        if run["width"] > 0.5:
            attrs.append('textLength="%.2f" lengthAdjust="spacingAndGlyphs"' % run["width"])
        out.append('<text %s xml:space="preserve">%s</text>'
                   % (" ".join(attrs), html.escape(run["text"], quote=False)))

    # Clickable regions, positioned exactly where the PDF's link annotations are.
    for link in links:
        r = link["from"]
        out.append('<a xlink:href="%s" href="%s" target="_blank" rel="noopener noreferrer">'
                   '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="transparent" '
                   'pointer-events="all"><title>%s</title></rect></a>'
                   % (html.escape(link["uri"], quote=True), html.escape(link["uri"], quote=True),
                      r.x0, r.y0, r.width, r.height, html.escape(link["uri"], quote=False)))

    out.append("</svg>")
    return "\n".join(out), len(runs), len(rules), len(links)


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cory Boris - Curriculum Vitae</title>
<!--
  GENERATED FILE - do not edit by hand.
  Regenerate with: python3 tools/build_cv_html.py
  Source of truth: assets/Cory Boris Curriculum Vitae.pdf
-->
<style>
  /* Tinos is metrically identical to Times New Roman and Apache-licensed, so
     the CV renders with the PDF's exact glyph widths on devices that have no
     Times New Roman installed (all iOS and Android devices). Subset to just the
     characters this document uses - see tools/build_cv_fonts.py. */
  @font-face {
    font-family: 'CVSerif';
    src: url('assets/fonts/tinos-regular.woff2') format('woff2');
    font-weight: 400; font-style: normal; font-display: block;
  }
  @font-face {
    font-family: 'CVSerif';
    src: url('assets/fonts/tinos-bold.woff2') format('woff2');
    font-weight: 700; font-style: normal; font-display: block;
  }
  @font-face {
    font-family: 'CVSerif';
    src: url('assets/fonts/tinos-italic.woff2') format('woff2');
    font-weight: 400; font-style: italic; font-display: block;
  }
  @font-face {
    font-family: 'CVSerif';
    src: url('assets/fonts/tinos-bolditalic.woff2') format('woff2');
    font-weight: 700; font-style: italic; font-display: block;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #ffffff; }
  body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

  /* The viewBox carries the real 8.5x11 geometry, so the page just fills
     whatever width it is given and keeps perfect proportions. */
  .cv-page {
    display: block;
    width: 100%;
    height: auto;
    font-family: 'CVSerif', 'Times New Roman', Times, serif;
  }
  .cv-page a { cursor: pointer; }
</style>
</head>
<body>
__SVG__
</body>
</html>
"""


def main():
    doc = fitz.open(PDF)
    if doc.page_count != 1:
        print("note: %d pages - emitting each stacked vertically" % doc.page_count)

    svgs = []
    for page in doc:
        svg, runs, rules, links = build_svg(page)
        svgs.append(svg)
        print("page %d: %d text runs, %d rules, %d links"
              % (page.number + 1, runs, rules, links))

    out = PAGE_TEMPLATE.replace("__SVG__", "\n".join(svgs))
    open(OUT, "w", encoding="utf-8").write(out)
    print("\nwrote %s (%.1f KB)" % (os.path.relpath(OUT, REPO), os.path.getsize(OUT) / 1024.0))


if __name__ == "__main__":
    main()
