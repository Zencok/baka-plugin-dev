'use strict';
// Real QuickJS/SDK integration, following baka-plugins/tests/v2-native.test.cjs.
// No network music service is called; only a deterministic loopback fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { validatePage, capabilities } = require('../assets/authoring/check.cjs');
const run = promisify(execFile);
const probe = process.env.BAKA_V2_PROBE;
const authoring = path.join(__dirname, '../assets/authoring');

test('actual V2 host admission, templates, pagination, resolver context and SDK', { skip: !probe, timeout: 180000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-authoring-native-'));
  let sequence = 0;
  const requests = [];
  const serverErrors = [];
  const rows = [{ id: 7, title: 'Numeric fixture' }, { id: '7', title: 'String fixture' }];
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture.invalid');
      requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      response.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/v2/search') {
        const offset = Number(url.searchParams.get('cursor') || 0);
        const limit = Number(url.searchParams.get('limit'));
        assert.ok(Number.isInteger(offset) && offset >= 0 && offset <= rows.length);
        assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 100);
        const end = Math.min(offset + limit, rows.length);
        response.end(JSON.stringify({ items: rows.slice(offset, end), nextCursor: end < rows.length ? String(end) : null, total: rows.length }));
      } else if (url.pathname === '/v2/source') {
        response.end(JSON.stringify({ url: 'https://example.invalid/fixture.mp3', quality: url.searchParams.get('quality') }));
      } else { response.statusCode = 404; response.end('{}'); }
    } catch (error) {
      serverErrors.push(error);
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const settingsFile = path.join(directory, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ baseUrl: `http://127.0.0.1:${server.address().port}`, fixture: 'configured', audioUrl: 'https://audio.example.invalid/fixture.mp3', trackId: 'stable-track', title: 'Configured fixture' }));
  async function execute(source, capability, request = {}) {
    const call = String(sequence++);
    const sourceFile = path.join(directory, call + '.js');
    const requestFile = path.join(directory, call + '-request.json');
    const resultFile = path.join(directory, call + '-result.json');
    fs.writeFileSync(sourceFile, source);
    fs.writeFileSync(requestFile, JSON.stringify(request));
    // Async execFile is essential: the Node loopback server must keep running.
    const result = await run(probe, [sourceFile, ...(capability ? [capability, requestFile] : [])], {
      timeout: 15000,
      env: { ...process.env, BAKA_PROVIDER_SETTINGS_FILE: settingsFile,
        BAKA_PROVIDER_STORAGE: path.join(directory, 'storage'), BAKA_PROVIDER_RESULT_FILE: resultFile },
      maxBuffer: 1024 * 1024,
    });
    return { summary: JSON.parse(result.stdout.trim()), value: capability ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : undefined };
  }
  const sourceOf = name => fs.readFileSync(path.join(authoring, name + '.js'), 'utf8').replace(/\r\n/g, '\n');
  const minimal = sourceOf('minimal-provider');
  const manifest = { apiVersion: 2, kind: 'provider', sourceId: 'example', id: 'example.native.fixture',
    name: 'Native fixture', author: 'BakaMusic authoring toolkit', version: '1.0.0', capabilities: ['media.prepare'] };
  const synthetic = (handlers, changes = {}) => '// @baka-provider 2\nmodule.exports={manifest:'
    + JSON.stringify({ ...manifest, ...changes }) + ',handlers:' + handlers + '};\n';
  try {
    await t.test('bundled templates load with lean globals', async () => {
      for (const name of ['minimal-provider', 'minimal-resolver', 'full-provider', 'direct-url-provider']) {
        const { summary } = await execute(sourceOf(name));
        assert.equal(summary.lean, true, name);
        assert.equal(summary.providerId, ({ 'minimal-provider': 'example.v2.minimal', 'minimal-resolver': 'example.v2.resolver', 'full-provider': 'example.v2.full', 'direct-url-provider': 'org.example.direct-audio' })[name]);
      }
    });
    await t.test('configured direct URL template searches and resolves through actual QuickJS', async () => {
      const direct = sourceOf('direct-url-provider');
      const { value: page } = await execute(direct, 'search', { query: 'fixture', kind: 'music', cursor: null, limit: 1 });
      validatePage(page, null, 1);
      assert.equal(page.items[0].id, 'stable-track');
      assert.doesNotMatch(JSON.stringify(page), /https:/);
      const { value: entity } = await execute(direct, 'entities.get', { entity: { id: 'stable-track' } });
      assert.equal(entity.id, 'stable-track');
      const { value: source } = await execute(direct, 'media.resolve', { entity, quality: null });
      assert.equal(source.url, 'https://audio.example.invalid/fixture.mp3');
      assert.equal(source.quality, 'original');
      assert.equal((await execute(direct, 'entities.get', { entity: { id: 'missing' } })).value, null);
      assert.equal((await execute(direct, 'entities.get', { entity: { id: entity.id, kind: 'album' } })).value, null);
      assert.equal((await execute(direct, 'media.resolve', { entity: { id: entity.id, kind: 'lyric' }, quality: null })).value, null);
      await assert.rejects(execute(direct, 'search', { query: '', kind: 'lyric', cursor: null, limit: 1 }));
      assert.equal((await execute(direct, 'media.resolve', { entity, quality: 'master' })).value.quality, 'original');
      await assert.rejects(execute(direct, 'media.resolve', { entity, quality: 'invented' }));
    });
    await t.test('explicit authoring CLI admits unmodified files in the configured real host', async () => {
      const result = await run(process.execPath, [path.join(__dirname, '../scripts/check.cjs'), '--native', path.join(authoring, 'direct-url-provider.js')], {
        timeout: 20000, env: { ...process.env, BAKA_V2_PROBE: probe },
      });
      assert.match(result.stdout, /org\.example\.direct-audio: native QuickJS admission valid/);
      const flat = synthetic('{"entities.get":()=>null}', { capabilities: ['entities.get'], sourceId: 'cit.v1' });
      await assert.rejects(execute(flat), error => /missing V2 handler: entities.get/.test(error.stderr));
    });
    await t.test('old profiles, BOMs, identity aliases and invalid declarations fail', async () => {
      for (const source of ['\uFEFF' + minimal, '\n' + minimal, minimal.replace('provider 2', 'provider 1'),
        minimal.replace('// @baka-provider 2\n', ''), '// @name Legacy\nmodule.exports={search(){}}',
        minimal.replace("sourceId: 'example',", "sourceId: 'example', platform: 'example',"),
        minimal.replace("author: 'Example author',", ''),
        synthetic('{}')]) await assert.rejects(execute(source));
      await assert.rejects(execute(minimal, 'getMusicUrl', {}));
    });
    await t.test('actual HTTP search pages retain numeric and string IDs', async () => {
      const items = [];
      let cursor = null;
      do {
        const { value } = await execute(minimal, 'search', { query: 'Fixture', kind: 'music', cursor, limit: 1 });
        validatePage(value, cursor, 1);
        items.push(...value.items);
        cursor = value.nextCursor;
        assert.ok(items.length <= 2);
      } while (cursor !== null);
      assert.deepEqual(items, rows);
      assert.notEqual(typeof items[0].id, typeof items[1].id);
      assert.deepEqual(requests.filter(row => row.path === '/v2/search').map(row => row.query.cursor), ['', '1']);
    });
    await t.test('host enforces mandatory cursor/progress and bounded request/response limits', async () => {
      const request = { query: 'fixture', kind: 'music', cursor: 'repeat', limit: 1 };
      for (const page of [{ items: [] }, { items: [], nextCursor: 'next' }, { items: [], nextCursor: '' },
        { items: [1], nextCursor: 'repeat' }, { items: [1, 2], nextCursor: null },
        { items: [1], nextCursor: '界'.repeat(683) }, { items: [], nextCursor: null, total: -1 }]) {
        const source = synthetic('{search(){return ' + JSON.stringify(page) + ';}}', { capabilities: ['search'] });
        await assert.rejects(execute(source, 'search', request));
      }
      for (const limit of [0, 101, 1.5, '1']) await assert.rejects(execute(minimal, 'search', { ...request, cursor: null, limit }));
    });
    await t.test('provider-owned prepare context reaches only the explicitly called resolver', async () => {
      const entity = { id: 7, title: 'Fixture', providerData: { keep: true } };
      const { value: context } = await execute(minimal, 'media.prepare', { entity, quality: '320k' });
      assert.equal(context.musicId, 7);
      const request = { entity, quality: '320k', providerId: 'example.v2.minimal', sourceId: 'example', context };
      const { value } = await execute(sourceOf('minimal-resolver'), 'media.resolve', request);
      assert.equal(value.url, 'https://example.invalid/fixture.mp3');
      assert.equal(requests.at(-1).query.id, '7');
      await assert.rejects(execute(sourceOf('minimal-resolver'), 'media.resolve', { ...request, context: null }));
      await assert.rejects(execute(sourceOf('minimal-resolver'), 'media.resolve', { ...request, sourceId: 'other' }));
      for (const id of [7, '7']) {
        const { value: prepared } = await execute(minimal, 'media.prepare', { entity: { id }, quality: null });
        assert.equal(prepared.musicId, id);
      }
    });
    await t.test('all 26 complete-fixture transports run, with persistent fixture auth', async () => {
      const full = sourceOf('full-provider');
      const request = { query: 'Fixture', kind: 'music', cursor: null, limit: 1, entity: { id: 'track-1', type: 'music', mv: 'video-1' },
        quality: '320k', url: 'https://example.invalid/song/track-1', payload: { fixture: true } };
      await execute(full, 'auth.login', request);
      for (const capability of capabilities.filter(name => name !== 'auth.logout')) {
        const { value } = await execute(full, capability, { ...request, ...(capability === 'media.video' ? { quality: '720p' } : {}) });
        assert.notEqual(value, undefined, capability);
        if (capability.startsWith('discovery.') || ['search', 'collections.members', 'comments.list'].includes(capability)) validatePage(value, null, 1);
      }
      assert.equal((await execute(full, 'auth.logout', request)).value.authenticated, false);
      assert.equal((await execute(full, 'auth.status', request)).value.authenticated, false);
      await assert.rejects(execute(full, 'discovery.daily', request));
    });
    await t.test('real byte/text/crypto/storage SDK primitives preserve binary data', async () => {
      const handlers = `{media:{async prepare(_,sdk){
        const hex='0001ff80';
        const aes={mode:'cbc',keyHex:'00'.repeat(16),ivHex:'00'.repeat(16),dataHex:hex,padding:'pkcs7'};
        const encrypted=sdk.crypto.aesEncrypt(aes);
        const missing=(await sdk.storage.get('absent')) ?? null;
        await sdk.storage.set('value','persisted');
        const stored=await sdk.storage.get('value');
        await sdk.storage.remove('value');
        return {hex:sdk.bytes.encode(sdk.bytes.decode(hex,'base64'),'base64'),
          decompressed:sdk.bytes.decompress(sdk.bytes.compress(hex)),
          gb:sdk.bytes.decode('c4e3bac3','gb18030'),html:sdk.text.decodeHtml('&amp;&#x4F60;'),
          sm3:sdk.crypto.hash('sm3','616263'),encrypted,
          decrypted:sdk.crypto.aesDecrypt({...aes,dataHex:encrypted}),
          random:sdk.crypto.randomBytes(4),missing,stored,removed:(await sdk.storage.get('value')) ?? null,
          configured:sdk.settings.fixture,frozen:Object.isFrozen(sdk.settings)};
      }}}`;
      const { value } = await execute(synthetic(handlers), 'media.prepare', {});
      assert.equal(value.hex, '0001ff80');
      assert.equal(value.decompressed, value.hex);
      assert.equal(value.gb, '你好');
      assert.equal(value.html, '&你');
      assert.equal(value.sm3, '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0');
      const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.alloc(16), Buffer.alloc(16));
      assert.equal(value.encrypted, Buffer.concat([cipher.update(Buffer.from(value.hex, 'hex')), cipher.final()]).toString('hex'));
      assert.equal(value.decrypted, value.hex);
      assert.match(value.random, /^[a-f\d]{8}$/);
      assert.equal(value.missing, null);
      assert.equal(value.removed, null);
      assert.equal(value.stored, 'persisted');
      assert.equal(value.configured, 'configured');
      assert.equal(value.frozen, true);
    });
    assert.deepEqual(serverErrors, []);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
