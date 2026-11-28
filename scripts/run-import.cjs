#!/usr/bin/env node
'use strict';
// Optional native-backed Flutter test; uses temporary preferences and paths,
// not an installed user's registry. No third-party service/account is accessed.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function main() {
  const app = process.env.BAKA_FLUTTER_APP;
  const sdk = process.env.BAKA_FLUTTER_SDK;
  if (!app || !sdk) throw new Error('Set BAKA_FLUTTER_APP and BAKA_FLUTTER_SDK; application import verification was not run');
  const appRoot = path.resolve(app);
  const sdkRoot = path.resolve(sdk);
  const dart = path.join(sdkRoot, 'bin/cache/dart-sdk/bin', process.platform === 'win32' ? 'dart.exe' : 'dart');
  const snapshot = path.join(sdkRoot, 'bin/cache/flutter_tools.snapshot');
  const packages = path.join(sdkRoot, 'packages/flutter_tools/.dart_tool/package_config.json');
  for (const file of [dart, snapshot, packages, path.join(appRoot, 'lib/rust/bridge.dart'), path.join(appRoot, '.dart_tool/package_config.json')]) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('Missing prepared SDK/application prerequisite: ' + file);
  }
  const base = path.join(appRoot, '.dart_tool');
  const directory = fs.mkdtempSync(path.join(base, 'baka-authoring-import-'));
  try {
    const testFile = path.join(directory, 'authoring_import_test.dart');
    fs.copyFileSync(path.join(__dirname, '../tests/application-import.dart'), testFile);
    const result = spawnSync(dart, ['--packages=' + packages, snapshot, 'test', testFile, '--reporter', 'expanded'], {
      cwd: appRoot, env: { ...process.env, FLUTTER_ROOT: sdkRoot, BAKA_AUTHORING_ROOT: path.resolve(__dirname, '..') },
      encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Application import test failed; verify the current native library is built (exit ' + result.status + ')');
  } finally {
    if (path.dirname(path.resolve(directory)) !== base) throw new Error('Unexpected application test cache path');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
