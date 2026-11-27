// @baka-provider 2
// Authoring fixture: uses a deterministic HTTP test service in check.cjs.
// Replace the endpoint/mapping with a service you are authorized to access.
// @ts-check
/** @type {import('./types').Provider} */
module.exports = {
  manifest: {
    apiVersion: 2,
    kind: 'provider',
    sourceId: 'example',
    id: 'example.v2.minimal',
    name: 'V2 HTTP authoring example',
    author: 'Example author',
    version: '1.0.0',
    capabilities: ['search', 'media.prepare', 'media.resolve'],
  },
  handlers: {
    async search(request, sdk) {
      const response = await sdk.http.request({
        url: (sdk.settings.baseUrl || 'https://example.invalid') + '/v2/search?q=' + encodeURIComponent(request.query)
          + '&cursor=' + encodeURIComponent(request.cursor || '')
          + '&limit=' + request.limit,
        responseType: 'json',
        timeoutMs: 10000,
      });
      if (response.status !== 200) throw new Error('Search service unavailable');
      const body = /** @type {any} */ (response.body);
      return { items: body.items, nextCursor: body.nextCursor, total: body.total };
    },
    media: {
      // Only this provider knows the external resolver's protocol fields.
      prepare: ({ entity }) => ({ musicId: entity.id }),
      async resolve(request, sdk) {
        const response = await sdk.http.request({
          url: (sdk.settings.baseUrl || 'https://example.invalid') + '/v2/source?id=' + encodeURIComponent(request.entity.id)
            + '&quality=' + encodeURIComponent(request.quality || '320k'),
          responseType: 'json',
        });
        if (response.status === 404) return null;
        if (response.status !== 200) throw new Error('Media service unavailable');
        return /** @type {any} */ (response.body);
      },
    },
  },
};
