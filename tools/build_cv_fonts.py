#!/usr/bin/env python3
"""
Fetch and subset Tinos for the HTML CV replica.

Tinos (Apache 2.0, by Steve Matteson) is *metrically compatible* with Times New
Roman: every glyph has the same advance width. That matters because the HTML CV
is generated from the PDF's own span geometry - if the font on the visitor's
device had different widths, individual lines would render wider or narrower
than the PDF even though their positions were pinned. Times New Roman is not
installed on iOS or Android, so we cannot rely on it being there, and we are not
licensed to serve it ourselves.

Each face is subset to only the characters the CV actually contains, which takes
the four faces from ~130 KB down to a few KB each.

Usage:  python3 tools/build_cv_fonts.py
"""

import os
import re
import sys
import urllib.request

import fitz
from fontTools import subset
from fontTools.ttLib import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(REPO, "assets", "Cory Boris Curriculum Vitae.pdf")
OUT_DIR = os.path.join(REPO, "assets", "fonts")

CSS_URL = ("https://fonts.googleapis.com/css2"
           "?family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap")
# A modern desktop UA makes Google serve woff2 rather than ttf.
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

FACES = {
    ("normal", "400"): "tinos-regular",
    ("normal", "700"): "tinos-bold",
    ("italic", "400"): "tinos-italic",
    ("italic", "700"): "tinos-bolditalic",
}


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf-8")


def parse_latin_faces(css):
    """Pull the `latin` (not latin-ext) woff2 URL for each style/weight."""
    found = {}
    # Each @font-face is preceded by a /* subset */ comment.
    for match in re.finditer(r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S):
        subset_name, block = match.group(1), match.group(2)
        if subset_name != "latin":
            continue
        style = re.search(r"font-style:\s*(\w+)", block)
        weight = re.search(r"font-weight:\s*(\d+)", block)
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        if style and weight and url:
            found[(style.group(1), weight.group(1))] = url.group(1)
    return found


def characters_used():
    """Every character that appears in the CV, so we can drop the rest."""
    doc = fitz.open(PDF)
    chars = set()
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    chars.update(span["text"])
    # Always keep the bullet and common punctuation the generator may emit.
    chars.update(" \u2022\u2013\u2014\u2018\u2019\u201c\u201d\u00a0|:,.()&/+-")
    return chars


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    chars = characters_used()
    print("characters used in CV: %d" % len(chars))
    print("".join(sorted(c for c in chars if c.isprintable() and c != " ")))

    print("\nfetching Google Fonts CSS...")
    css = fetch(CSS_URL)
    faces = parse_latin_faces(css)
    if len(faces) != 4:
        sys.exit("expected 4 latin faces, got %d: %s" % (len(faces), sorted(faces)))

    total = 0
    for key, name in FACES.items():
        url = faces.get(key)
        if not url:
            sys.exit("missing face %s" % (key,))
        raw = fetch(url, binary=True)
        tmp = os.path.join(OUT_DIR, name + ".full.woff2")
        open(tmp, "wb").write(raw)

        font = TTFont(tmp)
        subsetter = subset.Subsetter(options=subset.Options(
            layout_features=["kern", "liga", "calt"],
            drop_tables=["FFTM"],
            notdef_outline=True,
            recalc_bounds=True,
        ))
        subsetter.populate(text="".join(chars))
        subsetter.subset(font)
        font.flavor = "woff2"

        out = os.path.join(OUT_DIR, name + ".woff2")
        font.save(out)
        font.close()
        os.remove(tmp)

        size = os.path.getsize(out)
        total += size
        print("  %-18s %6.1f KB  (from %6.1f KB)" % (name, size / 1024.0, len(raw) / 1024.0))

    print("\ntotal embedded font weight: %.1f KB" % (total / 1024.0))


if __name__ == "__main__":
    main()
