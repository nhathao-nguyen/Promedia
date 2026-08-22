import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { readFile, readdir, realpath, rm, stat } from 'node:fs/promises'

import type {
  DownloadCandidate,
  DownloadErrorCode,
  DownloadFormat,
  DownloadProbeCollection,
  DownloadProgress,
  YtDlpDownloadOptions,
  YtDlpDownloadRequest,
  DownloadResult,
} from '../../shared/download.ts'
import { detectDownloadPlatform } from './sites.ts'
import { runProcess } from './process.ts'
import { ensureH264Files } from './codec.ts'

const ytDlpRuntimeID = 'yt-dlp'
const mediaRuntimeID = 'media-processing'
const progressMarker = 'PROMEDIAPROGRESS|'
const fileMarker = 'PROMEDIAFILE|'
const maximumProbeOutputBytes = 8 * 1_024 * 1_024
const maximumProcessOutputBytes = 512 * 1_024
const maximumProbeCandidates = 500
const maximumProbeCollections = 32
const maximumProbeDepth = 3
const maximumMetadataWorkers = 4
const videoExtensions = new Set(['.avi', '.flv', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.ts', '.webm'])
const audioExtensions = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav'])

export interface DownloadEngineRuntime {
  resolveExecutable(runtimeID: string, logicalName: string, signal: AbortSignal): Promise<string>
}

export interface DownloadEngineRequest extends YtDlpDownloadRequest {
  cookieFile: string | null
  archivePath: string
}

interface InternalDownloadResult {
  result: DownloadResult
  rawError: string
}

export class YtDlpDownloadEngine {
  private readonly runtime: DownloadEngineRuntime

  constructor(runtime: DownloadEngineRuntime) {
    this.runtime = runtime
  }

  async probe(
    url: string,
    signal: AbortSignal,
    cookieFile: string | null = null,
  ): Promise<{ candidates: readonly DownloadCandidate[]; collections: readonly DownloadProbeCollection[] }> {
    const command = await this.runtime.resolveExecutable(ytDlpRuntimeID, 'yt-dlp', signal)
    const platform = detectDownloadPlatform(url)
    if (!platform) throw new DownloadEngineError('unsupported-platform')
    const rootPayload = await runMetadataRequest(command, url, cookieFile, signal, true)
    const collections = parseProbeCollections(rootPayload, url)
    const entries = collections.length > 0
      ? collectDirectProbeEntries(rootPayload, url)
      : await collectProbeEntries(
          command,
          url,
          cookieFile,
          signal,
          { remaining: maximumProbeCandidates },
          new Set<string>(),
          0,
          rootPayload,
        )
    const candidates = deduplicateCandidates(entries.map((entry) => (
      parseCandidate(entry.value, entry.url, platform, entry.playlistTitle)
    )))
    return {
      candidates: await enrichMissingThumbnails(command, candidates, cookieFile, signal),
      collections,
    }
  }

  async download(
    request: DownloadEngineRequest,
    signal: AbortSignal,
    report: (progress: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const command = await this.runtime.resolveExecutable(ytDlpRuntimeID, 'yt-dlp', signal)
    const platform = detectDownloadPlatform(request.url)
    if (!platform) throw new DownloadEngineError('unsupported-platform')

    const ffmpeg = await this.runtime.resolveExecutable(mediaRuntimeID, 'ffmpeg', signal)
    const ffmpegDirectory = dirname(ffmpeg)
    let activeRequest = request
    let attempt = await this.runAttempt(command, activeRequest, platform, signal, report, 'normal', ffmpegDirectory)
    if (!attempt.result.primaryFile && attempt.result.status === 'error' && platform === 'youtube' && request.cookieFile && attempt.result.errorCode === 'http-403') {
      report(progressFor(request.operationId, 'preparing', 'retry-without-cookies'))
      activeRequest = { ...request, cookieFile: null }
      attempt = await this.runAttempt(command, activeRequest, platform, signal, report, 'normal', ffmpegDirectory)
    }
    if (!attempt.result.primaryFile && attempt.result.status === 'error' && platform === 'youtube' && attempt.result.errorCode === 'http-403') {
      report(progressFor(request.operationId, 'preparing', 'retry-adaptive'))
      attempt = await this.runAttempt(command, activeRequest, platform, signal, report, 'adaptive', ffmpegDirectory)
    }
    if (!attempt.result.primaryFile && attempt.result.status === 'error' && platform === 'youtube' && attempt.result.errorCode === 'http-403') {
      report(progressFor(request.operationId, 'preparing', 'retry-progressive'))
      attempt = await this.runAttempt(command, activeRequest, platform, signal, report, 'progressive', ffmpegDirectory)
    }
    if (!attempt.result.primaryFile && attempt.result.status === 'error' && attempt.result.errorCode === 'format-unavailable') {
      report(progressFor(request.operationId, 'preparing', 'retry-automatic-format'))
      attempt = await this.runAttempt(command, activeRequest, platform, signal, report, 'format', ffmpegDirectory)
    }

    if (attempt.result.status === 'done' && request.options.ensureH264 && request.options.kind === 'video' && attempt.result.files.length > 0) {
      try {
        const files = await ensureH264Files(this.runtime, request.operationId, attempt.result.files, signal, report)
        const primaryFile = files.find((file) => /\.(?:avi|m4v|mkv|mov|mp4|mpeg|mpg|ts|webm)$/i.test(file)) ?? files[0] ?? null
        attempt = { ...attempt, result: { ...attempt.result, files, primaryFile } }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        report(progressFor(request.operationId, 'error', 'error', 'output-failed'))
        return { operationId: request.operationId, status: 'error', files: attempt.result.files, primaryFile: attempt.result.primaryFile, addedItemCount: 0, errorCode: 'output-failed' }
      }
    }
    return attempt.result
  }

  async testProxy(proxy: string, signal: AbortSignal): Promise<void> {
    const command = await this.runtime.resolveExecutable(ytDlpRuntimeID, 'yt-dlp', signal)
    const result = await runProcess(
      command,
      ['--ignore-config', '--proxy', proxy, '--socket-timeout', '20', '--skip-download', '--dump-single-json', 'https://api.ipify.org'],
      signal,
      maximumProbeOutputBytes,
    )
    if (result.aborted) throw cancellationError()
    if (result.code !== 0) throw classifiedError(result.stderr)
  }

  private async runAttempt(
    command: string,
    request: DownloadEngineRequest,
    platform: NonNullable<ReturnType<typeof detectDownloadPlatform>>,
    signal: AbortSignal,
    report: (progress: DownloadProgress) => void,
    mode: 'normal' | 'adaptive' | 'progressive' | 'format',
    ffmpegDirectory: string,
  ): Promise<InternalDownloadResult> {
    const sidecarPath = `${request.archivePath}.${request.operationId}.${mode}.sidecar`
    await rm(sidecarPath, { force: true }).catch(() => undefined)
    const args = buildArguments(request, platform, mode, ffmpegDirectory, sidecarPath)
    const files = new Set<string>()
    const legacyFiles = new Set<string>()
    let skipped = false
    const startedAt = Date.now()
    report(progressFor(request.operationId, 'preparing', 'preparing'))

    try {
      const process = await runProcess(command, args, signal, maximumProcessOutputBytes, (line, stream) => {
        if (line.startsWith(progressMarker)) {
          const progress = parseProgress(request.operationId, line)
          if (progress) report(progress)
          return
        }
        if (line.startsWith(fileMarker)) {
          const file = line.slice(fileMarker.length).trim()
          if (file) files.add(file)
          return
        }
        const destination = /^\[download\] Destination: (.+)$/i.exec(line.trim())
          ?? /^\[ExtractAudio\] Destination: (.+)$/i.exec(line.trim())
        const merge = /^\[Merger\] Merging formats into "(.+)"$/i.exec(line.trim())
        if (destination?.[1]) legacyFiles.add(destination[1])
        if (merge?.[1]) legacyFiles.add(merge[1])
        if (/has already been recorded in the archive|has already been downloaded/i.test(line)) skipped = true
        if (stream === 'stderr' && /\b(error|warning)\b/i.test(line)) {
          report(progressFor(request.operationId, 'postprocessing', 'postprocessing'))
        }
      })
      if (process.aborted) return { result: cancelledResult(request.operationId), rawError: '' }

      if (process.code !== 0) {
        const rawError = `${process.stderr}\n${process.stdout}`
        const errorCode = classifyDownloadError(rawError)
        report(progressFor(request.operationId, 'error', 'error', errorCode))
        return {
          result: {
            operationId: request.operationId,
            status: 'error',
            files: [...files],
            primaryFile: primaryOutputFile([...files], request.options.kind),
            addedItemCount: 0,
            errorCode,
          },
          rawError,
        }
      }

      const sidecarFiles = await readSidecarFiles(sidecarPath)
      const reportedFiles = new Set([...files, ...legacyFiles, ...sidecarFiles])
      const archiveSkipped = skipped && reportedFiles.size === 0
      if (!archiveSkipped && reportedFiles.size === 0) {
        const fallbackFile = await findRecentOutputFile(request.outputDir, startedAt, request.options.kind)
        if (fallbackFile) reportedFiles.add(fallbackFile)
      }
      const validatedFiles = archiveSkipped ? [] : await validateOutputFiles([...reportedFiles], request.outputDir)
      if (!archiveSkipped && validatedFiles.length === 0) {
        const errorCode = 'output-failed' as const
        report(progressFor(request.operationId, 'error', 'error', errorCode))
        return {
          result: {
            operationId: request.operationId,
            status: 'error',
            files: [],
            primaryFile: null,
            addedItemCount: 0,
            errorCode,
          },
          rawError: 'No valid output file was reported by yt-dlp',
        }
      }

      const result: DownloadResult = {
        operationId: request.operationId,
        status: archiveSkipped ? 'skipped' : 'done',
        files: validatedFiles,
        primaryFile: primaryOutputFile(validatedFiles, request.options.kind),
        addedItemCount: archiveSkipped ? 0 : 1,
      }
      report(progressFor(request.operationId, 'finished', 'finished'))
      return { result, rawError: '' }
    } finally {
      await rm(sidecarPath, { force: true }).catch(() => undefined)
    }
  }
}

export class DownloadEngineError extends Error {
  readonly code: DownloadErrorCode

  constructor(code: DownloadErrorCode) {
    super(code)
    this.name = 'DownloadEngineError'
    this.code = code
  }
}

function buildArguments(
  request: DownloadEngineRequest,
  platform: NonNullable<ReturnType<typeof detectDownloadPlatform>>,
  mode: 'normal' | 'adaptive' | 'progressive' | 'format',
  ffmpegDirectory: string,
  sidecarPath: string,
): string[] {
  const args = [
    '--ignore-config',
    '--newline',
    '--no-warnings',
    '--no-colors',
    '--socket-timeout',
    '30',
    '--progress-template',
    `download:${progressMarker}%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
    '--print',
    `after_move:${fileMarker}%(filepath)s`,
    '--print-to-file',
    'after_move:%(filepath|null)j',
    sidecarPath,
    '--no-quiet',
    '--ffmpeg-location',
    ffmpegDirectory,
  ]

  if (process.platform === 'win32') args.push('--windows-filenames')

  args.push('--no-playlist')

  if (request.options.kind === 'audio') {
    args.push('-x', '--audio-format', request.options.audioFormat, '--audio-quality', '0')
  } else {
    const selector = buildDownloadFormatSelector(request.options, mode)
    args.push('-f', selector, '--merge-output-format', request.options.container)
  }

  if (request.options.embedThumbnail) args.push('--embed-thumbnail')
  if (request.options.embedMetadata) args.push('--embed-metadata')
  if (request.options.writeSubtitles) {
    args.push('--write-subs', '--sub-langs', request.options.subtitleLanguages || 'vi,en')
    if (request.options.autoSubtitles) args.push('--write-auto-subs')
    if (request.options.embedSubtitles && request.options.kind === 'video') args.push('--embed-subs')
  }
  if (request.options.useArchive) {
    args.push('--download-archive', request.archivePath)
  }
  if (request.options.forceOverwrite) args.push('--force-overwrites')
  else args.push('--no-overwrites', '--no-post-overwrites')
  if (request.proxy) args.push('--proxy', request.proxy)
  if (request.cookieFile) args.push('--cookies', request.cookieFile)

  if (platform === 'youtube' && mode === 'adaptive') args.push('--extractor-args', 'youtube:player_client=web_embedded')

  const template = outputTemplate(request)
  args.push('-o', template, request.url)
  return args
}

export function buildDownloadFormatSelector(
  request: Pick<YtDlpDownloadOptions, 'kind' | 'maxHeight'>,
  mode: 'normal' | 'adaptive' | 'progressive' | 'format',
): string {
  if (request.kind === 'audio') return 'bestaudio/best'
  const height = request.maxHeight === null ? '' : `[height<=${request.maxHeight}]`
  if (mode === 'progressive') return `best${height}/best`
  if (mode === 'format') return 'bestvideo*+bestaudio/best'
  return `bestvideo*${height}+bestaudio/best${height}/best`
}

function outputTemplate(request: DownloadEngineRequest): string {
  let template = request.options.outputTemplate.trim() || '%(title)s [%(id)s].%(ext)s'
  if (request.options.folderMode === 'channel') template = `%(uploader)s/${template}`
  if (request.options.folderMode === 'playlist' && request.playlistTitle) template = `${safeSegment(request.playlistTitle)}/${template}`
  return join(request.outputDir, template)
}

export function parseCandidates(
  payload: unknown,
  sourceURL: string,
  platform: NonNullable<ReturnType<typeof detectDownloadPlatform>>,
): readonly DownloadCandidate[] {
  if (!isRecord(payload)) return []
  if (payload._type === 'playlist' && Array.isArray(payload.entries)) {
    const playlistTitle = stringValue(payload.title) ?? 'Playlist'
    return payload.entries.flatMap((entry) => {
      if (!isRecord(entry)) return []
      if (isNestedCollectionEntry(entry)) return []
      const rawURL = stringValue(entry.webpage_url) ?? stringValue(entry.url)
      if (!rawURL) return []
      const url = toAbsoluteURL(rawURL, sourceURL)
      return [parseCandidate(entry, url, platform, playlistTitle)]
    })
  }
  return [parseCandidate(payload, sourceURL, platform, null)]
}

interface ProbeEntry {
  value: Record<string, unknown>
  url: string
  playlistTitle: string | null
}

interface ProbeBudget {
  remaining: number
}

async function collectProbeEntries(
  command: string,
  sourceURL: string,
  cookieFile: string | null,
  signal: AbortSignal,
  budget: ProbeBudget,
  visited: Set<string>,
  depth: number,
  payload?: unknown,
): Promise<ProbeEntry[]> {
  if (budget.remaining <= 0 || depth > maximumProbeDepth || visited.has(sourceURL)) return []
  visited.add(sourceURL)
  const resolvedPayload = payload ?? await runMetadataRequest(command, sourceURL, cookieFile, signal, true)
  return collectProbeEntriesFromPayload(
    command,
    sourceURL,
    cookieFile,
    signal,
    budget,
    visited,
    depth,
    resolvedPayload,
  )
}

async function collectProbeEntriesFromPayload(
  command: string,
  sourceURL: string,
  cookieFile: string | null,
  signal: AbortSignal,
  budget: ProbeBudget,
  visited: Set<string>,
  depth: number,
  payload: unknown,
): Promise<ProbeEntry[]> {
  if (!isRecord(payload)) return []

  if (payload._type !== 'playlist' || !Array.isArray(payload.entries)) {
    budget.remaining -= 1
    return [{ value: payload, url: sourceURL, playlistTitle: null }]
  }

  const playlistTitle = stringValue(payload.title) ?? 'Playlist'
  const output: ProbeEntry[] = []
  for (const entry of payload.entries) {
    if (budget.remaining <= 0) break
    if (!isRecord(entry)) continue
    const rawURL = stringValue(entry.webpage_url) ?? stringValue(entry.url)
    if (!rawURL) continue
    const childURL = toAbsoluteURL(rawURL, sourceURL)
    if (isNestedCollectionEntry(entry)) {
      output.push(...await collectProbeEntries(
        command,
        childURL,
        cookieFile,
        signal,
        budget,
        visited,
        depth + 1,
      ))
      continue
    }
    budget.remaining -= 1
    output.push({ value: entry, url: childURL, playlistTitle })
  }
  return output
}

export function parseProbeCollections(payload: unknown, sourceURL: string): readonly DownloadProbeCollection[] {
  if (!isRecord(payload) || payload._type !== 'playlist' || !Array.isArray(payload.entries)) return []
  const seen = new Set<string>()
  const collections: DownloadProbeCollection[] = []
  for (const entry of payload.entries) {
    if (collections.length >= maximumProbeCollections || !isRecord(entry) || !isNestedCollectionEntry(entry)) continue
    const rawURL = stringValue(entry.webpage_url) ?? stringValue(entry.url)
    if (!rawURL) continue
    const url = toAbsoluteURL(rawURL, sourceURL)
    if (seen.has(url)) continue
    seen.add(url)
    collections.push({
      id: stringValue(entry.id) ?? url,
      title: stringValue(entry.title) ?? url,
      url,
      count: nonNegativeInteger(entry.playlist_count),
    })
  }
  return collections
}

function collectDirectProbeEntries(payload: unknown, sourceURL: string): ProbeEntry[] {
  if (!isRecord(payload) || payload._type !== 'playlist' || !Array.isArray(payload.entries)) return []
  const playlistTitle = stringValue(payload.title) ?? 'Playlist'
  return payload.entries.flatMap((entry) => {
    if (!isRecord(entry) || isNestedCollectionEntry(entry)) return []
    const rawURL = stringValue(entry.webpage_url) ?? stringValue(entry.url)
    if (!rawURL) return []
    return [{ value: entry, url: toAbsoluteURL(rawURL, sourceURL), playlistTitle }]
  })
}

async function runMetadataRequest(
  command: string,
  url: string,
  cookieFile: string | null,
  signal: AbortSignal,
  flatPlaylist: boolean,
): Promise<unknown> {
  const args = ['--ignore-config', '--dump-single-json', '--skip-download', '--no-warnings']
  if (flatPlaylist) args.push('--flat-playlist')
  else args.push('--no-playlist')
  if (cookieFile) args.push('--cookies', cookieFile)
  args.push(url)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const process = await runProcess(command, args, signal, maximumProbeOutputBytes)
    if (process.aborted) throw cancellationError()
    if (process.code !== 0) {
      if (attempt === 0) {
        await probeRetryDelay(signal)
        continue
      }
      throw classifiedError(process.stderr || process.stdout)
    }
    try {
      return JSON.parse(process.stdout)
    } catch {
      if (attempt === 0) {
        await probeRetryDelay(signal)
        continue
      }
      throw new DownloadEngineError('output-failed')
    }
  }
  throw new DownloadEngineError('output-failed')
}

async function probeRetryDelay(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw cancellationError()
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(cancellationError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, 450)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function isNestedCollectionEntry(value: Record<string, unknown>): boolean {
  if (value._type === 'playlist') return true
  const extractor = stringValue(value.ie_key)
  if (extractor?.endsWith('Tab')) return true
  const url = stringValue(value.webpage_url) ?? stringValue(value.url)
  if (!url) return false
  try {
    const pathSegments = new URL(url).pathname.split('/').filter(Boolean)
    const lastSegment = pathSegments[pathSegments.length - 1]?.toLowerCase()
    return lastSegment === 'videos'
      || lastSegment === 'shorts'
      || lastSegment === 'streams'
      || lastSegment === 'playlists'
      || lastSegment === 'community'
      || lastSegment === 'featured'
  } catch {
    return false
  }
}

function deduplicateCandidates(candidates: readonly DownloadCandidate[]): readonly DownloadCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = candidate.id || candidate.url
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function enrichMissingThumbnails(
  command: string,
  candidates: readonly DownloadCandidate[],
  cookieFile: string | null,
  signal: AbortSignal,
): Promise<readonly DownloadCandidate[]> {
  const result = [...candidates]
  let cursor = 0
  const workerCount = Math.min(maximumMetadataWorkers, result.filter((candidate) => !candidate.thumbnailURL).length)
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < result.length) {
      const index = cursor
      cursor += 1
      const candidate = result[index]
      if (!candidate || candidate.thumbnailURL) continue
      try {
        const payload = await runMetadataRequest(command, candidate.url, cookieFile, signal, false)
        if (!isRecord(payload)) continue
        const detail = parseCandidate(payload, candidate.url, candidate.platform, candidate.playlistTitle)
        result[index] = {
          ...candidate,
          title: detail.title === candidate.url ? candidate.title : detail.title,
          uploader: detail.uploader ?? candidate.uploader,
          durationSeconds: detail.durationSeconds ?? candidate.durationSeconds,
          durationLabel: detail.durationLabel ?? candidate.durationLabel,
          thumbnailURL: detail.thumbnailURL ?? candidate.thumbnailURL,
          formats: detail.formats.length > 0 ? detail.formats : candidate.formats,
          maxHeight: detail.maxHeight ?? candidate.maxHeight,
        }
      } catch {
        // Không làm hỏng toàn bộ danh sách khi một mục riêng lẻ bị giới hạn.
      }
    }
  }))
  return result
}

function parseCandidate(
  value: Record<string, unknown>,
  url: string,
  platform: NonNullable<ReturnType<typeof detectDownloadPlatform>>,
  playlistTitle: string | null,
): DownloadCandidate {
  const formats = Array.isArray(value.formats) ? value.formats.flatMap(parseFormat) : []
  const webpageURL = stringValue(value.webpage_url) ?? url
  const mediaID = stringValue(value.id) ?? extractYouTubeID(url)
  const thumbnailURL = safeHTTPSURL(stringValue(value.thumbnail))
    ?? firstYtDlpThumbnail(value.thumbnails)
    ?? fallbackThumbnailURL(platform, mediaID)
  return {
    id: mediaID ?? url,
    url,
    title: stringValue(value.title) ?? url,
    platform,
    uploader: stringValue(value.uploader) ?? stringValue(value.channel),
    durationSeconds: numberValue(value.duration),
    durationLabel: formatDuration(numberValue(value.duration)),
    thumbnailURL,
    webpageURL,
    playlistTitle,
    formats,
    maxHeight: formats.reduce<number | null>((max, format) => Math.max(max ?? 0, format.height ?? 0) || max, null),
  }
}

function parseFormat(value: unknown): DownloadFormat[] {
  if (!isRecord(value)) return []
  return [{
    id: stringValue(value.format_id) ?? '',
    ext: stringValue(value.ext),
    height: numberValue(value.height),
    fps: numberValue(value.fps),
    videoCodec: stringValue(value.vcodec),
    audioCodec: stringValue(value.acodec),
    sizeBytes: numberValue(value.filesize) ?? numberValue(value.filesize_approx),
  }]
}

function parseProgress(operationId: string, line: string): DownloadProgress | null {
  const values = line.slice(progressMarker.length).split('|')
  if (values.length < 6) return null
  const status = values[0]
  const downloadedBytes = numericValue(values[1])
  const totalBytes = numericValue(values[2]) ?? numericValue(values[3])
  const percent = totalBytes && downloadedBytes !== null
    ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    : null
  return {
    operationId,
    phase: status === 'finished' ? 'postprocessing' : 'downloading',
    percent,
    downloadedBytes,
    totalBytes,
    speed: cleanOptional(values[4]),
    eta: cleanOptional(values[5]),
    filePath: null,
    detailCode: null,
  }
}

function progressFor(
  operationId: string,
  phase: DownloadProgress['phase'],
  detailCode: DownloadProgress['detailCode'],
  errorCode?: DownloadErrorCode,
): DownloadProgress {
  return {
    operationId,
    phase,
    percent: phase === 'finished' ? 100 : null,
    downloadedBytes: null,
    totalBytes: null,
    speed: null,
    eta: null,
    filePath: null,
    detailCode,
    errorCode,
  }
}

function classifiedError(raw: string): Error {
  return new DownloadEngineError(classifyDownloadError(raw))
}

export function classifyDownloadError(raw: string): DownloadErrorCode {
  if (/403|forbidden/i.test(raw)) return 'http-403'
  if (/login|sign in|authentication|cookies?.*(required|need)|private video/i.test(raw)) return 'authentication-required'
  if (/429|too many requests|rate.?limit/i.test(raw)) return 'rate-limited'
  if (/requested format|format is not available|no video formats/i.test(raw)) return 'format-unavailable'
  if (/unable to download|timed? out|timeout|connection|network|dns|proxy/i.test(raw)) return 'network'
  return 'output-failed'
}

async function validateOutputFiles(files: readonly string[], outputDirectory: string): Promise<string[]> {
  const root = resolve(outputDirectory)
  const realRoot = await realpath(root).catch(() => null)
  if (!realRoot) return []

  const validated: string[] = []
  const seen = new Set<string>()
  for (const file of files) {
    if (!isAbsolute(file)) continue
    const candidate = resolve(file)
    const relativePath = relative(root, candidate)
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) continue
    try {
      const [realCandidate, details] = await Promise.all([realpath(candidate), stat(candidate)])
      const realRelativePath = relative(realRoot, realCandidate)
      if (!realRelativePath || realRelativePath === '..' || realRelativePath.startsWith(`..${sep}`) || isAbsolute(realRelativePath)) continue
      if (!details.isFile() || details.size <= 0 || seen.has(candidate)) continue
      seen.add(candidate)
      validated.push(candidate)
    } catch {
      continue
    }
  }
  return validated
}

async function readSidecarFiles(path: string): Promise<string[]> {
  try {
    const document = await readFile(path, 'utf8')
    const files = new Set<string>()
    for (const line of document.split(/\r?\n/)) {
      const value = line.trim()
      if (!value) continue
      try {
        const parsed: unknown = JSON.parse(value)
        if (typeof parsed === 'string' && parsed.trim()) files.add(parsed)
      } catch {
        if (value !== 'NA' && value !== 'null') files.add(value)
      }
    }
    return [...files]
  } catch {
    return []
  }
}

async function findRecentOutputFile(
  outputDirectory: string,
  startedAt: number,
    kind: YtDlpDownloadOptions['kind'],
): Promise<string | null> {
  const extensions = kind === 'audio' ? audioExtensions : videoExtensions
  const candidates: Array<{ path: string; mtimeMs: number }> = []
  let truncated = false

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 3 || candidates.length >= 500) {
      truncated = true
      return
    }
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (candidates.length >= 500) {
        truncated = true
        return
      }
      const file = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(file, depth + 1)
        continue
      }
      if (!entry.isFile() || !extensions.has(extname(entry.name).toLowerCase())) continue
      try {
        const details = await stat(file)
        if (details.size > 0) candidates.push({ path: file, mtimeMs: details.mtimeMs })
      } catch {
        continue
      }
    }
  }

  await walk(resolve(outputDirectory), 0)
  if (truncated) return null
  const recent = candidates.filter((candidate) => candidate.mtimeMs >= startedAt - 3_000)
  return recent.length === 1 ? recent[0].path : null
}

function primaryOutputFile(files: readonly string[], kind: YtDlpDownloadOptions['kind']): string | null {
  const extensions = kind === 'audio' ? audioExtensions : videoExtensions
  return files.find((file) => extensions.has(extname(file).toLowerCase())) ?? files[0] ?? null
}

function cancelledResult(operationId: string): DownloadResult {
  return { operationId, status: 'cancelled', files: [], primaryFile: null, addedItemCount: 0, errorCode: 'cancelled' }
}

function cancellationError(): DOMException {
  return new DOMException('Cancelled', 'AbortError')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeInteger(value: unknown): number | null {
  const number = numberValue(value)
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null
}

function numericValue(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function cleanOptional(value: string): string | null {
  return value && value !== 'NA' && value !== 'none' ? value : null
}

function toAbsoluteURL(value: string, base: string): string {
  try {
    return new URL(value, base).toString()
  } catch {
    return value
  }
}

function safeHTTPSURL(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function fallbackThumbnailURL(
  platform: NonNullable<ReturnType<typeof detectDownloadPlatform>>,
  id: string | null,
): string | null {
  if (platform !== 'youtube' || !id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
}

function firstYtDlpThumbnail(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const item of value) {
    if (!isRecord(item)) continue
    const url = safeHTTPSURL(stringValue(item.url))
    if (url) return url
  }
  return null
}

function extractYouTubeID(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.hostname === 'youtu.be') return validYouTubeID(parsed.pathname.slice(1))
    const queryID = parsed.searchParams.get('v')
    if (queryID) return validYouTubeID(queryID)
    const match = parsed.pathname.match(/\/(?:shorts|embed|live)\/([^/?#]+)/i)
    return validYouTubeID(match?.[1] ?? null)
  } catch {
    return null
  }
}

function validYouTubeID(value: string | null): string | null {
  return value && /^[A-Za-z0-9_-]{6,20}$/.test(value) ? value : null
}

function safeSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Playlist'
}

function formatDuration(value: number | null): string | null {
  if (value === null) return null
  const total = Math.max(0, Math.round(value))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}
