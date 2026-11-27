'use strict';

// Publication/cutover contract. This is not a legacy script adapter or a loader.
const assert = require('node:assert/strict');
const capabilities = Object.freeze([
  'search', 'entities.get', 'collections.get', 'collections.members',
  'discovery.charts', 'discovery.chartTags', 'discovery.playlistTags',
  'discovery.playlists', 'discovery.hotSearch', 'discovery.recommendations',
  'discovery.daily', 'discovery.similar', 'discovery.searchSuggestions',
  'media.prepare', 'media.resolve', 'media.video', 'media.license', 'lyrics.get',
  'comments.list', 'links.resolve', 'links.share', 'recognition.identify',
  'auth.login', 'auth.callback', 'auth.logout', 'auth.status',
]);
const resolverCapabilities = new Set(['media.resolve', 'media.video', 'media.license']);
const packagePattern = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const sourcePattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function packageId(value) {
  assert.ok(typeof value === 'string' && value.length <= 128 && packagePattern.exec(value)?.[0] === value, 'invalid package id');
  return value;
}
function sourceId(value) {
  assert.ok(typeof value === 'string' && value.length <= 64 && sourcePattern.exec(value)?.[0] === value, 'invalid sourceId');
  return value;
}
function text(value, max, label) {
  assert.ok(typeof value === 'string' && !/^[\s\u0085]*$/u.test(value) && [...value].length <= max, 'invalid ' + label);
}
function snapshot(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { assert.ok(Number.isFinite(value), 'non-JSON metadata number'); return value; }
  assert.ok(value && typeof value === 'object' && !ancestors.has(value), 'metadata must be acyclic JSON');
  assert.ok(Array.isArray(value) || Object.prototype.toString.call(value) === '[object Object]', 'metadata must use JSON objects');
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assert.ok(Object.hasOwn(value, index), 'sparse metadata arrays are not JSON');
    assert.equal(Object.keys(value).length, value.length, 'metadata array has extra fields');
  }
  ancestors.add(value);
  const result = Array.isArray(value) ? value.map(child => snapshot(child, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, snapshot(child, ancestors)]));
  ancestors.delete(value);
  return Object.freeze(result);
}
function validateManifest(input) {
  assert.ok(input && typeof input === 'object' && !Array.isArray(input), 'manifest object required');
  text(input.author, 256, 'author');
  const m = snapshot(input);
  assert.equal(m.apiVersion, 2, 'manifest.apiVersion must be 2');
  packageId(m.id);
  assert.ok(m.kind === 'provider' || m.kind === 'resolver', 'manifest.kind must be provider or resolver');
  text(m.name, 128, 'name');
  text(m.author, 256, 'author');
  const version = typeof m.version === 'string' && semverPattern.exec(m.version);
  assert.ok(version && version[0] === m.version && !(version[4] || '').split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === '0'), 'invalid semantic version');
  for (const alias of ['platform', 'providerId', 'legacyPlatforms']) {
    assert.ok(!Object.hasOwn(m, alias), 'obsolete manifest identity alias: ' + alias);
  }
  assert.ok(Array.isArray(m.capabilities) && m.capabilities.length, 'nonempty capabilities array required');
  assert.equal(new Set(m.capabilities).size, m.capabilities.length, 'duplicate capability');
  for (const cap of m.capabilities) assert.ok(capabilities.includes(cap), 'unknown capability: ' + cap);
  if (m.kind === 'provider') {
    sourceId(m.sourceId);
    assert.ok(!Object.hasOwn(m, 'sources'), 'provider cannot declare resolver sources');
  } else {
    assert.ok(!Object.hasOwn(m, 'sourceId'), 'resolver cannot declare provider sourceId');
    assert.ok(Array.isArray(m.sources) && m.sources.length, 'nonempty resolver sources required');
    assert.equal(new Set(m.sources).size, m.sources.length, 'duplicate resolver source');
    m.sources.forEach(sourceId);
    assert.ok(m.capabilities.includes('media.resolve'), 'resolver must resolve media');
    for (const cap of m.capabilities) assert.ok(resolverCapabilities.has(cap), 'resolver cannot own capability: ' + cap);
  }
  return m;
}

function validateEntityRef(input) {
  assert.ok(input && typeof input === 'object' && !Array.isArray(input), 'entity reference required');
  assert.deepEqual(Object.keys(input).sort(), ['id', 'kind', 'providerId'], 'entity reference fields');
  packageId(input.providerId);
  assert.ok(['music', 'album', 'artist', 'sheet', 'lyric', 'chart'].includes(input.kind), 'invalid entity kind');
  assert.ok(typeof input.id === 'string' && input.id.length > 0 || Number.isSafeInteger(input.id), 'entity id must be nonempty string or safe integer');
  return Object.freeze({ providerId: input.providerId, kind: input.kind, id: input.id === 0 ? 0 : input.id });
}

function resolveBinding(binding, packages) {
  assert.ok(binding && typeof binding === 'object' && !Array.isArray(binding), 'binding required');
  assert.deepEqual(Object.keys(binding).sort(), ['providerId', 'resolverId'], 'binding fields');
  packageId(binding.providerId);
  packageId(binding.resolverId);
  const registry = new Map();
  for (const item of packages) {
    assert.equal(typeof item.enabled, 'boolean', 'package enabled flag required');
    const manifest = validateManifest(item.manifest);
    assert.ok(!registry.has(manifest.id), 'duplicate package identity');
    registry.set(manifest.id, { manifest, enabled: item.enabled });
  }
  const provider = registry.get(binding.providerId);
  const resolver = registry.get(binding.resolverId);
  assert.ok(provider?.enabled && provider.manifest.kind === 'provider', 'bound provider unavailable');
  assert.ok(resolver?.enabled && resolver.manifest.kind === 'resolver', 'bound resolver unavailable');
  assert.ok(resolver.manifest.sources.includes(provider.manifest.sourceId), 'incompatible resolver source');
  assert.ok(provider.manifest.capabilities.includes('media.prepare'), 'provider cannot prepare resolver context');
  return Object.freeze({ provider: provider.manifest, resolver: resolver.manifest });
}

module.exports = { capabilities, validateManifest, validateEntityRef, resolveBinding };
