const { spawn } = require('child_process');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const shellExe = path.join(appRoot, 'build', 'native-vs', 'native', 'shell', 'Release', 'LumeSyncTeacherShell.exe');

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
