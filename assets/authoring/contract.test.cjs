'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateManifest, validateEntityRef, resolveBinding } = require('./contract.cjs');
const { load, getHandler, createSDK } = require('./check.cjs');
const vectors = require('./contract-vectors.json');
const provider = vectors.validManifests[0];
const resolver = vectors.validManifests[1];
const binding = { providerId: provider.id, resolverId: resolver.id };
const registry = () => [provider, resolver].map(manifest => ({ manifest, enabled: true }));

test('shared native/Dart/publication manifest vectors agree', () => {
  for (const manifest of vectors.validManifests) {
    assert.deepEqual(validateManifest(manifest), manifest, manifest.id);
  }
  for (const { name, manifest } of vectors.invalidManifests) {
    assert.throws(() => validateManifest(manifest), undefined, name);
  }
  for (const ref of vectors.validEntityRefs) assert.deepEqual(validateEntityRef(ref), ref);
  for (const { name, entityRef } of vectors.invalidEntityRefs) {
    assert.throws(() => validateEntityRef(entityRef), undefined, name);
  }
});

test('validated metadata is an immutable independent snapshot', () => {
  const input = JSON.parse(JSON.stringify(provider));
  const result = validateManifest(input);
  input.hints.import[0] = 'changed';
  input.userVariables[0].hint = 'changed';
  input.capabilities.length = 0;
  assert.equal(result.hints.import[0], provider.hints.import[0]);
  assert.equal(result.userVariables[0].hint, provider.userVariables[0].hint);
  assert.throws(() => { result.userVariables[0].hint = 'mutated'; }, TypeError);
  assert.throws(() => { result.capabilities.push('search'); }, TypeError);
  const cycle = {}; cycle.self = cycle;
  for (const metadata of [cycle, () => {}, NaN, BigInt(1), undefined,
    new Date(), new Map([['key', 'value']]), new Set([1]), Array(1)]) {
    assert.throws(() => validateManifest({ ...provider, metadata }));
  }
});

test('binding uses exact package ownership and declared protocol compatibility', () => {
  const selected = resolveBinding(binding, registry());
  assert.equal(selected.provider.id, provider.id);
  assert.equal(selected.resolver.id, resolver.id);
  const changed = registry();
  changed[0].manifest = { ...provider, name: 'Renamed', srcUrl: 'https://new.invalid/plugin.js' };
  assert.equal(resolveBinding(binding, changed).provider.id, provider.id);
  assert.throws(() => resolveBinding({ ...binding, providerId: provider.name }, registry()));
  assert.throws(() => resolveBinding({ ...binding, providerId: 'org.other.qq' }, registry()));
  assert.throws(() => resolveBinding({ providerId: resolver.id, resolverId: provider.id }, registry()));
  assert.throws(() => resolveBinding({ ...binding, platform: 'qq' }, registry()));
  const duplicate = registry(); duplicate.push({ ...duplicate[0] });
  assert.throws(() => resolveBinding(binding, duplicate));
  for (const index of [0, 1]) {
    const disabled = registry(); disabled[index].enabled = false;
    assert.throws(() => resolveBinding(binding, disabled));
  }
  const incompatible = registry();
  incompatible[1].manifest = { ...resolver, sources: ['kg'] };
  assert.throws(() => resolveBinding(binding, incompatible));
  const unprepared = registry();
  unprepared[0].manifest = { ...provider, capabilities: ['media.resolve'] };
  assert.throws(() => resolveBinding(binding, unprepared));
});

test('entity references preserve raw ID type, provider and kind', () => {
  const number = validateEntityRef({ providerId: provider.id, kind: 'music', id: 42 });
  const string = validateEntityRef({ ...number, id: '42' });
  assert.notEqual(JSON.stringify(number), JSON.stringify(string));
  assert.notEqual(JSON.stringify(number), JSON.stringify(validateEntityRef({ ...number, providerId: 'org.other.qq' })));
  assert.notEqual(JSON.stringify(number), JSON.stringify(validateEntityRef({ ...number, kind: 'album' })));
  for (const id of [null, true, false, [], {}, '', 0.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    assert.throws(() => validateEntityRef({ ...number, id }));
  }
  assert.equal(validateEntityRef({ ...number, id: '长'.repeat(1000) }).id.length, 1000);
  assert.throws(() => validateEntityRef({ ...number, platform: 'QQ' }));
});

test('provider prepares context and bound resolver changes media only', async () => {
  const catalog = load(path.join(__dirname, 'minimal-provider.js'));
  const transport = load(path.join(__dirname, 'minimal-resolver.js'));
  const packages = [catalog, transport].map(item => ({ manifest: item.manifest, enabled: true }));
  const selected = resolveBinding({ providerId: catalog.manifest.id, resolverId: transport.manifest.id }, packages);
  const entity = { id: 42, title: 'Song', providerData: { opaque: true } };
  const original = JSON.stringify(entity);
  const sdk = createSDK();
  const context = await getHandler(catalog, 'media.prepare')({ entity, quality: '320k' }, sdk);
  assert.equal(context.musicId, 42);
  const result = await getHandler(transport, 'media.resolve')({
    entity, quality: '320k', providerId: selected.provider.id,
    sourceId: selected.provider.sourceId, context,
  }, sdk);
  assert.equal(result.url, 'https://example.invalid/fixture.mp3');
  assert.equal(JSON.stringify(entity), original);
  assert.equal(catalog.manifest.id, selected.provider.id);
  await assert.rejects(() => getHandler(transport, 'media.resolve')({ entity }, sdk), /context/);
  sdk.http.request = async () => { throw new Error('Selected resolver unavailable'); };
  await assert.rejects(() => getHandler(transport, 'media.resolve')({
    entity, context, sourceId: 'example', quality: '320k',
  }, sdk), /Selected resolver unavailable/);
});
