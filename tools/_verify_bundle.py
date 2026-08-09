"""Verify the frame bundle slices exactly the way coat-frames.js will slice it."""
import io
import json
import os
import struct

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manifest = json.load(io.open(os.path.join(REPO, "assets", "coat_frames.json")))
data = open(os.path.join(REPO, "assets", "coat_frames.bin"), "rb").read()

sizes = manifest["sizes"]
print("manifest: %dx%d, %d fps, frameCount=%d, mime=%s"
      % (manifest["width"], manifest["height"], manifest["fps"],
         manifest["frameCount"], manifest["mime"]))

assert manifest["frameCount"] == len(sizes), "frameCount disagrees with sizes[]"
total = sum(sizes)
print("sum(sizes) = %d, bundle = %d -> %s" % (total, len(data), "MATCH" if total == len(data) else "MISMATCH"))
assert total == len(data), "bundle length does not match manifest"

# Slice exactly as the client does and validate every frame is a real WebP.
offset = 0
bad = []
alpha_flagged = 0
for i, size in enumerate(sizes):
    chunk = data[offset:offset + size]
    offset += size
    if chunk[0:4] != b"RIFF" or chunk[8:12] != b"WEBP":
        bad.append(i)
        continue
    riff_len = struct.unpack("<I", chunk[4:8])[0]
    if riff_len + 8 != size:
        bad.append(i)
        continue
    # VP8X extended format carries the alpha flag in bit 4 of its first byte.
    if chunk[12:16] == b"VP8X" and (chunk[20] & 0x10):
        alpha_flagged += 1

print("frames validated: %d, malformed: %s" % (len(sizes), bad or "none"))
print("frames advertising an alpha channel: %d/%d" % (alpha_flagged, len(sizes)))
assert not bad, "malformed frames at %s" % bad

for probe in (0, 25, 56, 69, 168, 240):
    assert probe < len(sizes), "freeze frame %d out of range" % probe
print("all freeze frames present: 0, 25, 56, 69, 168, 240 (max index %d)" % (len(sizes) - 1))
print("\nOK - client-side slicing will reproduce every frame byte-for-byte")
