#!/usr/bin/env node
'use strict';
// Derived from BakaMusicFlutter authoring/check.cjs; see UPSTREAM.json and NOTICE.
// Node authoring fixture, not the QuickJS sandbox. Execute trusted source only:
// node:vm is not a security boundary and async handlers have no VM timeout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { capabilities, validateManifest } = require('./contract.cjs');
const paged = new Set(['search', 'collections.members', 'comments.list',
  ...capabilities.filter(name => name.startsWith('discovery.'))]);
function getHandler(provider, name) {
  const parts = name.split('.');
  const owner = parts.slice(0, -1).reduce((value, key) => value && value[key], provider.handlers);
  const handler = owner && owner[parts.at(-1)];
  return typeof handler === 'function' ? handler.bind(owner) : handler;
}
function validate(provider) {
  assert.ok(provider && typeof provider === 'object', 'plugin export object required');
  const m = validateManifest(provider.manifest);
  assert.ok(provider.handlers && typeof provider.handlers === 'object', 'handlers object required');
  for (const name of m.capabilities) {
    assert.ok(capabilities.includes(name), 'unknown capability ' + name);
    assert.equal(typeof getHandler(provider, name), 'function', 'missing handler ' + name);
  }
  // Match host dispatch: only declared capabilities must be callable. Helpers
  // under handlers are ignored; they do not become public capabilities.
  return provider;
}
function validatePage(result, requestCursor = null, limit = 100) {
  assert.ok(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'request limit must be 1..100');
  assert.ok(requestCursor === null || typeof requestCursor === 'string' && requestCursor.length > 0
    && Buffer.byteLength(requestCursor, 'utf8') <= 2048, 'invalid request cursor');
  assert.ok(result && Array.isArray(result.items), 'page.items must be array');
  assert.ok(result.items.length <= limit, 'page exceeds requested limit');
  assert.ok(Object.hasOwn(result, 'nextCursor'), 'page.nextCursor is mandatory');
  assert.ok(result.nextCursor === null || typeof result.nextCursor === 'string' && result.nextCursor.length > 0,
    'page.nextCursor must be null or a nonempty string');
  if (result.nextCursor !== null) {
    assert.ok(Buffer.byteLength(result.nextCursor, 'utf8') <= 2048, 'cursor exceeds native byte limit');
    assert.ok(result.items.length, 'nonfinal page must make progress');
    assert.notEqual(result.nextCursor, requestCursor, 'page repeats request cursor');
  }
  // Authoring guard: JS cannot reliably count totals beyond its safe integer range.
  if (Object.hasOwn(result, 'total')) assert.ok(Number.isSafeInteger(result.total) && result.total >= 0, 'page.total');
}
function load(file) {
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file));
  assert.equal(source.split(/\r?\n/, 1)[0], '// @baka-provider 2', 'exact first-line V2 source profile marker (no BOM)');
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source, sandbox, { filename: file, timeout: 1000 });
  return validate(sandbox.module.exports);
}
function createSDK(settings = {}) {
  const storage = new Map();
  const calls = [];
  return {
    settings: Object.freeze({ ...settings }),
    calls,
    http: { async request(request) {
      calls.push(request);
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://example.invalid');
      if (url.pathname === '/v2/source') return { status: 200, headers: {}, body: {
        url: 'https://example.invalid/fixture.mp3', quality: url.searchParams.get('quality') } };
      assert.equal(url.pathname, '/v2/search');
      const offset = Number(url.searchParams.get('cursor') || 0);
      const limit = Number(url.searchParams.get('limit'));
      const items = [1, 2].map(id => ({ id: String(id), title: 'Fixture song ' + id, duration: 180 }));
      const end = Math.min(offset + limit, items.length);
      return { status: 200, headers: {}, body: { items: items.slice(offset, end),
        nextCursor: end < items.length ? String(end) : null, total: items.length } };
    } },
    // Authoring helpers only; native limits/errors are verified in Rust tests.
    bytes: {
      encode(value, encoding = 'utf8') {
        assert.ok(['utf8', 'utf-8', 'base64', 'hex'].includes(encoding), 'unsupported input encoding');
        if (encoding === 'hex') assert.match(value, /^(?:[0-9a-fA-F]{2})*$/, 'invalid hex');
        if (encoding === 'base64') assert.match(value, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'invalid base64');
        return Buffer.from(value, encoding).toString('hex');
      },
      decode(hex, encoding = 'utf8') {
        assert.match(hex, /^(?:[0-9a-fA-F]{2})*$/, 'invalid hex');
        const bytes = Buffer.from(hex, 'hex');
        return encoding === 'hex' || encoding === 'base64'
          ? bytes.toString(encoding) : new TextDecoder(encoding).decode(bytes);
      },
      compress(hex, format = 'zlib') {
        assert.equal(format, 'zlib', 'unsupported compression');
        assert.match(hex, /^(?:[0-9a-fA-F]{2})*$/, 'invalid hex');
        assert.ok(hex.length <= 32 * 1024 * 1024, 'byte input exceeds limit');
        const compressed = zlib.deflateSync(Buffer.from(hex, 'hex'));
        assert.ok(compressed.length <= 16 * 1024 * 1024, 'byte output exceeds limit');
        return compressed.toString('hex');
      },
      decompress(hex, format = 'zlib') {
        assert.equal(format, 'zlib', 'unsupported compression');
        assert.match(hex, /^(?:[0-9a-fA-F]{2})*$/, 'invalid hex');
        return zlib.inflateSync(Buffer.from(hex, 'hex'), { maxOutputLength: 16 * 1024 * 1024 }).toString('hex');
      },
    },
    text: {
      decodeHtml() { throw new Error('HTML entities are tested by the native host, not this fixture'); },
    },
    crypto: {
      hash: (algorithm, hex) => crypto.createHash(algorithm).update(Buffer.from(hex, 'hex')).digest('hex'),
      hmacSha256: (key, hex) => crypto.createHmac('sha256', Buffer.from(key, 'hex')).update(Buffer.from(hex, 'hex')).digest('hex'),
      randomBytes: size => crypto.randomBytes(size).toString('hex'),
      aesEncrypt() { throw new Error('AES is tested by the native host, not this fixture'); },
      aesDecrypt() { throw new Error('AES is tested by the native host, not this fixture'); },
    },
    storage: { async get(key) { return storage.get(key) ?? null; },
      async set(key, value) { assert.equal(typeof value, 'string'); storage.set(key, value); },
      async remove(key) { storage.delete(key); } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
}
async function smoke(file) {
  const provider = load(file);
  const sdk = createSDK();
  const track = { id: 'track-1', type: 'music', title: 'Fixture song', mv: 'video-1' };
  const base = { query: 'Fixture', kind: 'music', cursor: null, limit: 1,
    entity: track, quality: '320k', url: 'https://example.invalid/song/track-1',
    ...(provider.manifest.kind === 'resolver' ? {
      providerId: 'example.v2.minimal', sourceId: 'example', context: { musicId: track.id },
    } : {}),
    payload: { fixture: true, format: 's16le', sampleRate: 16000, channels: 1, dataHex: '0000' } };
  if (getHandler(provider, 'auth.login')) await getHandler(provider, 'auth.login')(base, sdk);
  let count = 0;
  for (const name of provider.manifest.capabilities) {
    const handler = getHandler(provider, name);
    // Exercise logout last so daily can observe the fixture session.
    if (name === 'auth.logout') continue;
    const result = await handler({ ...base, ...(name === 'media.video' ? { quality: '720p' } : {}) }, sdk);
    assert.notEqual(result, undefined, name + ' returned undefined');
    if (paged.has(name)) {
      validatePage(result, null, base.limit);
      const seen = new Set();
      let current = result;
      while (current.nextCursor !== null) {
        assert.ok(!seen.has(current.nextCursor), name + ' cursor cycle');
        seen.add(current.nextCursor);
        assert.ok(seen.size <= 100, name + ' exceeded fixture page bound');
        const cursor = current.nextCursor;
        current = await handler({ ...base, cursor }, sdk);
        validatePage(current, cursor, base.limit);
      }
    }
    count++;
  }
  if (getHandler(provider, 'auth.logout')) {
    await getHandler(provider, 'auth.logout')(base, sdk);
    assert.equal((await getHandler(provider, 'auth.status')(base, sdk)).authenticated, false);
    await assert.rejects(() => getHandler(provider, 'discovery.daily')(base, sdk), /Authentication/);
    count++;
  }
  if (provider.manifest.id === 'example.v2.full') {
    assert.equal(await getHandler(provider, 'media.resolve')({ entity: track, quality: 'flac' }, sdk), null);
    assert.equal(await getHandler(provider, 'media.video')({ entity: track, quality: '1080p' }, sdk), null);
    assert.equal((await getHandler(provider, 'media.video')({ entity: track, quality: '720p' }, sdk)).quality, '720p');
  }
  console.log(path.basename(file) + ': ' + count + ' declared handlers passed fixture smoke checks');
  return { provider, count };
}
async function main(files = process.argv.slice(2)) {
  if (files.length) {
    for (const file of files) { const provider = load(path.resolve(file)); console.log(provider.manifest.id + ': manifest/handler structure valid'); }
    return;
  }
  const sdk = createSDK();
  assert.equal(sdk.bytes.encode('abc'), '616263');
  assert.equal(sdk.bytes.decode('00ff80', 'base64'), 'AP+A');
  assert.equal(sdk.bytes.encode('AP+A', 'base64'), '00ff80');
  assert.equal(sdk.bytes.decode('c4e3bac3', 'gb18030'), '\u4f60\u597d');
  assert.equal(sdk.bytes.decompress(zlib.deflateSync(Buffer.from([0, 255, 128])).toString('hex')), '00ff80');
  assert.equal(sdk.crypto.hash('sm3', '616263'), '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0');
  // Negative contract checks ensure the checker actually catches malformed pages.
  for (const value of [{ items: [] }, { items: [], nextCursor: '' }, { items: [], nextCursor: false },
    { items: [], nextCursor: 'no-progress' }, { items: [], nextCursor: null, total: -1 }]) assert.throws(() => validatePage(value));
  await smoke(path.join(__dirname, 'minimal-provider.js'));
  await smoke(path.join(__dirname, 'minimal-resolver.js'));
  await smoke(path.join(__dirname, 'full-provider.js'));
  for (const author of [undefined, '', '   ', 42]) {
    const unattributed = load(path.join(__dirname, 'minimal-provider.js'));
    unattributed.manifest.author = author;
    assert.throws(() => validate(unattributed), /author/);
  }
  const bad = load(path.join(__dirname, 'minimal-provider.js'));
  bad.manifest.capabilities.push('unsupported.method');
  assert.throws(() => validate(bad));
  console.log('Negative page/capability checks passed. No remote service or device was exercised.');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { capabilities, paged, getHandler, validate, validatePage, load, createSDK, smoke, main };
