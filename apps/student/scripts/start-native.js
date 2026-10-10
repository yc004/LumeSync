'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const shellExe = path.join(appRoot, 'build', 'native-vs', 'desktop', 'shell', 'Release', 'LumeSyncStudentShell.exe');

// 学生端只有 Windows C++/WebView2 原生壳这一个入口，没有跨平台替代品。
// 在非 Windows 上或未构建时提前说明，避免只看到 spawn ENOENT。
function fail(lines) {
  console.error(['', ...lines, ''].join('\n'));
  process.exit(1);
}

if (process.platform !== 'win32') {
  fail([
    `学生端原生壳是 Windows C++/WebView2 程序，无法在 ${process.platform} 上运行。`,
    '',
    '学生课堂界面本身是网页，调试界面时可先起教师服务再在浏览器打开：',
    '  pnpm run start:teacher-server     # 然后访问 http://127.0.0.1:<port>/student.html',
  ]);
}

if (!fs.existsSync(shellExe)) {
  fail([
    '未找到已构建的 Windows 原生学生壳：',
    `  ${shellExe}`,
    '',
    '需要先构建（Windows + Visual Studio 2022 + CMake）：',
    '  pnpm --filter @lumesync/student run build:student-native',
  ]);
}

const child = spawn(shellExe, [], {
  cwd: appRoot,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to start native student shell:', error);
  process.exit(1);
});
