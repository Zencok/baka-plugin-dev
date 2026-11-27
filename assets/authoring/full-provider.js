// @baka-provider 2
// All 26 capability transports, using deterministic fixtures only.
// Derived from BakaMusicFlutter; attribution and source hashes: UPSTREAM.json.
// .invalid URLs intentionally cannot play. No real recognition/authentication.
// @ts-check
const track = { id: 'track-1', type: 'music', title: 'Fixture song', artist: 'Fixture artist',
  album: 'Fixture album', duration: 180, mv: 'video-1', qualities: { '320k': {} } };
const album = { id: 'album-1', type: 'album', title: 'Fixture album', artist: track.artist, worksNum: 2 };
const sheet = { id: 'sheet-1', type: 'sheet', title: 'Fixture playlist', worksNum: 2 };
const artist = { id: 'artist-1', type: 'artist', name: track.artist, title: track.artist };
const tracks = [track, { ...track, id: 'track-2', title: 'Second fixture song' }];
/**
 * @template T
 * @param {T[]} items
 * @param {import('./types').PageRequest} request
 * @returns {import('./types').Page<T>}
 */
function page(items, request) {
  if (request.cursor !== null && (typeof request.cursor !== 'string'
    || !/^(?:0|[1-9]\d*)$/.test(request.cursor))) throw new Error('Invalid cursor');
  const offset = request.cursor === null ? 0 : Number(request.cursor);
  if (!Number.isSafeInteger(offset) || offset > items.length) throw new Error('Invalid cursor');
  const limit = request.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid limit');
  const end = Math.min(offset + limit, items.length);
  return { items: items.slice(offset, end), nextCursor: end < items.length ? String(end) : null, total: items.length };
}
/** @type {import('./types').Provider} */
module.exports = {
  manifest: {
    apiVersion: 2, kind: 'provider', sourceId: 'example', id: 'example.v2.full', name: 'V2 complete authoring fixture', author: 'Example author', version: '1.0.0',
    supportedSearchType: ['music', 'album', 'artist', 'sheet'],
    capabilities: ['search', 'entities.get', 'collections.get', 'collections.members',
      'discovery.charts', 'discovery.chartTags', 'discovery.playlistTags', 'discovery.playlists',
      'discovery.hotSearch', 'discovery.recommendations', 'discovery.daily',
      'discovery.similar', 'discovery.searchSuggestions',
      'media.prepare', 'media.resolve', 'media.video', 'media.license', 'lyrics.get', 'comments.list', 'links.resolve',
      'links.share', 'recognition.identify', 'auth.login', 'auth.callback', 'auth.logout', 'auth.status'],
  },
  handlers: {
    search(request) {
      const items = request.kind === 'music' ? tracks : request.kind === 'album' ? [album]
        : request.kind === 'artist' ? [artist] : request.kind === 'sheet' ? [sheet] : null;
      if (items === null) throw new Error('Unsupported search kind: ' + request.kind);
      return page(items.filter(item => (item.title || '').toLowerCase().includes(request.query.toLowerCase())), request);
    },
    entities: { get: ({ entity }) => [track, album, sheet, artist].find(item => item.id === entity.id) || null },
    collections: {
      get: ({ entity }) => [album, sheet, artist].find(item => item.id === entity.id) || null,
      members: request => ({ ...page(/** @type {import('./types').Entity[]} */ (
        request.kind === 'album' ? [album] : tracks), request), entity: request.entity }),
    },
    discovery: {
      charts: request => page([{ ...sheet, id: 'chart-1', title: 'Fixture chart' }], request),
      chartTags: request => page([{ id: 'all', title: 'All charts' }], request),
      playlistTags: request => page([{ id: 'all', title: 'All playlists' }], request),
      playlists: request => page([sheet], request),
      hotSearch: request => page(['Fixture song', 'Fixture artist'], request),
      recommendations: request => page([sheet], request),
      similar: request => page(tracks.filter(item => item.id !== request.entity.id), request),
      searchSuggestions: request => page(['Fixture song', 'Fixture artist']
        .filter(value => value.toLowerCase().includes(request.query.toLowerCase())), request),
      async daily(request, sdk) {
        if (!(await sdk.storage.get('fixture-session'))) throw new Error('Authentication required');
        return { ...page([sheet], request), state: 'ready', sheetItem: sheet,
          date: 'fixture-date', refreshAt: 4102444800000 };
      },
    },
    media: {
      prepare: ({ entity, quality }) => ({ musicId: entity.id, quality }),
      resolve: ({ entity, quality }) => (!quality || quality === '320k')
        && (entity.id === track.id || entity.id === 'track-2')
        ? { url: 'https://example.invalid/audio/' + entity.id + '.mp3', quality: quality || '320k',
          headers: { Referer: 'https://example.invalid/' } } : null,
      video: ({ entity, quality }) => entity.mv && (!quality || quality === '720p')
        ? { url: 'https://example.invalid/video.mp4', quality: quality || '720p', qualities: { '720p': {} } } : null,
      license({ payload }) {
        // Dedicated transport only. No fake key/decryption module is provided.
        // Replace with an authorized service returning the native Apple envelope.
        if (!payload || typeof payload !== 'object') throw new Error('License payload required');
        return { fixture: true, notPlayable: true };
      },
    },
    lyrics: { get: () => ({ rawLrc: '[00:00.00]Fixture song\n[00:01.00]Second line',
      translation: '[00:00.00]Translated fixture', romanization: '[00:00.00]Romanized fixture' }) },
    comments: { list: request => page([{ id: 'comment-1', content: 'Fixture comment',
      username: 'Fixture listener', timestamp: 1700000000000, like: 1, replies: [] }], request) },
    links: {
      resolve({ url }) {
        if (!url.startsWith('https://example.invalid/')) throw new Error('Unsupported fixture link');
        return url.includes('/playlist/') ? sheet : track;
      },
      share: ({ entity }) => 'https://example.invalid/' + (entity.type === 'sheet' ? 'playlist/' : 'song/') + entity.id,
    },
    recognition: { identify({ payload }) {
      // A service would consume explicit PCM format/rate/channels and bytes here.
      if (!payload || typeof payload !== 'object') throw new Error('Recognition payload required');
      return { candidates: [{ ...track, confidence: 1 }], fixture: true };
    } },
    auth: {
      async login({ payload }, sdk) {
        // Fixture flag only, never a real token. Real auth must verify service state.
        if (!payload || typeof payload !== 'object') throw new Error('Login payload required');
        await sdk.storage.set('fixture-session', 'fixture-only');
        return { authenticated: true, fixture: true };
      },
      async callback({ payload }, sdk) {
        if (!payload || typeof payload !== 'object') throw new Error('Callback payload required');
        await sdk.storage.set('fixture-session', 'fixture-only');
        return { authenticated: true, fixture: true };
      },
      async logout(_, sdk) { await sdk.storage.remove('fixture-session'); return { authenticated: false }; },
      async status(_, sdk) { return { authenticated: Boolean(await sdk.storage.get('fixture-session')), fixture: true }; },
    },
  },
};
