// 教师测试共用的学生课堂 UI 夹具。
//
// 学生课堂页由学生端仓库的 @lumesync/student-ui 拥有并构建成版本化产物；
// 教师侧测试通过该包导出的 paths 模块定位产物，并在需要时运行真实构建脚本
// （构建是幂等的：版本由构建输入的内容哈希决定）。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 工作区链接缺失时的兜底路径，保证只跑教师测试的检出也能定位学生端包。
const fallbackPackageRoot = path.join(__dirname, '../../../student/ui/classroom');

function loadStudentUiPaths() {
    try {
        return require(require.resolve('@lumesync/student-ui/dist'));
    } catch (err) {
        const fallback = path.join(fallbackPackageRoot, 'lib/paths.cjs');
        if (!fs.existsSync(fallback)) throw err;
        return require(fallback);
    }
}

function ensureStudentUiBuild() {
    const paths = loadStudentUiPaths();
    const result = spawnSync(process.execPath, [paths.buildScriptPath], {
        cwd: paths.packageRoot,
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        throw new Error(`student classroom UI build failed: ${result.stderr || result.stdout}`);
    }
    return paths;
}

module.exports = { loadStudentUiPaths, ensureStudentUiBuild };
