'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appDirectory = path.resolve(__dirname, '..');
const metadata = JSON.parse(fs.readFileSync(path.join(appDirectory, 'package.json'), 'utf8'));

test('desktop packaging declares macOS and Windows course-editor targets', () => {
  const build = metadata.build;
  assert.equal(build.appId, 'com.lumesync.editor');
  assert.ok(build.files.includes('app/**/*'));
  assert.ok(build.fileAssociations.some(entry => entry.ext === 'lume'));
  assert.equal(build.executableName, 'LumeSyncEditor');
  assert.ok(fs.existsSync(path.join(appDirectory, build.mac.entitlements)));
  assert.ok(fs.existsSync(path.join(appDirectory, build.mac.entitlementsInherit)));
  assert.equal(metadata.scripts['dist:mac:local'].includes('identity=-'), true);

  const macTargets = build.mac.target.flatMap(target => target.target === 'dmg' || target.target === 'zip' ? target.arch : []);
  assert.deepEqual(new Set(macTargets), new Set(['arm64', 'x64']));
  assert.ok(build.mac.target.some(target => target.target === 'dmg'));
  assert.ok(build.mac.target.some(target => target.target === 'zip'));
  assert.deepEqual(build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(build.nsis.oneClick, false);
  assert.equal(build.nsis.deleteAppDataOnUninstall, false);
});

test('desktop installer icons are present in native formats', () => {
  const macIcon = fs.readFileSync(path.join(appDirectory, 'build-resources/icon.icns'));
  const windowsIcon = fs.readFileSync(path.join(appDirectory, 'build-resources/icon.ico'));
  assert.equal(macIcon.subarray(0, 4).toString('ascii'), 'icns');
  assert.equal(windowsIcon.readUInt16LE(0), 0);
  assert.equal(windowsIcon.readUInt16LE(2), 1);
});
