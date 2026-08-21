export const downloadChannels = {
  probe: 'download:probe',
  start: 'download:start',
  list: 'download:list',
  cancel: 'download:cancel',
  progress: 'download:progress',
  proxyTest: 'download:proxy-test',
  authStatus: 'download:auth-status',
  authLogin: 'download:auth-login',
  authClear: 'download:auth-clear',
  authEvent: 'download:auth-event',
  thumbnail: 'download:thumbnail',
} as const

export type DownloadPlatform = 'facebook' | 'tiktok' | 'douyin' | 'youtube'
export type DownloadKind = 'video' | 'audio'
export type DownloadFolderMode = 'flat' | 'playlist' | 'channel'
export type DouyinMode = 'all' | 'batch' | 'new'

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

export interface DouyinOptions {
  mode: DouyinMode
  batchSize: number
  music: boolean
  cover: boolean
  metadata: boolean
  folderPerVideo: boolean
  avatar?: boolean
}

export interface DownloadRequest {
  operationId: string
  url: string
  playlistTitle?: string | null
  kind: DownloadKind
  maxHeight: number | null
  audioFormat: 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav'
  outputDir: string
  container: 'mp4' | 'mkv' | 'webm'
  ensureH264?: boolean
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
  proxy: string | null
  useCookies: boolean
  douyin: DouyinOptions
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
  message: string | null
  errorCode?: DownloadErrorCode
}

export type DownloadResultStatus = 'done' | 'skipped' | 'cancelled' | 'error'

export interface DownloadResult {
  operationId: string
  status: DownloadResultStatus
  files: readonly string[]
  primaryFile: string | null
  errorCode?: DownloadErrorCode
}

export interface DownloadOperationStatus {
  operationId: string
  url: string
  state: 'starting' | 'running' | 'finished' | 'cancelled' | 'error'
  progress: DownloadProgress | null
  result: DownloadResult | null
}

export interface DownloadProxyTestResult {
  ok: boolean
  errorCode?: DownloadErrorCode
}

export type DownloadAuthSite = DownloadPlatform
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
  start(request: DownloadRequest): Promise<DownloadResult>
  list(): Promise<DownloadOperationStatus[]>
  cancel(operationId: string): void
  onProgress(listener: (progress: DownloadProgress) => void): () => void
  testProxy(proxy: string): Promise<DownloadProxyTestResult>
  thumbnail(request: DownloadThumbnailRequest): Promise<DownloadThumbnailResult>
  auth: {
    status(): Promise<DownloadAuthStatus[]>
    login(site: DownloadAuthSite): Promise<DownloadAuthStatus>
    clear(site: DownloadAuthSite): Promise<void>
    onEvent(listener: (event: DownloadAuthEvent) => void): () => void
  }
}

export function isDownloadPlatform(value: unknown): value is DownloadPlatform {
  return value === 'facebook' || value === 'tiktok' || value === 'douyin' || value === 'youtube'
}

export function isDownloadAuthSite(value: unknown): value is DownloadAuthSite {
  return isDownloadPlatform(value)
}

export function isDownloadOperationID(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value)
}

export function isDownloadThumbnailRequest(value: unknown): value is DownloadThumbnailRequest {
  return typeof value === 'object'
    && value !== null
    && typeof (value as DownloadThumbnailRequest).thumbnailURL === 'string'
    && typeof (value as DownloadThumbnailRequest).sourceURL === 'string'
    && ((value as DownloadThumbnailRequest).useCookies === undefined || typeof (value as DownloadThumbnailRequest).useCookies === 'boolean')
}

export function isDownloadProbeRequest(value: unknown): value is DownloadProbeRequest {
  return typeof value === 'object'
    && value !== null
    && typeof (value as DownloadProbeRequest).url === 'string'
    && ((value as DownloadProbeRequest).useCookies === undefined || typeof (value as DownloadProbeRequest).useCookies === 'boolean')
}

export function isDownloadRequest(value: unknown): value is DownloadRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Partial<DownloadRequest>
  return isDownloadOperationID(request.operationId)
    && typeof request.url === 'string'
    && (request.kind === 'video' || request.kind === 'audio')
    && typeof request.outputDir === 'string'
    && typeof request.outputTemplate === 'string'
    && typeof request.douyin === 'object'
    && request.douyin !== null
}

export function isDownloadProgress(value: unknown): value is DownloadProgress {
  return typeof value === 'object'
    && value !== null
    && isDownloadOperationID((value as DownloadProgress).operationId)
    && typeof (value as DownloadProgress).phase === 'string'
}
