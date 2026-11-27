'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { checkDocs } = require('../scripts/check-docs.cjs');

test('repository text and Markdown have valid encoding, local links and closed fences', () => {
  const result = checkDocs(path.join(__dirname, '..'));
  assert.ok(result.files > 0);
  assert.deepEqual(result.errors, []);
});

test('documentation validation catches broken destinations, anchors, fences and encoding', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-docs-check-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'README.md'), '# Guide\n\n[page](page.md#重复标题-1)\n\n`[snippet](absent.js)`\n\n```js\n[example](absent.js)\n```\n');
  fs.writeFileSync(path.join(directory, 'page.md'), '# 重复标题\n\n## 重复标题\n');
  assert.deepEqual(checkDocs(directory).errors, []);
  fs.writeFileSync(path.join(directory, 'broken.md'), '# Broken\n\n[missing](absent.js)\n[anchor](README.md#unknown)\n[outside](../secret)\n');
  fs.writeFileSync(path.join(directory, 'fence.md'), '~~~js\nmissing closing fence\n');
  fs.writeFileSync(path.join(directory, 'encoding.md'), Buffer.from([0xc3, 0x28]));
  fs.writeFileSync(path.join(directory, 'bom.md'), '\uFEFF# BOM\n');
  const errors = checkDocs(directory).errors.join('\n');
  for (const expected of [/missing local destination/, /missing Markdown anchor/, /leaves repository/, /unclosed code fence/, /encoded data/, /BOM/]) assert.match(errors, expected);
});
