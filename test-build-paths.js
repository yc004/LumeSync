// ========================================================
// 测试打包路径配置
// ========================================================

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname);

console.log('========================================');
console.log('测试打包路径配置');
console.log('========================================\n');

// 检查 shared/build 中的脚本
console.log('【shared/build 脚本】');
console.log('-'.repeat(40));

const scripts = [
    'shared/build/build.bat',
    'shared/build/convert-icons.py',
    'shared/build/convert-icons.js',
    'shared/build/verify-password.js',
    'shared/build/student-installer.nsh'
];

scripts.forEach(script => {
    const scriptPath = path.join(projectRoot, script);
    if (fs.existsSync(scriptPath)) {
        console.log(`✅ ${script} 存在`);

        // 检查脚本内容中的路径
        if (script.endsWith('.js') || script.endsWith('.py')) {
            const content = fs.readFileSync(scriptPath, 'utf-8');

            // 检查是否引用了错误的路径
            if (content.includes("path.join(__dirname, '..', 'assets'")) {
                console.log(`   ✅ 路径正确: 引用 '../assets'`);
            } else if (content.includes("'..'")) {
                console.log(`   ℹ️  使用相对路径`);
            }

            // 检查是否引用了 build 目录
            if (content.includes("'..'")) {
                console.log(`   ℹ️  使用相对于 build 目录的路径`);
            }
        }
    } else {
        console.log(`❌ ${script} 不存在`);
    }
});

// 检查图标源文件
console.log('\n【图标源文件】');
console.log('-'.repeat(40));

const iconSources = [
    'shared/assets/tray-icon.png',
    'shared/assets/editor-icon.png',
    'shared/assets/file-icon.png'
];

iconSources.forEach(icon => {
    const iconPath = path.join(projectRoot, icon);
    if (fs.existsSync(iconPath)) {
        console.log(`✅ ${icon} 存在`);
    } else {
        console.log(`❌ ${icon} 不存在`);
    }
});

// 检查生成的图标文件
console.log('\n【生成的图标文件】');
console.log('-'.repeat(40));

const generatedIcons = [
    'shared/build/icon-teacher.ico',
    'shared/build/icon-student.ico',
    'shared/build/icon-editor.ico',
    'shared/build/icon-course.ico'
];

generatedIcons.forEach(icon => {
    const iconPath = path.join(projectRoot, icon);
    if (fs.existsSync(iconPath)) {
        console.log(`✅ ${icon} 存在`);
    } else {
        console.log(`⚠️  ${icon} 不存在（需要运行图标生成脚本）`);
    }
});

// 测试 convert-icons.js 脚本中的路径
console.log('\n【测试 convert-icons.js 路径】');
console.log('-'.repeat(40));

const convertIconsJs = path.join(projectRoot, 'shared/build/convert-icons.js');
if (fs.existsSync(convertIconsJs)) {
    const content = fs.readFileSync(convertIconsJs, 'utf-8');

    const srcPngMatch = content.match(/const srcPng = path\.join\(__dirname, (.+)\);/);
    if (srcPngMatch) {
        console.log(`源 PNG 路径: ${srcPngMatch[1]}`);

        // 验证路径是否正确
        const expectedPath = "'..', 'assets', 'tray-icon.png'";
        if (srcPngMatch[1].includes("'assets'")) {
            console.log('✅ 路径配置正确');

            // 实际测试路径
            const actualPath = eval(srcPngMatch[1].replace(/path\.join\(__dirname, (.+)\)/, 'path.join(__dirname, $1)'));
            const resolvedPath = path.resolve(path.dirname(convertIconsJs), actualPath);
            console.log(`   解析路径: ${resolvedPath}`);

            if (fs.existsSync(resolvedPath)) {
                console.log('   ✅ 源文件存在');
            } else {
                console.log('   ❌ 源文件不存在');
            }
        } else {
            console.log('❌ 路径配置可能不正确');
        }
    }
}

// 测试 convert-icons.py 脚本中的路径
console.log('\n【测试 convert-icons.py 路径】');
console.log('-'.repeat(40));

const convertIconsPy = path.join(projectRoot, 'shared/build/convert-icons.py');
if (fs.existsSync(convertIconsPy)) {
    const content = fs.readFileSync(convertIconsPy, 'utf-8');

    const srcTeacherMatch = content.match(/src_teacher = os\.path\.join\(os\.path\.dirname\(__file__\), (.+)\)/);
    if (srcTeacherMatch) {
        console.log(`教师端图标路径: ${srcTeacherMatch[1].trim()}`);

        if (srcTeacherMatch[1].includes("'assets'")) {
            console.log('✅ 路径配置正确');
        }
    }

    const srcEditorMatch = content.match(/src_editor = os\.path\.join\(os\.path\.dirname\(__file__\), (.+)\)/);
    if (srcEditorMatch) {
        console.log(`编辑器图标路径: ${srcEditorMatch[1].trim()}`);

        if (srcEditorMatch[1].includes("'assets'")) {
            console.log('✅ 路径配置正确');
        }
    }
}

// 检查 verify-password.exe
console.log('\n【验证工具】');
console.log('-'.repeat(40));

const verifyExe = path.join(projectRoot, 'shared/build/verify-password.exe');
if (fs.existsSync(verifyExe)) {
    console.log('✅ verify-password.exe 存在');

    const stats = fs.statSync(verifyExe);
    console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   修改时间: ${stats.mtime.toLocaleString()}`);
} else {
    console.log('⚠️  verify-password.exe 不存在（需要运行 npm run build:verify）');
}

console.log('\n========================================');
console.log('路径测试完成！');
console.log('========================================');
