#!/usr/bin/env python3
"""
Build the coat frame bundle used by the scroll animation.

Why this exists
---------------
The site used to drive the coat animation with two <video> elements (a forward
file and a pre-reversed file). That could never be stutter-free:

  * The WebM is VP9 *with alpha*. Alpha in VP9 is a container hack - a second,
    independent VP9 stream - and no GPU decoder handles it, so Chromium decodes
    both streams in software.
  * Keyframes were 1s apart, so every `video.currentTime = x` seek had to decode
    up to 24 dependent frames before it could paint anything.

Instead we ship every frame as an independent WebP (alpha preserved) inside ONE
binary bundle plus a JSON manifest of byte offsets. The client makes a single
streamed request, so we get real progress for the splash screen, and random
access to any frame becomes an array index instead of a video seek.

Output (written into assets/):
  coat_frames.bin   - all frames concatenated, no padding
  coat_frames.json  - { width, height, fps, frameCount, sizes: [...] }

Frames are extracted at the source's native 1080x1080 - no upscaling.

Usage:  python3 tools/build_coat_frames.py
"""

import json
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "assets", "Coat_Unfolding.webm")
STAGE = os.path.join(REPO, "assets", ".frame_stage")
OUT_BIN = os.path.join(REPO, "assets", "coat_frames.bin")
OUT_JSON = os.path.join(REPO, "assets", "coat_frames.json")

FPS = 24
QUALITY = 80          # libwebp -q:v
COMPRESSION = 6       # libwebp -compression_level (slower encode, smaller files)


def probe_dimensions(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True).stdout.strip()
    w, h = out.split(",")[:2]
    return int(w), int(h)


def main():
    if not os.path.exists(SRC):
        sys.exit("missing source: %s" % SRC)

    width, height = probe_dimensions(SRC)
    print("source: %dx%d (extracting at native size, no upscale)" % (width, height), flush=True)

    shutil.rmtree(STAGE, ignore_errors=True)
    os.makedirs(STAGE)

    # -c:v libvpx-vp9 is REQUIRED: ffmpeg's default VP9 path drops the WebM
    # alpha plane silently, which would give us frames with a black background.
    print("extracting + encoding frames (this takes a few minutes)...", flush=True)
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-c:v", "libvpx-vp9", "-i", SRC,
         "-vf", "format=yuva420p",
         "-c:v", "libwebp",
         "-q:v", str(QUALITY),
         "-compression_level", str(COMPRESSION),
         os.path.join(STAGE, "f%04d.webp")],
        capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr[-3000:])
        sys.exit("ffmpeg failed")

    names = sorted(os.listdir(STAGE))
    if not names:
        sys.exit("no frames produced")

    # Sanity check: alpha must have survived the round trip.
    try:
        from PIL import Image
        probe = Image.open(os.path.join(STAGE, names[len(names) // 2]))
        if probe.mode != "RGBA" or probe.getchannel("A").getextrema()[0] == 255:
            sys.exit("alpha channel missing from encoded frames - aborting")
        print("alpha verified on sample frame (%s, %s)" % (probe.mode, probe.size), flush=True)
    except ImportError:
        print("warning: PIL unavailable, skipping alpha verification", flush=True)

    sizes = []
    with open(OUT_BIN, "wb") as bundle:
        for name in names:
            data = open(os.path.join(STAGE, name), "rb").read()
            bundle.write(data)
            sizes.append(len(data))

    manifest = {
        "width": width,
        "height": height,
        "fps": FPS,
        "frameCount": len(sizes),
        "mime": "image/webp",
        "sizes": sizes,
    }
    with open(OUT_JSON, "w") as f:
        json.dump(manifest, f, separators=(",", ":"))

    shutil.rmtree(STAGE, ignore_errors=True)

    total = sum(sizes)
    print("wrote %d frames, %.1f MB total, avg %d KB/frame"
          % (len(sizes), total / 1048576.0, (total // len(sizes)) // 1024), flush=True)
    print("frame indices 0..%d" % (len(sizes) - 1), flush=True)


if __name__ == "__main__":
    main()
