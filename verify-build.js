// ========================================================
// 验证打包配置
// ========================================================

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname);
const apps = ['teacher', 'student', 'editor'];

console.log('========================================');
console.log('SyncClassroom 打包配置验证');
console.log('========================================\n');

let allPassed = true;

// 检查每个应用的配置
apps.forEach(app => {
    console.log(`\n【${app}】`);
    console.log('-'.repeat(40));

    const appDir = path.join(projectRoot, 'apps', app);
    const configPath = path.join(appDir, 'electron-builder.json');
    const packagePath = path.join(appDir, 'package.json');
    const electronDir = path.join(appDir, 'electron');

    // 1. 检查配置文件存在
    if (!fs.existsSync(configPath)) {
        console.log('❌ electron-builder.json 不存在');
        allPassed = false;
        return;
    } else {
        console.log('✅ electron-builder.json 存在');
    }

    // 2. 检查 package.json 存在
    if (!fs.existsSync(packagePath)) {
        console.log('❌ package.json 不存在');
        allPassed = false;
    } else {
        console.log('✅ package.json 存在');
    }

    // 3. 检查主进程文件
    const mainPath = path.join(electronDir, 'main.js');
    if (!fs.existsSync(mainPath)) {
        console.log('❌ electron/main.js 不存在');
        allPassed = false;
    } else {
        console.log('✅ electron/main.js 存在');
    }

    // 4. 检查 preload.js
    const preloadPath = path.join(electronDir, 'preload.js');
    if (!fs.existsSync(preloadPath)) {
        console.log('❌ electron/preload.js 不存在');
        allPassed = false;
    } else {
        console.log('✅ electron/preload.js 存在');
    }

    // 5. 读取配置文件并检查路径
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // 检查 buildResources 路径
        const buildResources = config.directories?.buildResources;
        if (!buildResources) {
            console.log('⚠️  未配置 buildResources');
        } else {
            const buildResourcesPath = path.join(appDir, buildResources);
            if (!fs.existsSync(buildResourcesPath)) {
                console.log(`❌ buildResources 路径不存在: ${buildResources}`);
                allPassed = false;
            } else {
                console.log(`✅ buildResources 路径正确: ${buildResources}`);
            }
        }

        // 检查输出目录
        const outputDir = config.directories?.output;
        if (!outputDir) {
            console.log('⚠️  未配置输出目录');
        } else {
            console.log(`✅ 输出目录: ${outputDir}`);
        }

        // 检查图标文件
        const iconPath = config.win?.icon;
        if (iconPath) {
            const absIconPath = path.join(appDir, iconPath);
            if (!fs.existsSync(absIconPath)) {
                console.log(`❌ 图标文件不存在: ${iconPath}`);
                allPassed = false;
            } else {
                console.log(`✅ 图标文件存在: ${iconPath}`);
            }
        }

    } catch (err) {
        console.log(`❌ 读取配置文件失败: ${err.message}`);
        allPassed = false;
    }
});

// 检查共享资源
console.log('\n\n【共享资源】');
console.log('-'.repeat(40));

const sharedDirs = [
    { path: 'shared/build', name: '构建资源' },
    { path: 'shared/public', name: '公共文件' },
    { path: 'packages/server', name: '服务器包' },
    { path: 'packages/engine', name: '引擎包' },
    { path: 'apps/common/electron', name: '公共 Electron 脚本' },
    { path: 'apps/shared', name: '共享应用文件' }
];

sharedDirs.forEach(dir => {
    const dirPath = path.join(projectRoot, dir.path);
    if (!fs.existsSync(dirPath)) {
        console.log(`❌ ${dir.name} 不存在: ${dir.path}`);
        allPassed = false;
    } else {
        console.log(`✅ ${dir.name} 存在: ${dir.path}`);
    }
});

// 检查必要的图标文件
console.log('\n【图标文件】');
console.log('-'.repeat(40));

const icons = [
    'shared/build/icon-teacher.ico',
    'shared/build/icon-student.ico',
    'shared/build/icon-editor.ico',
    'shared/build/icon-course.ico'
];

icons.forEach(icon => {
    const iconPath = path.join(projectRoot, icon);
    if (!fs.existsSync(iconPath)) {
        console.log(`❌ ${icon} 不存在`);
        allPassed = false;
    } else {
        console.log(`✅ ${icon} 存在`);
    }
});

// 检查学生端特殊文件
console.log('\n【学生端特殊文件】');
console.log('-'.repeat(40));

const studentFiles = [
    'shared/build/verify-password.exe',
    'shared/build/verify-password.js'
];

studentFiles.forEach(file => {
    const filePath = path.join(projectRoot, file);
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  ${file} 不存在（需要运行 npm run build:verify）`);
    } else {
        console.log(`✅ ${file} 存在`);
    }
});

// 总结
console.log('\n\n========================================');
if (allPassed) {
    console.log('✅ 所有配置检查通过！');
    console.log('可以运行打包命令：');
    console.log('  - npm run build:teacher');
    console.log('  - npm run build:student');
    console.log('  - npm run build:editor');
    console.log('  - npm run build:all');
} else {
    console.log('❌ 发现配置问题，请修复后再打包');
}
console.log('========================================');

process.exit(allPassed ? 0 : 1);
