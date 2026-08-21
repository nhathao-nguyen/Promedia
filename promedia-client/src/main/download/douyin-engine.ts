import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type {
  DownloadCandidate,
  DownloadErrorCode,
  DownloadProgress,
  DownloadRequest,
  DownloadResult,
} from '../../shared/download.ts'
import { probeDouyinURL } from './douyin-api.ts'
import { classifyDownloadError, type DownloadEngineRuntime } from './engine.ts'
import { ensureH264Files } from './codec.ts'
import { runProcess } from './process.ts'

const runtimeID = 'douyin-engine'
const executableName = 'douyin-engine'
const maximumEngineOutputBytes = 4 * 1_024 * 1_024

export interface DouyinDownloadRequest {
  request: DownloadRequest
  cookies: Readonly<Record<string, string>>
  databasePath: string
}

export class DouyinDownloadEngine {
  constructor(
    private readonly runtime: DownloadEngineRuntime,
    private readonly userDataRoot: string,
  ) {}

  async probe(
    url: string,
    cookies: Readonly<Record<string, string>>,
    signal: AbortSignal,
  ): Promise<readonly DownloadCandidate[]> {
    await this.runtime.resolveExecutable(runtimeID, executableName, signal)
    return probeDouyinURL(url, cookies, signal)
  }

  async download(
    input: DouyinDownloadRequest,
    signal: AbortSignal,
    report: (progress: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const command = await this.runtime.resolveExecutable(runtimeID, executableName, signal)
    const scratchDirectory = await mkdtemp(join(this.userDataRoot, 'douyin-download-'))
    const configPath = join(scratchDirectory, 'config.json')
    const manifestPath = join(input.request.outputDir, 'download_manifest.jsonl')
    const manifestOffset = await fileSize(manifestPath)
    await writeFile(configPath, JSON.stringify(buildConfig(input), null, 2), 'utf8')

    let downloaded = 0
    let skipped = 0
    const handleLine = (line: string): void => {
      const value = line.trim()
      if (!value) return
      const downloadedMatch = /Downloaded (?:video|image|媒体)?:?\s*(.+?)\s*\(\d+\)\s*$/i.exec(value)
      if (downloadedMatch) {
        downloaded += 1
        report(progressFor(input.request.operationId, 'downloading', downloadedMatch[1]))
        return
      }
      const skippedMatch = /Skipped\s*[│|]\s*(\d+)/i.exec(value)
      if (skippedMatch) skipped = Number(skippedMatch[1]) || skipped
    }

    report(progressFor(input.request.operationId, 'preparing', null))
    try {
      const process = await runProcess(
        command,
        ['-c', configPath, '--verbose'],
        signal,
        maximumEngineOutputBytes,
        (line) => handleLine(line),
      )
      if (process.aborted) return cancelledResult(input.request.operationId)
      if (process.code !== 0) {
        const errorCode = classifyDownloadError(process.stderr || process.stdout)
        report(progressFor(input.request.operationId, 'error', null, errorCode))
        return {
          operationId: input.request.operationId,
          status: 'error',
          files: [],
          primaryFile: null,
          errorCode,
        }
      }

      let files = await readManifestFiles(manifestPath, manifestOffset, input.request.outputDir)
      if (downloaded > 0 && files.length === 0) {
        report(progressFor(input.request.operationId, 'error', null, 'output-failed'))
        return {
          operationId: input.request.operationId,
          status: 'error',
          files: [],
          primaryFile: null,
          errorCode: 'output-failed',
        }
      }
      if (downloaded > 0 && files.length > 0 && input.request.ensureH264 === true) {
        try {
          files = [...await ensureH264Files(this.runtime, input.request.operationId, files, signal, report)]
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          report(progressFor(input.request.operationId, 'error', null, 'output-failed'))
          return {
            operationId: input.request.operationId,
            status: 'error',
            files,
            primaryFile: primaryVideoFile(files),
            errorCode: 'output-failed',
          }
        }
      }
      const status = downloaded === 0 && skipped > 0 ? 'skipped' : 'done'
      report(progressFor(input.request.operationId, 'finished', null))
      return {
        operationId: input.request.operationId,
        status,
        files,
        primaryFile: primaryVideoFile(files),
      }
    } finally {
      await rm(scratchDirectory, { force: true, recursive: true }).catch(() => undefined)
    }
  }
}

function buildConfig(input: DouyinDownloadRequest): object {
  const { request } = input
  const isChannel = /\/user\//i.test(request.url)
  const number = { post: 0 }
  const increase = { post: false }
  if (isChannel && request.douyin.mode === 'batch') number.post = Math.max(1, request.douyin.batchSize)
  if (isChannel && request.douyin.mode === 'new') increase.post = true

  return {
    link: [request.url],
    path: request.outputDir.replace(/[\\/]+$/, '').replace(/\\/g, '/') + '/',
    music: request.douyin.music || request.kind === 'audio',
    cover: request.douyin.cover,
    avatar: request.douyin.avatar === true,
    json: request.douyin.metadata,
    folderstyle: request.douyin.folderPerVideo,
    mode: ['post'],
    number,
    increase,
    thread: 5,
    retry_times: 3,
    proxy: request.proxy || '',
    database: true,
    database_path: input.databasePath.replace(/\\/g, '/'),
    browser_fallback: { enabled: false },
    progress: { quiet_logs: true },
    cookies: input.cookies,
  }
}

function progressFor(
  operationId: string,
  phase: DownloadProgress['phase'],
  message: string | null,
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
    message,
    errorCode,
  }
}

function cancelledResult(operationId: string): DownloadResult {
  return { operationId, status: 'cancelled', files: [], primaryFile: null, errorCode: 'cancelled' }
}

function primaryVideoFile(files: readonly string[]): string | null {
  return files.find((file) => /\.(?:avi|m4v|mkv|mov|mp4|mpeg|mpg|ts|webm)$/i.test(file)) ?? files[0] ?? null
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

async function readManifestFiles(path: string, offset: number, outputDir: string): Promise<string[]> {
  try {
    const document = await readFile(path)
    const root = resolve(outputDir)
    const realRoot = await realpath(root).catch(() => null)
    if (!realRoot) return []
    const start = Math.min(Math.max(0, offset), document.length)
    const files = new Set<string>()
    for (const line of document.subarray(start).toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let record: unknown
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      if (!isRecord(record) || !Array.isArray(record.file_paths)) continue
      for (const value of record.file_paths) {
        if (typeof value !== 'string' || !value || value.includes('\0')) continue
        const file = isAbsolute(value) ? resolve(value) : resolve(outputDir, value)
        const relativePath = relative(root, file)
        if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) continue
        let realFile: string
        let details: Awaited<ReturnType<typeof stat>>
        try {
          [realFile, details] = await Promise.all([realpath(file), stat(file)])
        } catch {
          continue
        }
        const realRelativePath = relative(realRoot, realFile)
        if (!realRelativePath || realRelativePath === '..' || realRelativePath.startsWith(`..${sep}`) || isAbsolute(realRelativePath)) continue
        if (!details.isFile() || details.size <= 0) continue
        files.add(file)
      }
    }
    return [...files]
  } catch {
    return []
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
