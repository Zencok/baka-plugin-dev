'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { load, validate, getHandler, validatePage, createSDK } = require('../assets/authoring/check.cjs');
const authoring = path.join(__dirname, '../assets/authoring');
const direct = () => load(path.join(authoring, 'direct-url-provider.js'));
const sdk = () => createSDK({ audioUrl: 'https://audio.example.invalid/file.mp3?signature=fixture',
  trackId: 'stable-track', title: 'Configured song', artist: 'Fixture artist' });
const page = { query: 'song', kind: 'music', cursor: null, limit: 1 };

test('dotted declarations explain the nested handler required by native dispatch', () => {
  const p = load(path.join(authoring, 'minimal-provider.js'));
  p.handlers['media.resolve'] = p.handlers.media.resolve;
  delete p.handlers.media.resolve;
  assert.throws(() => validate(p), /flat.*media\.resolve.*handlers\.media\.resolve/i);
});
test('loader admits native-supported URL primitives without adding Node globals', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-authoring-url-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(authoring, 'minimal-provider.js'), 'utf8')
    .replace('module.exports = {', "const u = new URL('https://example.invalid'); const q = new URLSearchParams({a:'b'});\nif(typeof require!=='undefined'||typeof Buffer!=='undefined')throw Error('Node leak');\nmodule.exports = {");
  const file = path.join(directory, 'url.js'); fs.writeFileSync(file, source);
  assert.equal(load(file).manifest.apiVersion, 2);
});
test('native checking cannot silently degrade to Node-only validation', () => {
  const env = { ...process.env }; delete env.BAKA_V2_PROBE;
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/check.cjs'), '--native',
    path.join(authoring, 'minimal-provider.js')], { encoding: 'utf8', env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BAKA_V2_PROBE/);
  assert.doesNotMatch(result.stdout, /native QuickJS admission valid/);
});
test('direct URL template requires configuration and rejects unsupported search kinds', async () => {
  const search = getHandler(direct(), 'search');
  assert.throws(() => search(page, createSDK()), /audioUrl/);
  assert.throws(() => search({ ...page, kind: 'lyric' }, sdk()), /Unsupported search kind/);
  for (const audioUrl of ['file:///private/song.mp3', 'javascript:alert(1)', 'not a URL']) {
    assert.throws(() => search(page, createSDK({ audioUrl })), /HTTP\(S\)/);
  }
});
test('direct URL template searches configured metadata without leaking signed URLs', () => {
  const plugin = direct();
  const result = getHandler(plugin, 'search')(page, sdk());
  validatePage(result, null, 1);
  assert.equal(result.items[0].id, 'stable-track');
  assert.equal(result.items[0].type, 'music');
  assert.doesNotMatch(JSON.stringify(result), /signature|https:/);
  assert.equal(getHandler(plugin, 'search')({ ...page, query: 'missing' }, sdk()).items.length, 0);
  assert.throws(() => getHandler(plugin, 'search')({ ...page, cursor: '1' }, sdk()), /cursor/);
});
test('direct URL template resolves only exact entity identity and actual quality', () => {
  const plugin = direct();
  const entity = { id: 'stable-track', type: 'music' };
  assert.equal(getHandler(plugin, 'entities.get')({ entity: { id: 'missing' } }, sdk()), null);
  assert.equal(getHandler(plugin, 'entities.get')({ entity: { id: entity.id, kind: 'album' } }, sdk()), null);
  assert.equal(getHandler(plugin, 'media.resolve')({ entity: { id: entity.id, type: 'lyric' }, quality: null }, sdk()), null);
  assert.equal(getHandler(plugin, 'media.resolve')({ entity: { id: 7 }, quality: null }, sdk()), null);
  const result = getHandler(plugin, 'media.resolve')({ entity, quality: null }, sdk());
  assert.equal(result.quality, 'original');
  assert.equal(result.url, sdk().settings.audioUrl);
  assert.equal(plugin.manifest.supportedQualities, undefined);
  for (const quality of ['master', 'flac', '128k', 'original']) {
    assert.equal(getHandler(plugin, 'media.resolve')({ entity, quality }, sdk()).quality, 'original');
  }
  assert.throws(() => getHandler(plugin, 'media.resolve')({ entity, quality: 'invented' }, sdk()), /Unknown audio quality/);
});
test('HTTP scaffold advertises only music and validates raw IDs, cursors and errors', async () => {
  const plugin = load(path.join(authoring, 'minimal-provider.js'));
  const search = getHandler(plugin, 'search');
  assert.deepEqual(Array.from(plugin.manifest.supportedSearchType), ['music']);
  const transport = body => ({ ...createSDK(), http: { async request() { return { status: 200, body }; } } });
  const items = [{ id: 0, title: 'Zero' }, { id: 7, title: 'Number' }, { id: '7', title: 'String' }];
  const valid = await search({ ...page, limit: 3 }, transport({ items, nextCursor: null }));
  assert.equal(valid.items[0].id, 0);
  assert.equal(valid.items[1].id, 7);
  assert.equal(valid.items[2].id, '7');
  await assert.rejects(search({ ...page, kind: 'lyric' }, transport({})), /Unsupported search kind/);
  for (const body of [{ items }, { items, nextCursor: null }, { items: [], nextCursor: 'next' },
    { items: [], nextCursor: null, total: -1 }, { items: [{ id: '' }], nextCursor: null }]) {
    await assert.rejects(search(page, transport(body)));
  }
  for (const [status, code] of [[401, 'authentication_required'], [403, 'permission_denied'],
    [429, 'rate_limited'], [503, 'temporary_unavailable']]) {
    await assert.rejects(search(page, { ...createSDK(), http: { async request() { return { status, body: {} }; } } }),
      error => error.code === code);
  }
  await assert.rejects(search(page, transport({ error: { code: 'quality_unavailable' } })),
    error => error.code === 'quality_unavailable');
});

test('HTTP scaffold binds opaque cursors to query, limit and current source/account settings', async () => {
  const search = getHandler(load(path.join(authoring, 'minimal-provider.js')), 'search');
  const configured = createSDK({ baseUrl: 'https://example.invalid', account: 'fixture-private-account' });
  const first = await search({ ...page, query: 'Fixture' }, configured);
  assert.doesNotMatch(first.nextCursor, /fixture-private-account/);
  const second = await search({ ...page, query: 'Fixture', cursor: first.nextCursor }, configured);
  assert.equal(second.items[0].id, '2');
  assert.equal(second.nextCursor, null);
  const calls = configured.calls.length;
  for (const changed of [{ query: 'other' }, { limit: 2 }]) {
    await assert.rejects(search({ ...page, query: 'Fixture', cursor: first.nextCursor, ...changed }, configured), /stale/);
  }
  assert.equal(configured.calls.length, calls, 'stale context rejected before HTTP');
  await assert.rejects(search({ ...page, query: 'Fixture', cursor: first.nextCursor },
    createSDK({ baseUrl: 'https://example.invalid', account: 'another-account' })), /stale/);
  const oversized = { ...createSDK(), http: { async request() {
    return { status: 200, body: { items: [{ id: 0 }], nextCursor: 'x'.repeat(2048) } };
  } } };
  await assert.rejects(search(page, oversized), /byte limit/);
});

test('application import command fails explicitly when its target is not configured', () => {
  const env = { ...process.env }; delete env.BAKA_FLUTTER_APP; delete env.BAKA_FLUTTER_SDK;
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/run-import.cjs')], { encoding: 'utf8', env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /application import verification was not run/);
});
