#!/usr/bin/env node
'use strict';
// Loads/executes reviewed authoring source. node:vm is not a sandbox.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const checker = require('../assets/authoring/check.cjs');
async function main() {
  const args = process.argv.slice(2);
  const native = args[0] === '--native';
  if (native) args.shift();
  if (args.some(arg => arg.startsWith('--')) || native && !args.length) {
    throw new Error('Usage: node scripts/check.cjs [--native] SOURCE.js [SOURCE.js ...]');
  }
  const probe = process.env.BAKA_V2_PROBE;
  if (native && (!probe || !fs.existsSync(probe) || !fs.statSync(probe).isFile())) {
    throw new Error('Set BAKA_V2_PROBE to the actual current v2_probe executable; native verification was not run');
  }
  await checker.main(args);
  if (!native) return;
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-authoring-admission-'));
  try {
    for (const file of args) {
      const env = { ...process.env, BAKA_PROVIDER_STORAGE: storage };
      delete env.BAKA_PROVIDER_RESULT_FILE;
      const result = spawnSync(probe, [path.resolve(file)], { encoding: 'utf8', env, timeout: 15000, maxBuffer: 1024 * 1024 });
      if (result.error) throw new Error('Native admission could not finish: ' + result.error.message);
      if (result.status !== 0) throw new Error('Native QuickJS admission failed: ' + result.stderr.trim());
      const summary = JSON.parse(result.stdout.trim());
      if (summary.lean !== true) throw new Error('Native probe did not confirm the lean V2 environment');
      console.log(summary.providerId + ': native QuickJS admission valid; handlers/services/playback not exercised');
    }
  } finally {
    if (path.dirname(path.resolve(storage)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected temporary storage path');
    fs.rmSync(storage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
