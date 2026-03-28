// ========================================================
// 图标转换脚本：将 assets/tray-icon.png 转为 .ico 格式
// 使用纯 Node.js 实现，无需第三方依赖
// ICO 格式支持直接内嵌 PNG 数据（Windows Vista+ 支持）
// 用法：node build/convert-icons.js
// ========================================================
const fs = require('fs');
const path = require('path');

const srcPng = path.join(__dirname, '..', 'assets', 'tray-icon.png');
const outTeacher = path.join(__dirname, 'icon-teacher.ico');
const outStudent = path.join(__dirname, 'icon-student.ico');

function pngToIco(pngBuffer) {
    // ICO 文件格式：
    // ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + PNG data
    const pngSize = pngBuffer.length;

    // 从 PNG IHDR chunk 读取宽高（偏移 16-23）
    // PNG 结构：8字节签名 + 4字节长度 + 4字节"IHDR" + 4字节宽 + 4字节高
    const width  = pngBuffer.readUInt32BE(16);
    const height = pngBuffer.readUInt32BE(20);

    // ICO 中宽高字段：超过 255 才用 0 表示 256，否则直接写实际值
    const icoW = width  > 255 ? 0 : width;
    const icoH = height > 255 ? 0 : height;

    const headerSize = 6;   // ICONDIR
    const entrySize  = 16;  // ICONDIRENTRY
    const dataOffset = headerSize + entrySize;

    const buf = Buffer.alloc(dataOffset + pngSize);

    // ICONDIR
    buf.writeUInt16LE(0,      0); // reserved
    buf.writeUInt16LE(1,      2); // type: 1 = ICO
    buf.writeUInt16LE(1,      4); // count: 1 image

    // ICONDIRENTRY
    buf.writeUInt8(icoW,      6); // width
    buf.writeUInt8(icoH,      7); // height
    buf.writeUInt8(0,         8); // color count (0 = no palette)
    buf.writeUInt8(0,         9); // reserved
    buf.writeUInt16LE(1,     10); // planes
    buf.writeUInt16LE(32,    12); // bit count
    buf.writeUInt32LE(pngSize,   14); // size of image data
    buf.writeUInt32LE(dataOffset, 18); // offset of image data

    // PNG data
    pngBuffer.copy(buf, dataOffset);

    return buf;
}

function main() {
    if (!fs.existsSync(srcPng)) {
        console.error('[icons] 找不到源图标:', srcPng);
        process.exit(1);
    }

    const pngBuf = fs.readFileSync(srcPng);

    // 验证 PNG 签名
    const sig = pngBuf.slice(0, 8).toString('hex');
    if (sig !== '89504e470d0a1a0a') {
        console.error('[icons] 文件不是有效的 PNG:', srcPng);
        process.exit(1);
    }

    const icoBuf = pngToIco(pngBuf);
    fs.writeFileSync(outTeacher, icoBuf);
    fs.writeFileSync(outStudent, icoBuf);

    const w = pngBuf.readUInt32BE(16);
    const h = pngBuf.readUInt32BE(20);
    console.log(`[icons] 源图像尺寸: ${w}x${h}`);
    console.log('[icons] 生成成功:', outTeacher);
    console.log('[icons] 生成成功:', outStudent);
}

main();
