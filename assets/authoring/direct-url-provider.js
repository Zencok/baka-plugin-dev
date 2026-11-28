// @baka-provider 2
// Directly importable single-audio provider. Configure your authorized audioUrl
// in the application's plugin settings; no account or remote service is bundled.
// When changing the actual song, also choose a new trackId. Renewing a signed
// URL for the same song keeps trackId unchanged. Never derive identity from URLs.
// A single original file has no selectable renditions: do not advertise
// supportedQualities:['original'] (the current default playback ladder would
// skip it). Accept the caller's preference, report the actual 'original' file,
// and never claim it was transcoded to the requested bitrate/codec.
// @ts-check
const qualityPreferences = new Set([
  'original', 'master', 'atmos_pro', 'atmos_plus', 'atmos', 'dolby', 'dts',
  'vinyl', 'hires', 'flac24bit', 'flac', '320k', '192k', '128k', '96k',
]);
function configured(sdk) {
  const audioUrl = sdk.settings.audioUrl;
  if (typeof audioUrl !== 'string' || !audioUrl.trim()) {
    throw new Error('Configure audioUrl in this plugin settings first');
  }
  let parsed;
  try { parsed = new URL(audioUrl); } catch (_) { throw new Error('audioUrl must be an absolute HTTP(S) audio URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('audioUrl must be an absolute HTTP(S) audio URL without URL credentials');
  }
  const id = sdk.settings.trackId || 'audio-1';
  const title = sdk.settings.title || 'Direct audio example';
  const artist = sdk.settings.artist || '';
  if (typeof id !== 'string' || !id.length || typeof title !== 'string' || typeof artist !== 'string') {
    throw new Error('trackId, title and artist must be text');
  }
  return { audioUrl, track: { id, type: 'music', title, artist } };
}
function matchesTrack(entity, track) {
  return entity.id === track.id
    && (entity.kind === undefined || entity.kind === 'music')
    && (entity.type === undefined || entity.type === 'music');
}
/** @type {import('./types').Provider} */
module.exports = {
  manifest: {
    apiVersion: 2, kind: 'provider', id: 'org.example.direct-audio',
    sourceId: 'direct-audio.v1', name: 'Direct audio template',
    author: 'BakaMusic plugin authoring examples', version: '1.0.0',
    description: 'Import, configure an authorized HTTP(S) audio URL, then search its title.',
    supportedSearchType: ['music'],
    capabilities: ['search', 'entities.get', 'media.resolve'],
    userVariables: [
      { key: 'audioUrl', name: 'Audio URL', hint: 'Authorized HTTP(S) audio file or signed URL; not a web page.', type: 'password', defaultValue: '' },
      { key: 'trackId', name: 'Stable track ID', hint: 'Change when choosing another song; keep for refreshed URLs of the same song.', defaultValue: 'audio-1' },
      { key: 'title', name: 'Title', defaultValue: 'Direct audio example' },
      { key: 'artist', name: 'Artist', defaultValue: '' },
    ],
  },
  handlers: {
    search(request, sdk) {
      if (request.kind !== 'music') throw new Error('Unsupported search kind: ' + request.kind);
      if (request.cursor !== null) throw new Error('Invalid cursor for single-audio catalog');
      if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) throw new Error('Invalid limit');
      const { track } = configured(sdk);
      const query = request.query.trim().toLowerCase();
      const matches = (track.title + ' ' + track.artist).toLowerCase().includes(query);
      return { items: matches ? [track] : [], nextCursor: null, total: matches ? 1 : 0 };
    },
    entities: {
      get({ entity }, sdk) {
        const { track } = configured(sdk);
        return matchesTrack(entity, track) ? track : null;
      },
    },
    media: {
      resolve({ entity, quality }, sdk) {
        const { audioUrl, track } = configured(sdk);
        if (!matchesTrack(entity, track)) return null;
        if (quality !== null && !qualityPreferences.has(quality)) {
          throw new Error('Unknown audio quality preference: ' + quality);
        }
        return { url: audioUrl, quality: 'original' };
      },
    },
  },
};
