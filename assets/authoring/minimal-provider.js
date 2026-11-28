// @baka-provider 2
// HTTP ADAPTER SCAFFOLD, not a bundled live music service. Replace the endpoint
// and mappings with your authorized service; test them before declaring support.
// Generic source protocol 'example' demonstrates prepare/resolver contracts only;
// it does not grant this package the application's public LX binding eligibility.
// @ts-check
const failureCodes = ['quality_unavailable', 'track_unavailable', 'authentication_required',
  'permission_denied', 'rate_limited', 'temporary_unavailable', 'signature_expired'];
function searchCursor(request, sdk) {
  // Bind source/configuration and query without exposing settings in the cursor.
  // If auth state is stored outside settings, also include its account/revision
  // namespace here. This is context validation, not a substitute for service auth.
  const settings = Object.keys(sdk.settings).sort().map(key => [key, sdk.settings[key]]);
  const scope = sdk.crypto.hash('sha256', sdk.bytes.encode(JSON.stringify([
    request.query, request.kind, request.limit, settings,
  ])));
  if (request.cursor === null) return { scope, upstream: null };
  let cursor;
  try { cursor = JSON.parse(request.cursor); } catch (_) { throw new Error('Invalid search cursor'); }
  if (!cursor || cursor.v !== 1 || cursor.scope !== scope
    || typeof cursor.upstream !== 'string' || !cursor.upstream.length) {
    throw new Error('Invalid or stale search cursor for this query/configuration');
  }
  return { scope, upstream: cursor.upstream };
}
async function getJson(sdk, route) {
  const baseUrl = sdk.settings.baseUrl || 'https://example.invalid';
  const response = await sdk.http.request({ url: baseUrl + route, responseType: 'json', timeoutMs: 10000 });
  if (response.status < 200 || response.status >= 300) {
    const code = response.status === 401 ? 'authentication_required'
      : response.status === 403 ? 'permission_denied' : response.status === 429 ? 'rate_limited'
        : response.status >= 500 ? 'temporary_unavailable' : undefined;
    throw Object.assign(new Error('Service HTTP failure: ' + response.status), code ? { code } : {});
  }
  const body = response.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Service JSON object required');
  // This fixture service uses {error:{code}}. Map YOUR actual business envelope;
  // HTTP 200 alone never proves success. Do not forward credential-bearing text.
  if (body.error) {
    const code = failureCodes.includes(body.error.code) ? body.error.code : undefined;
    throw Object.assign(new Error('Service rejected the request'), code ? { code } : {});
  }
  return body;
}
/** @type {import('./types').Provider} */
module.exports = {
  manifest: {
    apiVersion: 2, kind: 'provider', sourceId: 'example', id: 'example.v2.minimal',
    name: 'V2 HTTP authoring example', author: 'Example author', version: '1.0.1',
    supportedSearchType: ['music'], capabilities: ['search', 'media.prepare', 'media.resolve'],
    userVariables: [{ key: 'baseUrl', name: 'Service base URL',
      hint: 'Replace the scaffold endpoint with your real service and map its actual responses.',
      defaultValue: 'https://example.invalid' }],
  },
  handlers: {
    async search(request, sdk) {
      if (request.kind !== 'music') throw new Error('Unsupported search kind: ' + request.kind);
      const { scope, upstream } = searchCursor(request, sdk);
      const body = await getJson(sdk, '/v2/search?q=' + encodeURIComponent(request.query)
        + '&cursor=' + encodeURIComponent(upstream === null ? '' : upstream)
        + '&limit=' + request.limit);
      const next = body.nextCursor;
      if (!Array.isArray(body.items) || body.items.length > request.limit
        || !(next === null || typeof next === 'string' && next.length > 0)
        || next !== null && (!body.items.length || next === upstream)) {
        throw new Error('Invalid search page: items/limit/nextCursor');
      }
      for (const item of body.items) {
        if (!item || !(typeof item.id === 'string' && item.id.length > 0
          || typeof item.id === 'number' && Number.isSafeInteger(item.id))) {
          throw new Error('Invalid entity ID; preserve the upstream number/string type');
        }
      }
      if (Object.hasOwn(body, 'total') && (!Number.isSafeInteger(body.total) || body.total < 0)) {
        throw new Error('Invalid search total');
      }
      const nextCursor = next === null ? null : JSON.stringify({ v: 1, scope, upstream: next });
      if (nextCursor !== null && sdk.bytes.encode(nextCursor).length / 2 > 2048) {
        throw new Error('Search cursor exceeds the native byte limit; use a bounded storage-backed token');
      }
      return { items: body.items, nextCursor,
        ...(Object.hasOwn(body, 'total') ? { total: body.total } : {}) };
    },
    media: {
      // Required only when this provider actually participates in resolver binding.
      prepare: ({ entity }) => ({ musicId: entity.id }),
      async resolve(request, sdk) {
        const body = await getJson(sdk, '/v2/source?id=' + encodeURIComponent(request.entity.id)
          + '&quality=' + encodeURIComponent(request.quality || '320k'));
        if (typeof body.url !== 'string' || !/^https?:\/\//i.test(body.url)) {
          throw new Error('Media response requires an actual HTTP(S) audio URL');
        }
        return body;
      },
    },
  },
};
