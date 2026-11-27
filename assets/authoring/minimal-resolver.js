// @baka-provider 2
// Authoring fixture; this endpoint is intentionally not a real music service.
// @ts-check
/** @type {import('./types').Resolver} */
module.exports = {
  manifest: {
    apiVersion: 2,
    kind: 'resolver',
    id: 'example.v2.resolver',
    sources: ['example'],
    name: 'V2 explicit resolver example',
    author: 'Example author',
    version: '1.0.0',
    capabilities: ['media.resolve'],
  },
  handlers: {
    media: {
      async resolve(request, sdk) {
        const context = /** @type {{musicId?: string | number} | undefined} */ (request.context);
        if (request.sourceId !== 'example' || context?.musicId === undefined) {
          throw new Error('Provider resolver context required');
        }
        const response = await sdk.http.request({
          url: (sdk.settings.baseUrl || 'https://example.invalid') + '/v2/source?id=' + encodeURIComponent(context.musicId)
            + '&quality=' + encodeURIComponent(request.quality || '320k'),
          responseType: 'json',
        });
        if (response.status === 404) return null;
        if (response.status !== 200) throw new Error('Resolver service unavailable');
        return /** @type {import('./types').MediaSource} */ (response.body);
      },
    },
  },
};
