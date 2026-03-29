// ========================================================
// 项目结构验证脚本
// 检查所有必需的文件和目录是否存在
// ========================================================

const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('SyncClassroom 项目结构验证');
console.log('========================================\n');

const requiredStructure = {
    'packages/engine': {
        type: 'directory',
        children: {
            'package.json': { type: 'file' },
            'index.js': { type: 'file' },
            'README.md': { type: 'file' },
            'src': {
                type: 'directory',
                children: {
                    '00-globals.js': { type: 'file' },
                    '01-settings-panel.js': { type: 'file' },
                    '08-app.js': { type: 'file' },
                    'components': {
                        type: 'directory',
                        children: {
                            'WindowControls.js': { type: 'file' },
                            'SurveySlide.js': { type: 'file' }
                        }
                    }
                }
            }
        }
    },
    'packages/server': {
        type: 'directory',
        children: {
            'package.json': { type: 'file' },
            'index.js': { type: 'file' },
            'README.md': { type: 'file' },
            'src': {
                type: 'directory',
                children: {
                    'config.js': { type: 'file' },
                    'courses.js': { type: 'file' },
                    'socket.js': { type: 'file' }
                }
            }
        }
    },
    'apps/teacher': {
        type: 'directory',
        children: {
            'package.json': { type: 'file' },
            'electron': {
                type: 'directory',
                children: {
                    'main.js': { type: 'file' },
                    'preload.js': { type: 'file' }
                }
            },
            'public': {
                type: 'directory',
                children: {
                    'index.html': { type: 'file' }
                }
            },
            'electron-builder.json': { type: 'file' }
        }
    },
    'apps/student': {
        type: 'directory',
        children: {
            'package.json': { type: 'file' },
            'electron': {
                type: 'directory',
                children: {
                    'main.js': { type: 'file' }
                }
            },
            'public': {
                type: 'directory',
                children: {
                    'index.html': { type: 'file' }
                }
            },
            'electron-builder.json': { type: 'file' }
        }
    },
    'apps/editor': {
        type: 'directory',
        children: {
            'package.json': { type: 'file' },
            'electron': {
                type: 'directory',
                children: {
                    'main.js': { type: 'file' }
                }
            },
            'public': {
                type: 'directory',
                children: {
                    'editor.html': { type: 'file' },
                    'editor': {
                        type: 'directory',
                        children: {
                            '02-editor-app.js': { type: 'file' }
                        }
                    }
                }
            },
            'electron-builder.json': { type: 'file' }
        }
    },
    'apps/common': {
        type: 'directory',
        children: {
            'electron': {
                type: 'directory',
                children: {
                    'config.js': { type: 'file' },
                    'logger.js': { type: 'file' },
                    'preload.js': { type: 'file' }
                }
            }
        }
    },
    'shared': {
        type: 'directory',
        children: {
            'public': {
                type: 'directory',
                children: {
                    'lib': { type: 'directory' },
                    'courses': { type: 'directory' },
                    'knowledge': { type: 'directory' }
                }
            },
            'assets': { type: 'directory' },
            'build': { type: 'directory' },
            'docs': { type: 'directory' }
        }
    }
};

let errors = [];
let warnings = [];

function checkStructure(structure, basePath = '') {
    for (const [name, info] of Object.entries(structure)) {
        const fullPath = path.join(__dirname, basePath, name);
        const exists = fs.existsSync(fullPath);

        if (!exists) {
            errors.push(`❌ 缺少: ${basePath}/${name}`);
            continue;
        }

        if (info.type === 'directory') {
            const stat = fs.statSync(fullPath);
            if (!stat.isDirectory()) {
                errors.push(`❌ 应该是目录但不是: ${basePath}/${name}`);
            } else if (info.children) {
                checkStructure(info.children, path.join(basePath, name));
            }
        } else if (info.type === 'file') {
            const stat = fs.statSync(fullPath);
            if (!stat.isFile()) {
                errors.push(`❌ 应该是文件但不是: ${basePath}/${name}`);
            }
        }
    }
}

// 执行检查
checkStructure(requiredStructure);

// 检查根目录文件
const rootFiles = ['package.json', 'README-NEW.md', 'REFACTORING_PLAN.md'];
rootFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) {
        errors.push(`❌ 缺少根文件: ${file}`);
    }
});

// 输出结果
console.log('检查结果:\n');

if (warnings.length > 0) {
    console.log('警告:');
    warnings.forEach(warning => console.log(warning));
    console.log();
}

if (errors.length === 0) {
    console.log('✓ 所有必需的文件和目录都存在！');
    console.log('✓ 项目结构验证通过！\n');

    console.log('下一步:');
    console.log('  1. 检查路径引用是否正确');
    console.log('  2. 测试各端功能');
    console.log('  3. 构建安装包\n');
} else {
    console.log('错误:');
    errors.forEach(error => console.log(error));
    console.log();
    console.log('❌ 项目结构验证失败！');
    console.log('请运行迁移脚本重新迁移: node migrate-all.js\n');
}

console.log('========================================');
