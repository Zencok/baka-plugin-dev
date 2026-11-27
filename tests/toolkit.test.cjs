'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { capabilities, load, validate, validatePage, getHandler, createSDK, smoke } = require('../assets/authoring/check.cjs');
const root = path.join(__dirname, '..');
const authoring = path.join(root, 'assets/authoring');

test('all three bundled templates execute their declared fixture transports', async () => {
  for (const [file, expected] of [['minimal-provider.js', 3], ['minimal-resolver.js', 1], ['full-provider.js', 26]]) {
    const result = await smoke(path.join(authoring, file));
    assert.equal(result.count, expected);
  }
  assert.deepEqual(Array.from(load(path.join(authoring, 'full-provider.js')).manifest.capabilities).sort(), [...capabilities].sort());
});

test('complete fixture search returns its declared entity kinds and rejects unsupported kinds', () => {
  const plugin = load(path.join(authoring, 'full-provider.js'));
  assert.deepEqual(Array.from(plugin.manifest.supportedSearchType), ['music', 'album', 'artist', 'sheet']);
  const search = getHandler(plugin, 'search');
  for (const kind of plugin.manifest.supportedSearchType) {
    const result = search({ kind, query: 'Fixture', cursor: null, limit: 100 });
    assert.ok(result.items.length > 0, kind);
    assert.ok(result.items.every(item => item.type === kind), kind);
  }
  for (const kind of ['lyric', 'unknown']) {
    assert.throws(() => search({ kind, query: 'Fixture', cursor: null, limit: 100 }), /Unsupported search kind/);
  }
});

test('only exact no-BOM V2 source is admitted, including at the CLI entry point', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-authoring-format-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(authoring, 'minimal-provider.js'), 'utf8').replace(/\r\n/g, '\n');
  const file = path.join(directory, 'provider with spaces.js');
  for (const invalid of ['\uFEFF' + source, '\n' + source, source.replace('provider 2', 'provider 1'),
    source.replace('// @baka-provider 2\n', ''), '// @name Legacy\nmodule.exports={search(){}}',
    source.replace("sourceId: 'example',", "sourceId: 'example', platform: 'example',")]) {
    fs.writeFileSync(file, invalid);
    assert.throws(() => load(file));
  }
  fs.writeFileSync(file, Buffer.from([0xff, 0xfe, 0x61]));
  assert.throws(() => load(file), /encoded data/);
  fs.writeFileSync(file, source.replace(/\r?\n/g, '\r\n'));
  assert.equal(load(file).manifest.id, 'example.v2.minimal');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check.cjs'), file], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manifest\/handler structure valid/);
});

test('declaration checks and owner binding follow host dispatch rather than exposing helper methods', () => {
  const plugin = load(path.join(authoring, 'minimal-provider.js'));
  plugin.handlers.media.helper = () => 'internal';
  plugin.handlers.media.value = 42;
  plugin.handlers.media.prepare = function () { return { id: this.value }; };
  assert.equal(validate(plugin), plugin);
  assert.equal(getHandler(plugin, 'media.prepare')().id, 42);
  delete plugin.handlers.media.resolve;
  assert.throws(() => validate(plugin), /missing handler media.resolve/);
});

test('pagination rejects malformed, oversized and stalled pages and requests', () => {
  const bad = [null, {}, { items: [] }, { items: [], nextCursor: false }, { items: [], nextCursor: '' },
    { items: [], nextCursor: 'more' }, { items: [1, 2], nextCursor: null },
    { items: [1], nextCursor: 'cursor' }, { items: [1], nextCursor: '界'.repeat(683) },
    { items: [], nextCursor: null, total: -1 }, { items: [], nextCursor: null, total: 0.5 },
    { items: [], nextCursor: null, total: null }, { items: [], nextCursor: null, total: undefined }];
  for (const page of bad) assert.throws(() => validatePage(page, 'cursor', 1));
  for (const limit of [0, 101, '1', 1.5, NaN]) assert.throws(() => validatePage({ items: [], nextCursor: null }, null, limit));
  for (const cursor of ['', false, {}, 'x'.repeat(2049)]) assert.throws(() => validatePage({ items: [], nextCursor: null }, cursor));
  validatePage({ items: [1], nextCursor: 'next', total: 2 }, null, 1);
  validatePage({ items: [], nextCursor: null, total: 0 }, 'last', 1);
});

test('fixture byte compression preserves binary data; unsupported services are explicit', async () => {
  const sdk = createSDK({ baseUrl: 'https://example.invalid' });
  const data = '0001ff80c4e3bac3';
  assert.equal(sdk.bytes.decompress(sdk.bytes.compress(data)), data);
  assert.equal(sdk.bytes.encode(sdk.bytes.decode(data, 'base64'), 'base64'), data);
  for (const hex of ['x0', '0', 'gg']) assert.throws(() => sdk.bytes.compress(hex));
  assert.throws(() => sdk.bytes.compress(data, 'gzip'));
  assert.throws(() => sdk.text.decodeHtml('&amp;'), /native host/);
  await sdk.storage.set('key', 'value');
  assert.equal(await sdk.storage.get('key'), 'value');
  await sdk.storage.remove('key');
  assert.equal((await sdk.storage.get('key')) ?? null, null);
  await assert.rejects(() => sdk.storage.set('key', {}));
});

test('every distributed JavaScript file parses without a dependency install', () => {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:cjs|js)$/.test(entry.name)) files.push(file);
    }
  }
  visit(root);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, path.relative(root, file) + ': ' + result.stderr);
  }
});

test('explicit native command fails clearly when the probe is unconfigured', () => {
  const env = { ...process.env };
  delete env.BAKA_V2_PROBE;
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/run-native.cjs')], { encoding: 'utf8', env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Native verification was not run/);
});

test('UPSTREAM snapshot records match the bundled authoring files', () => {
  const upstream = JSON.parse(fs.readFileSync(path.join(root, 'UPSTREAM.json'), 'utf8'));
  assert.equal(upstream.schemaVersion, 1);
  for (const file of upstream.authoringFiles) {
    assert.match(file.upstreamSha256, /^[a-f\d]{64}$/);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file.path), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
    assert.equal(actual, file.bundledSha256, file.path);
  }
});
