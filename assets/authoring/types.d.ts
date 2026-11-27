/** QuickJS V2 source-provider contract. No Node, npm, DOM or ESM runtime implied. */
export type Capability = 'search' | 'entities.get' | 'collections.get' | 'collections.members'
  | 'discovery.charts' | 'discovery.chartTags' | 'discovery.playlistTags'
  | 'discovery.playlists' | 'discovery.hotSearch' | 'discovery.recommendations'
  | 'discovery.daily' | 'discovery.similar' | 'discovery.searchSuggestions'
  | 'media.prepare' | 'media.resolve' | 'media.video' | 'media.license' | 'lyrics.get'
  | 'comments.list' | 'links.resolve' | 'links.share' | 'recognition.identify'
  | 'auth.login' | 'auth.callback' | 'auth.logout' | 'auth.status';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** Set on a thrown Error; the host transports only these exact sanitized codes. */
export type PluginFailureCode = 'quality_unavailable' | 'track_unavailable'
  | 'authentication_required' | 'permission_denied' | 'rate_limited'
  | 'temporary_unavailable' | 'signature_expired';
export type PluginFailure = Error & { code: PluginFailureCode };
export type Kind = 'music' | 'album' | 'artist' | 'sheet' | 'lyric';
export interface ManifestMetadata {
  apiVersion: 2;
  /** Canonical package identity; never derived from URL or display name. */
  id: string;
  name: string;
  /** Preserve the original author/attribution when migrating an existing provider. */
  author: string;
  description?: string;
  homepage?: string;
  license?: string;
  hints?: Record<string, string[]>;
  userVariables?: Array<{ key: string; name: string; hint?: string; [key: string]: unknown }>;
  supportedSearchType?: Kind[];
  supportedQualities?: string[];
  supportedVideoQualities?: string[];
  primaryKey?: string[];
  version: string;
  [key: string]: unknown;
}
export type ProviderManifest = ManifestMetadata & {
  kind: 'provider'; sourceId: string; sources?: never; capabilities: Capability[];
};
export type ResolverManifest = ManifestMetadata & {
  kind: 'resolver'; sources: string[]; sourceId?: never;
  capabilities: Array<'media.resolve' | 'media.video' | 'media.license'>;
};
export type Manifest = ProviderManifest | ResolverManifest;
/** Host-owned reference. Resolver changes never change this ownership. */
export interface EntityRef {
  providerId: string;
  kind: Kind | 'chart';
  /** Nonempty string or JS-safe integer. String and numeric IDs are distinct. */
  id: string | number;
}
export interface ResolverBinding { providerId: string; resolverId: string }
/** Provider payload: metadata and context never act as alternative routing IDs. */
export interface Entity {
  id: string | number;
  type?: string;
  title?: string;
  name?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  /** Seconds, never milliseconds. */
  duration?: number;
  description?: string;
  worksNum?: number;
  qualities?: Record<string, Json>;
  mv?: string | number;
  [providerField: string]: unknown;
}
export interface PageRequest { cursor: string | null; limit: number }
export interface Page<T> {
  items: T[];
  /** Mandatory. null means finished; nonempty opaque string means another page. */
  nextCursor: string | null;
  total?: number;
  entity?: Entity;
}
/** Additional daily fields retained for the existing Flutter home consumer. */
export interface DailyPage extends Page<Entity> {
  state: 'ready' | 'login_required' | 'unconfigured' | 'blocked' | 'updating';
  sheetItem?: Entity;
  date?: string;
  /** Refresh deadline in Unix milliseconds, provided by the service. */
  refreshAt?: number;
}
export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Hex-encoded binary body; mutually exclusive with body. */
  bodyHex?: string;
  timeoutMs?: number;
  responseType?: 'text' | 'json' | 'bytes';
  maxRedirects?: number;
}
export interface AesRequest {
  mode: 'cbc' | 'ecb';
  keyHex: string;
  ivHex?: string;
  dataHex: string;
  padding?: 'pkcs7' | 'none';
}
export interface SDK {
  /** Frozen host environment snapshot configured before loading this source. */
  settings: Readonly<Record<string, unknown>>;
  http: { request(request: HttpRequest): Promise<{ status: number; headers: Record<string, string>; body: Json }> };
  bytes: {
    /** Returns hex bytes from UTF-8 text, base64 or hex input. */
    encode(value: string, encoding?: 'utf8' | 'utf-8' | 'base64' | 'hex'): string;
    /** Decodes hex bytes to text (including gb18030), base64 or normalized hex. */
    decode(dataHex: string, encoding?: string): string;
    /** Returns compressed hex bytes; input and output capped at 16 MiB. */
    compress(dataHex: string, format?: 'zlib'): string;
    /** Returns decompressed hex bytes, capped at 16 MiB. */
    decompress(dataHex: string, format?: 'zlib'): string;
  };
  text: { decodeHtml(value: string): string };
  crypto: {
    hash(algorithm: 'md5' | 'sha1' | 'sha256' | 'sm3', dataHex: string): string;
    hmacSha256(keyHex: string, dataHex: string): string;
    randomBytes(size: number): string;
    aesEncrypt(request: AesRequest): string;
    aesDecrypt(request: AesRequest): string;
  };
  storage: {
    /** Missing values may be undefined in the native shim; use value ?? null. */
    get(key: string): Promise<string | null | undefined>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  log: Record<'debug' | 'info' | 'warn' | 'error', (...args: unknown[]) => void>;
}
export type Handler<I, O> = (request: I, sdk: SDK) => O | Promise<O>;
export interface MediaSource {
  url?: string;
  headers?: Record<string, string>;
  quality?: string;
  qualities?: Record<string, Json>;
  /** Additional provider-owned source fields, including native Apple data. */
  [key: string]: unknown;
}
export interface Lyrics {
  rawLrc?: string;
  translation?: string;
  romanization?: string;
  [key: string]: unknown;
}
export interface Comment {
  id: string | number;
  content: string;
  [key: string]: unknown;
}
export interface DiscoveryRequest extends PageRequest { tag?: Json }
export interface Handlers {
  search?: Handler<PageRequest & { query: string; kind: Kind; context?: Json }, Page<Entity>>;
  entities?: { get?: Handler<{ entity: Entity }, Entity | null> };
  collections?: {
    get?: Handler<{ entity: Entity }, Entity | null>;
    members?: Handler<PageRequest & { entity: Entity; kind: Kind }, Page<Entity>>;
  };
  discovery?: {
    charts?: Handler<DiscoveryRequest, Page<Entity>>;
    chartTags?: Handler<DiscoveryRequest, Page<Json>>;
    playlistTags?: Handler<DiscoveryRequest, Page<Json>>;
    playlists?: Handler<DiscoveryRequest, Page<Entity>>;
    hotSearch?: Handler<DiscoveryRequest, Page<Json>>;
    recommendations?: Handler<DiscoveryRequest, Page<Entity>>;
    daily?: Handler<DiscoveryRequest, DailyPage>;
    similar?: Handler<PageRequest & { entity: Entity }, Page<Entity>>;
    searchSuggestions?: Handler<PageRequest & { query: string }, Page<Json>>;
  };
  media?: {
    /** Provider-owned protocol conversion, required before explicit binding. */
    prepare?: Handler<{ entity: Entity; quality: string | null }, Json>;
    resolve?: Handler<{ entity: Entity; quality: string | null }, MediaSource | null>;
    video?: Handler<{ entity: Entity; quality?: string | null }, MediaSource | null>;
    /** Dedicated Apple native callback envelope; not auth.callback. */
    license?: Handler<{ payload: Json }, Json>;
  };
  lyrics?: { get?: Handler<{ entity: Entity }, Lyrics | string | null> };
  comments?: { list?: Handler<PageRequest & { entity: Entity; sort?: string }, Page<Comment>> };
  links?: {
    resolve?: Handler<{ url: string }, Json>;
    share?: Handler<{ entity: Entity }, string | null>;
  };
  /** Payload/result are provider-specific JSON; no capture UI is promised. */
  recognition?: { identify?: Handler<{ payload: Json }, Json> };
  /** Protocol transport only: these declarations do not create a login UI. */
  auth?: Partial<Record<'login' | 'callback' | 'logout' | 'status', Handler<{ payload: Json }, Json>>>;
}
export interface Provider { manifest: ProviderManifest; handlers: Handlers }
export interface ResolverMediaRequest {
  providerId: string;
  sourceId: string;
  entity: Entity;
  quality: string | null;
  /** Produced by the bound provider's media.prepare. */
  context: Json;
}
export interface Resolver {
  manifest: ResolverManifest;
  handlers: { media: {
    resolve: Handler<ResolverMediaRequest, MediaSource | null>;
    video?: Handler<ResolverMediaRequest, MediaSource | null>;
    license?: Handler<{ payload: Json }, Json>;
  } };
}
export type Plugin = Provider | Resolver;
