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

src_teacher = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tray-icon.png')
src_editor  = os.path.join(os.path.dirname(__file__), '..', 'assets', 'editor-icon.png')
src_course  = os.path.join(os.path.dirname(__file__), '..', 'assets', 'file-icon.png')
out_teacher = os.path.join(os.path.dirname(__file__), 'icon-teacher.ico')
out_student = os.path.join(os.path.dirname(__file__), 'icon-student.ico')
out_editor  = os.path.join(os.path.dirname(__file__), 'icon-editor.ico')
out_course  = os.path.join(os.path.dirname(__file__), 'icon-course.ico')

if not os.path.exists(src_teacher):
    print('[icons] ERROR: source teacher icon not found: ' + src_teacher)
    sys.exit(1)

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

def generate_ico(src_path, out_path, sizes):
    if not os.path.exists(src_path):
        print(f'[icons] WARNING: {src_path} not found, using fallback.')
        return False
    
    img = Image.open(src_path).convert('RGBA')
    print(f'[icons] source {os.path.basename(src_path)} size: {img.size}')
    
    ico_data = build_ico(img, sizes)
    with open(out_path, 'wb') as f:
        f.write(ico_data)
    print(f'[icons] OK: {out_path}')
    return True

SIZES = [16, 32, 48, 64, 128, 256]

# Generate Teacher/Student icons from tray-icon.png
generate_ico(src_teacher, out_teacher, SIZES)
generate_ico(src_teacher, out_student, SIZES)

# Generate Editor icon (prefer editor-icon.png, fallback to tray-icon.png)
if not generate_ico(src_editor, out_editor, SIZES):
    generate_ico(src_teacher, out_editor, SIZES)

# Generate Course file icon (prefer file-icon.png, fallback to tray-icon.png)
if not generate_ico(src_course, out_course, SIZES):
    generate_ico(src_teacher, out_course, SIZES)

print('[icons] All icons processed.')
