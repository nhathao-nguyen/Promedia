import { mkdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import type {
  DownloadCandidate,
  DownloadErrorCode,
  DownloadAuthSite,
  DownloadPlatform,
  DownloadProbeCollection,
  DownloadProbeRequest,
  DownloadRequest,
  DownloadResult,
  DownloadThumbnailRequest,
} from '../../shared/download.ts'
import { DownloadEngineError, type DownloadEngineRequest, YtDlpDownloadEngine } from './engine.ts'
import { DouyinDownloadEngine } from './douyin-engine.ts'
import { detectDownloadPlatform, isSupportedDownloadURL } from './sites.ts'
import type { DownloadAuthService } from './auth.ts'
import { fetchThumbnailDataURL } from './thumbnail.ts'

export interface DownloadRuntime {
  resolveExecutable(runtimeID: string, logicalName: string, signal: AbortSignal): Promise<string>
}

export class DownloadService {
  private readonly engine: YtDlpDownloadEngine
  private readonly douyinEngine: DouyinDownloadEngine

  constructor(
    private readonly runtime: DownloadRuntime,
    private readonly auth: DownloadAuthService,
    private readonly userDataRoot: string,
  ) {
    this.engine = new YtDlpDownloadEngine(runtime)
    this.douyinEngine = new DouyinDownloadEngine(runtime, userDataRoot)
  }

  async probe(
    request: DownloadProbeRequest,
    signal: AbortSignal,
  ): Promise<{ candidates: readonly DownloadCandidate[]; collections: readonly DownloadProbeCollection[] }> {
    const url = normalizeURL(request.url)
    const platform = detectDownloadPlatform(url)
    if (!platform) throw new DownloadEngineError('unsupported-platform')
    const authSite = authSiteForPlatform(platform)
    const cookies = request.useCookies && authSite ? await this.auth.cookies(authSite) : {}
    if (platform === 'douyin') {
      return {
        candidates: await this.douyinEngine.probe(url, cookies, signal),
        collections: [],
      }
    }
    await this.requireRuntime(signal, false)
    return this.engine.probe(url, signal, request.useCookies && authSite ? this.auth.cookieFile(authSite) : null)
  }

  async thumbnail(request: DownloadThumbnailRequest, signal: AbortSignal): Promise<string | null> {
    const sourceURL = normalizeURL(request.sourceURL)
    const platform = detectDownloadPlatform(sourceURL)
    if (!platform) throw new DownloadEngineError('unsupported-platform')
    const authSite = authSiteForPlatform(platform)
    const cookies = request.useCookies && authSite ? await this.auth.cookies(authSite) : {}
    return fetchThumbnailDataURL(request.thumbnailURL, sourceURL, cookies, signal)
  }

  async start(
    request: DownloadRequest,
    signal: AbortSignal,
    report: Parameters<YtDlpDownloadEngine['download']>[2],
  ): Promise<DownloadResult> {
    const normalized = normalizeRequest(request)
    await mkdir(normalized.outputDir, { recursive: true })
    const platform = detectDownloadPlatform(normalized.url)
    if (!platform) throw new DownloadEngineError('unsupported-platform')
    const authSite = authSiteForPlatform(platform)

    if (normalized.engine === 'douyin') {
      await this.runtime.resolveExecutable('douyin-engine', 'douyin-engine', signal)
      if (normalized.options.ensureH264) await this.runtime.resolveExecutable('media-processing', 'ffmpeg', signal)
      return this.douyinEngine.download({
        request: normalized,
        cookies: normalized.useCookies && authSite ? await this.auth.cookies(authSite) : {},
        databasePath: join(this.userDataRoot, 'douyin-library.db'),
      }, signal, report)
    }

    await this.requireRuntime(signal, true)

    const engineRequest: DownloadEngineRequest = {
      ...normalized,
      cookieFile: normalized.useCookies && authSite ? this.auth.cookieFile(authSite) : null,
      archivePath: join(this.userDataRoot, 'download-archive.txt'),
    }
    return this.engine.download(engineRequest, signal, report)
  }

  async testProxy(proxy: string, signal: AbortSignal): Promise<void> {
    const value = proxy.trim()
    if (!isValidProxy(value)) throw new DownloadEngineError('invalid-request')
    await this.requireRuntime(signal, false)
    await this.engine.testProxy(value, signal)
  }

  private async requireRuntime(signal: AbortSignal, needsMedia: boolean): Promise<void> {
    await this.runtime.resolveExecutable('yt-dlp', 'yt-dlp', signal)
    if (needsMedia) await this.runtime.resolveExecutable('media-processing', 'ffmpeg', signal)
  }

}

function authSiteForPlatform(platform: DownloadPlatform): DownloadAuthSite | null {
  return platform === 'youtube' ? null : platform
}

function normalizeURL(value: string): string {
  const url = value.trim()
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new DownloadEngineError('invalid-url')
  } catch (error) {
    if (error instanceof DownloadEngineError) throw error
    throw new DownloadEngineError('invalid-url')
  }
  if (!isSupportedDownloadURL(url)) throw new DownloadEngineError('unsupported-platform')
  return url
}

function normalizeRequest(request: DownloadRequest): DownloadRequest {
  const url = normalizeURL(request.url)
  if (!isAbsolute(request.outputDir) || request.outputDir.includes('\0')) {
    throw new DownloadEngineError('invalid-request')
  }
  if (request.proxy && !isValidProxy(request.proxy)) throw new DownloadEngineError('invalid-request')
  if (request.engine === 'douyin') {
    if (!Number.isSafeInteger(request.options.batchSize) || request.options.batchSize < 1 || request.options.batchSize > 10_000) {
      throw new DownloadEngineError('invalid-request')
    }
    if (!['all', 'batch', 'new'].includes(request.options.mode)) throw new DownloadEngineError('invalid-request')
    return {
      ...request,
      url,
      options: { ...request.options },
    }
  }

  if (!request.options.outputTemplate.trim() || request.options.outputTemplate.includes('\0') || isAbsolute(request.options.outputTemplate) || request.options.outputTemplate.split(/[\\/]/).includes('..')) {
    throw new DownloadEngineError('invalid-request')
  }
  if (!['mp3', 'm4a', 'opus', 'flac', 'wav'].includes(request.options.audioFormat)) {
    throw new DownloadEngineError('invalid-request')
  }
  if (!['mp4', 'mkv', 'webm'].includes(request.options.container)) throw new DownloadEngineError('invalid-request')
  if (!['flat', 'playlist', 'channel'].includes(request.options.folderMode)) throw new DownloadEngineError('invalid-request')
  if (request.options.maxHeight !== null && (!Number.isSafeInteger(request.options.maxHeight) || request.options.maxHeight < 144 || request.options.maxHeight > 8_640)) {
    throw new DownloadEngineError('invalid-request')
  }
  return {
    ...request,
    url,
    options: { ...request.options },
  }
}

function isValidProxy(value: string): boolean {
  return /^(https?|socks(?:4|5h?)):.*:\d{2,5}$/i.test(value)
}

export function downloadErrorCode(error: unknown): DownloadErrorCode {
  if (error instanceof DownloadEngineError) return error.code
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code)
    if (code === 'runtime-not-ready' || code === 'runtime-not-found') return 'runtime-missing'
    if (code === 'probe-failed' || code === 'invalid-marker') return 'runtime-invalid'
  }
  return 'unknown'
}
