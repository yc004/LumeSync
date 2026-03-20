"""
将 assets/tray-icon.png 转换为多尺寸 ICO 文件
依赖：Pillow（pip install Pillow）
用法：python build/convert-icons.py
"""
import sys
import os
from PIL import Image

src = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tray-icon.png')
out_teacher = os.path.join(os.path.dirname(__file__), 'icon-teacher.ico')
out_student  = os.path.join(os.path.dirname(__file__), 'icon-student.ico')

if not os.path.exists(src):
    print(f'[icons] 找不到源图标: {src}')
    sys.exit(1)

img = Image.open(src).convert('RGBA')
print(f'[icons] 源图像尺寸: {img.size}')

# 生成标准多尺寸 ICO（16/32/48/64/128/256）
sizes = [(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]
imgs = [img.resize(s, Image.LANCZOS) for s in sizes]

imgs[0].save(out_teacher, format='ICO', sizes=sizes)
imgs[0].save(out_student,  format='ICO', sizes=sizes)

print(f'[icons] 生成成功: {out_teacher}')
print(f'[icons] 生成成功: {out_student}')
