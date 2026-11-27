#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const probe = process.env.BAKA_V2_PROBE;
if (!probe || !fs.existsSync(probe) || !fs.statSync(probe).isFile()) {
  console.error('Set BAKA_V2_PROBE to the actual BakaMusicFlutter v2_probe executable. Native verification was not run.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', path.join(__dirname, '../tests/native.test.cjs')], {
    stdio: 'inherit', env: { ...process.env, BAKA_V2_PROBE: path.resolve(probe) },
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
