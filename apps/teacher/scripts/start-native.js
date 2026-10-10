'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const shellExe = path.join(appRoot, 'build', 'native-vs', 'native', 'shell', 'Release', 'LumeSyncTeacherShell.exe');

// 这个入口启动的是 Windows C++/WebView2 原生壳，只能在 Windows 上跑，
// 而且必须先由 MSVC 构建出 exe。两种情况都在这里提前给出可操作的提示，
// 否则 spawn 只会抛一个 ENOENT，看不出该换哪个命令。
function fail(lines) {
  console.error(['', ...lines, ''].join('\n'));
  process.exit(1);
}

if (process.platform !== 'win32') {
  fail([
    `教师端原生壳是 Windows C++/WebView2 程序，无法在 ${process.platform} 上运行。`,
    '',
    '跨平台（macOS / Windows）请用 Electron 桌面端：',
    '  pnpm run start:teacher:desktop',
    '',
    '只要课堂服务、不要桌面窗口：',
    '  pnpm run start:teacher-server',
  ]);
}

if (!fs.existsSync(shellExe)) {
  fail([
    '未找到已构建的 Windows 原生教师壳：',
    `  ${shellExe}`,
    '',
    '需要先构建（Windows + Visual Studio 2022 + CMake）：',
    '  pnpm --filter @lumesync/teacher run build:teacher-native',
    '',
    '若只想在 macOS 上开发，改用：',
    '  pnpm run start:teacher:desktop',
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
  console.error('Failed to start native teacher shell:', error);
  process.exit(1);
});
