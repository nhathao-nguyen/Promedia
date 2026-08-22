export const downloadChannels = {
  probe: 'download:probe',
  enqueue: 'download:enqueue',
  list: 'download:list',
  cancel: 'download:cancel',
  dismiss: 'download:dismiss',
  operation: 'download:operation',
  proxyTest: 'download:proxy-test',
  authStatus: 'download:auth-status',
  authLogin: 'download:auth-login',
  authClear: 'download:auth-clear',
  authEvent: 'download:auth-event',
  thumbnail: 'download:thumbnail',
  historyList: 'download:history-list',
  historyRemove: 'download:history-remove',
} as const

export type DownloadPlatform = 'facebook' | 'tiktok' | 'douyin' | 'youtube'
export type YtDlpPlatform = Exclude<DownloadPlatform, 'douyin'>
export type DownloadKind = 'video' | 'audio'
export type DownloadFolderMode = 'flat' | 'playlist' | 'channel'
export type DouyinMode = 'all' | 'batch' | 'new'
export type DownloadAuthSite = 'facebook' | 'tiktok' | 'douyin'

export const downloadAuthSites: readonly DownloadAuthSite[] = ['facebook', 'tiktok', 'douyin']

export type DownloadErrorCode =
  | 'invalid-request'
  | 'invalid-url'
  | 'unsupported-platform'
  | 'runtime-missing'
  | 'runtime-invalid'
  | 'network'
  | 'authentication-required'
  | 'rate-limited'
  | 'format-unavailable'
  | 'http-403'
  | 'cancelled'
  | 'output-failed'
  | 'busy'
  | 'unknown'

export type DownloadProgressDetailCode =
  | 'preparing'
  | 'postprocessing'
  | 'retry-without-cookies'
  | 'retry-adaptive'
  | 'retry-progressive'
  | 'retry-automatic-format'
  | 'conversion-h264'
  | 'conversion-music'
  | 'finished'
  | 'cancelled'
  | 'error'

export interface DownloadFormat {
  id: string
  ext: string | null
  height: number | null
  fps: number | null
  videoCodec: string | null
  audioCodec: string | null
  sizeBytes: number | null
}

export interface DownloadCandidate {
  id: string
  url: string
  title: string
  platform: DownloadPlatform
  uploader: string | null
  durationSeconds: number | null
  durationLabel: string | null
  thumbnailURL: string | null
  webpageURL: string
  playlistTitle: string | null
  formats: readonly DownloadFormat[]
  maxHeight: number | null
}

export interface DownloadProbeRequest {
  url: string
  useCookies?: boolean
}

export interface DownloadProbeCollection {
  id: string
  title: string
  url: string
  count: number | null
}

export interface DownloadProbeResult {
  operationId?: string
  ok: boolean
  platform?: DownloadPlatform
  candidates: readonly DownloadCandidate[]
  collections: readonly DownloadProbeCollection[]
  errorCode?: DownloadErrorCode
}

export interface DownloadThumbnailRequest {
  thumbnailURL: string
  sourceURL: string
  useCookies?: boolean
}

export interface DownloadThumbnailResult {
  dataURL: string | null
}

export interface DownloadRequestBase {
  operationId: string
  url: string
  displayTitle: string | null
  thumbnailURL: string | null
  playlistTitle: string | null
  outputDir: string
  useCookies: boolean
  proxy: string | null
}

export interface YtDlpDownloadOptions {
  kind: DownloadKind
  maxHeight: number | null
  audioFormat: 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav'
  container: 'mp4' | 'mkv' | 'webm'
  ensureH264: boolean
  outputTemplate: string
  folderMode: DownloadFolderMode
  writeSubtitles: boolean
  autoSubtitles: boolean
  subtitleLanguages: string
  embedSubtitles: boolean
  embedThumbnail: boolean
  embedMetadata: boolean
  useArchive: boolean
  forceOverwrite: boolean
}

export interface DouyinDownloadOptions {
  mode: DouyinMode
  batchSize: number
  music: boolean
  cover: boolean
  avatar: boolean
  metadata: boolean
  folderPerVideo: boolean
  ensureH264: boolean
}

export interface YtDlpDownloadRequest extends DownloadRequestBase {
  platform: YtDlpPlatform
  engine: 'yt-dlp'
  options: YtDlpDownloadOptions
}

export interface DouyinDownloadRequest extends DownloadRequestBase {
  platform: 'douyin'
  engine: 'douyin'
  options: DouyinDownloadOptions
}

export type DownloadRequest = YtDlpDownloadRequest | DouyinDownloadRequest

export type DownloadResultStatus = 'done' | 'skipped' | 'cancelled' | 'error'

export interface DownloadResult {
  operationId: string
  status: DownloadResultStatus
  files: readonly string[]
  primaryFile: string | null
  addedItemCount: number
  errorCode?: DownloadErrorCode
}

export type DownloadProgressPhase =
  | 'preparing'
  | 'downloading'
  | 'postprocessing'
  | 'converting'
  | 'finished'
  | 'error'
  | 'cancelled'

export interface DownloadProgress {
  operationId: string
  phase: DownloadProgressPhase
  percent: number | null
  downloadedBytes: number | null
  totalBytes: number | null
  speed: string | null
  eta: string | null
  filePath: string | null
  detailCode: DownloadProgressDetailCode | null
  errorCode?: DownloadErrorCode
}

export type DownloadOperationKind = 'probe' | 'download'

export interface DownloadOperationStatus {
  operationId: string
  kind: DownloadOperationKind
  url: string
  displayTitle: string | null
  thumbnailURL: string | null
  platform: DownloadPlatform | null
  state: 'starting' | 'running' | 'finished' | 'cancelled' | 'error'
  progress: DownloadProgress | null
  probeResult: DownloadProbeResult | null
  result: DownloadResult | null
}

export interface DownloadEnqueueResult {
  acceptedOperationIDs: readonly string[]
  errorCode?: DownloadErrorCode
}

export interface DownloadProxyTestResult {
  ok: boolean
  errorCode?: DownloadErrorCode
}

export interface DownloadChannelRecord {
  url: string
  name: string
  lastRun: string
  count: number
  outputDir: string
  lastMode: DouyinMode
}

export type DownloadAuthPhase = 'launching' | 'ready' | 'saved' | 'error'

export interface DownloadAuthStatus {
  site: DownloadAuthSite
  hasCookies: boolean
  cookieCount: number
  loggedIn: boolean
}

export interface DownloadAuthEvent {
  site: DownloadAuthSite
  phase: DownloadAuthPhase
}

export interface DownloadAPI {
  probe(request: DownloadProbeRequest): Promise<DownloadProbeResult>
  enqueue(requests: readonly DownloadRequest[]): Promise<DownloadEnqueueResult>
  list(): Promise<DownloadOperationStatus[]>
  cancel(operationId: string): void
  dismiss(operationId: string): Promise<void>
  onOperation(listener: (status: DownloadOperationStatus) => void): () => void
  testProxy(proxy: string): Promise<DownloadProxyTestResult>
  thumbnail(request: DownloadThumbnailRequest): Promise<DownloadThumbnailResult>
  history: {
    list(): Promise<DownloadChannelRecord[]>
    remove(url: string): Promise<DownloadChannelRecord[]>
  }
  auth: {
    status(): Promise<DownloadAuthStatus[]>
    login(site: DownloadAuthSite): Promise<DownloadAuthStatus>
    clear(site: DownloadAuthSite): Promise<void>
    onEvent(listener: (event: DownloadAuthEvent) => void): () => void
  }
}

export function requiredDownloadRuntimeIDsForProbe(platform: DownloadPlatform): readonly string[] {
  return platform === 'douyin' ? ['douyin-engine'] : ['yt-dlp']
}

export function requiredDownloadRuntimeIDsForDownload(request: DownloadRequest): readonly string[] {
  if (request.engine === 'douyin') return request.options.ensureH264 ? ['douyin-engine', 'media-processing'] : ['douyin-engine']
  return ['yt-dlp', 'media-processing']
}

export function requiredDownloadRuntimeIDsForProxyTest(): readonly string[] {
  return ['yt-dlp']
}

export function isDownloadPlatform(value: unknown): value is DownloadPlatform {
  return value === 'facebook' || value === 'tiktok' || value === 'douyin' || value === 'youtube'
}

export function isDownloadAuthSite(value: unknown): value is DownloadAuthSite {
  return value === 'facebook' || value === 'tiktok' || value === 'douyin'
}

export function isDownloadOperationID(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value)
}

export function isDownloadThumbnailRequest(value: unknown): value is DownloadThumbnailRequest {
  if (!isRecord(value)) return false
  const request = value as Partial<DownloadThumbnailRequest>
  return isHTTPSURL(request.thumbnailURL, 4_096)
    && isHTTPSURL(request.sourceURL, 2_048)
    && (request.useCookies === undefined || typeof request.useCookies === 'boolean')
}

export function isDownloadProbeRequest(value: unknown): value is DownloadProbeRequest {
  if (!isRecord(value)) return false
  const request = value as Partial<DownloadProbeRequest>
  return hasExactKeys(value, ['url', 'useCookies'])
    && isHTTPSURL(request.url, 2_048)
    && (request.useCookies === undefined || typeof request.useCookies === 'boolean')
}

export function isDownloadRequest(value: unknown): value is DownloadRequest {
  if (!isRecord(value) || !hasExactKeys(value, ['operationId', 'url', 'displayTitle', 'thumbnailURL', 'playlistTitle', 'outputDir', 'useCookies', 'proxy', 'platform', 'engine', 'options'])) return false
  const request = value as Partial<DownloadRequest>
  if (!isDownloadOperationID(request.operationId)
    || !isHTTPSURL(request.url, 2_048)
    || !isDownloadPlatform(request.platform)
    || !isSafeOptionalText(request.displayTitle, 500)
    || !isSafeOptionalText(request.playlistTitle, 500)
    || (request.thumbnailURL !== null && !isHTTPSURL(request.thumbnailURL, 4_096))
    || !isAbsolutePath(request.outputDir, 4_096)
    || typeof request.useCookies !== 'boolean'
    || (request.proxy !== null && !isProxy(request.proxy))) return false

  if (request.platform === 'douyin') {
    return request.engine === 'douyin' && isDouyinOptions(request.options)
  }
  return request.engine === 'yt-dlp' && isYtDlpOptions(request.options)
}

function isYtDlpOptions(value: unknown): value is YtDlpDownloadOptions {
  if (!isRecord(value) || !hasExactKeys(value, ['kind', 'maxHeight', 'audioFormat', 'container', 'ensureH264', 'outputTemplate', 'folderMode', 'writeSubtitles', 'autoSubtitles', 'subtitleLanguages', 'embedSubtitles', 'embedThumbnail', 'embedMetadata', 'useArchive', 'forceOverwrite'])) return false
  const options = value as Partial<YtDlpDownloadOptions>
  return (options.kind === 'video' || options.kind === 'audio')
    && (options.maxHeight === null || isBoundedInteger(options.maxHeight, 144, 8_640))
    && (options.audioFormat === 'mp3' || options.audioFormat === 'm4a' || options.audioFormat === 'opus' || options.audioFormat === 'flac' || options.audioFormat === 'wav')
    && (options.container === 'mp4' || options.container === 'mkv' || options.container === 'webm')
    && typeof options.ensureH264 === 'boolean'
    && isOutputTemplate(options.outputTemplate)
    && (options.folderMode === 'flat' || options.folderMode === 'playlist' || options.folderMode === 'channel')
    && typeof options.writeSubtitles === 'boolean'
    && typeof options.autoSubtitles === 'boolean'
    && typeof options.embedSubtitles === 'boolean'
    && typeof options.embedThumbnail === 'boolean'
    && typeof options.embedMetadata === 'boolean'
    && typeof options.useArchive === 'boolean'
    && typeof options.forceOverwrite === 'boolean'
    && typeof options.subtitleLanguages === 'string'
    && options.subtitleLanguages.length <= 256
    && !options.subtitleLanguages.includes('\0')
}

function isDouyinOptions(value: unknown): value is DouyinDownloadOptions {
  if (!isRecord(value) || !hasExactKeys(value, ['mode', 'batchSize', 'music', 'cover', 'avatar', 'metadata', 'folderPerVideo', 'ensureH264'])) return false
  const options = value as Partial<DouyinDownloadOptions>
  return (options.mode === 'all' || options.mode === 'batch' || options.mode === 'new')
    && isBoundedInteger(options.batchSize, 1, 10_000)
    && typeof options.music === 'boolean'
    && typeof options.cover === 'boolean'
    && typeof options.avatar === 'boolean'
    && typeof options.metadata === 'boolean'
    && typeof options.folderPerVideo === 'boolean'
    && typeof options.ensureH264 === 'boolean'
}

function isOutputTemplate(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 512
    && !value.includes('\0')
    && !isAbsolutePath(value)
    && !value.split(/[\\/]/).includes('..')
}

function isSafeOptionalText(value: unknown, maximumLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= maximumLength && !value.includes('\0'))
}

function isAbsolutePath(value: unknown, maximumLength = Number.MAX_SAFE_INTEGER): boolean {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && !value.includes('\0')
    && (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\'))
}

function isHTTPSURL(value: unknown, maximumLength: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength || value.includes('\0')) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isProxy(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 2_048
    && !value.includes('\0')
    && /^(https?|socks(?:4|5h?)):.*:\d{2,5}$/i.test(value)
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
