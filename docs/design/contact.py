"""Crop the device frame out of grill.html screenshots and lay them side by side.

Usage: python3 -I docs/design/contact.py out.png top_px height_px in1.png in2.png ...
Each input is cropped to rows [top, top+height) at full width, then appended left to right.
"""
import sys

from PIL import Image

out, top, height, *ins = sys.argv[1:]
top, height = int(top), int(height)
tiles = [Image.open(p).convert("RGB").crop((0, top, Image.open(p).width, top + height)) for p in ins]
sheet = Image.new("RGB", (sum(t.width for t in tiles), height), (42, 45, 53))
x = 0
for t in tiles:
    sheet.paste(t, (x, 0))
    x += t.width
sheet.save(out)
print(out)
