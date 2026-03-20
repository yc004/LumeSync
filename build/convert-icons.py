"""
Convert assets/tray-icon.png to multi-size ICO files.
Manually builds the ICO binary so every size is guaranteed to be embedded.
Requires: Pillow (pip install Pillow)
Usage: python build/convert-icons.py
"""
import sys
import os
import io
import struct
from PIL import Image

src = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tray-icon.png')
out_teacher = os.path.join(os.path.dirname(__file__), 'icon-teacher.ico')
out_student  = os.path.join(os.path.dirname(__file__), 'icon-student.ico')

if not os.path.exists(src):
    print('[icons] ERROR: source icon not found: ' + src)
    sys.exit(1)

img = Image.open(src).convert('RGBA')
print('[icons] source size: ' + str(img.size))

SIZES = [16, 32, 48, 64, 128, 256]

def build_ico(base_img, sizes):
    """
    Build a valid ICO file containing one PNG-encoded frame per size.
    ICO format:
      ICONDIR  (6 bytes)
      ICONDIRENTRY * n  (16 bytes each)
      PNG data * n
    """
    # Encode each size as PNG bytes
    png_bufs = []
    for s in sizes:
        resized = base_img.resize((s, s), Image.LANCZOS)
        buf = io.BytesIO()
        resized.save(buf, format='PNG')
        png_bufs.append(buf.getvalue())

    n = len(sizes)
    header_size = 6 + 16 * n          # ICONDIR + all ICONDIRENTRYs
    offsets = []
    offset = header_size
    for pb in png_bufs:
        offsets.append(offset)
        offset += len(pb)

    out = io.BytesIO()

    # ICONDIR
    out.write(struct.pack('<HHH', 0, 1, n))  # reserved=0, type=1(ICO), count=n

    # ICONDIRENTRYs
    for i, s in enumerate(sizes):
        w = 0 if s >= 256 else s
        h = 0 if s >= 256 else s
        out.write(struct.pack('<BBBBHHII',
            w,              # width  (0 = 256)
            h,              # height (0 = 256)
            0,              # color count
            0,              # reserved
            1,              # planes
            32,             # bit count
            len(png_bufs[i]),  # size of image data
            offsets[i],        # offset of image data
        ))

    # PNG data
    for pb in png_bufs:
        out.write(pb)

    return out.getvalue()

ico_data = build_ico(img, SIZES)

with open(out_teacher, 'wb') as f:
    f.write(ico_data)
with open(out_student, 'wb') as f:
    f.write(ico_data)

print('[icons] sizes embedded: ' + str(SIZES))
print('[icons] OK: ' + out_teacher)
print('[icons] OK: ' + out_student)
