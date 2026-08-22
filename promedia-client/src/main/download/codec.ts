import { randomUUID } from 'node:crypto'
import { rename, rm, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

import type { DownloadProgress } from '../../shared/download.ts'
import { runProcess } from './process.ts'

const mediaRuntimeID = 'media-processing'
const maximumProcessOutputBytes = 512 * 1_024
const videoExtensions = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.ts', '.webm'])
type FileOperations = {
  rename: typeof rename
  rm: typeof rm
  stat: typeof stat
}

const fileOperations: FileOperations = { rename, rm, stat }

export interface VideoCodecRuntime {
  resolveExecutable(runtimeID: string, logicalName: string, signal: AbortSignal): Promise<string>
}

export async function ensureH264Files(
  runtime: VideoCodecRuntime,
  operationId: string,
  files: readonly string[],
  signal: AbortSignal,
  report: (progress: DownloadProgress) => void,
): Promise<readonly string[]> {
  const videos = files.filter(isVideoFile)
  if (videos.length === 0) return files

  const ffprobe = await runtime.resolveExecutable(mediaRuntimeID, 'ffprobe', signal)
  const codecs = new Map<string, string | null>()
  for (const file of videos) {
    if (await pathExists(file)) codecs.set(file, await probeVideoCodec(ffprobe, file, signal))
  }
  const needsConversion = videos.some((file) => codecs.get(file) !== undefined && codecs.get(file) !== 'h264')
  if (!needsConversion) return files

  const ffmpeg = await runtime.resolveExecutable(mediaRuntimeID, 'ffmpeg', signal)
  const encoder = await selectH264Encoder(ffmpeg, signal)
  const normalized: string[] = []
  for (const file of files) {
    if (!isVideoFile(file)) {
      normalized.push(file)
      continue
    }
    if (!(await pathExists(file))) {
      normalized.push(file)
      continue
    }
    const codec = codecs.get(file) ?? null
    if (codec === 'h264') {
      normalized.push(file)
      continue
    }

    report({
      operationId,
      phase: 'converting',
      percent: null,
      downloadedBytes: null,
      totalBytes: null,
      speed: null,
      eta: null,
      filePath: file,
      detailCode: 'conversion-h264',
    })
    const converted = await transcodeToH264(ffmpeg, encoder, file, signal)
    await replaceWithConvertedFile(file, converted)
    normalized.push(outputPathFor(file))
  }
  return normalized
}

async function selectH264Encoder(ffmpeg: string, signal: AbortSignal): Promise<readonly string[]> {
  const result = await runProcess(ffmpeg, ['-hide_banner', '-encoders'], signal, maximumProcessOutputBytes)
  if (result.aborted) throw cancellationError()
  const raw = `${result.stdout}\n${result.stderr}`
  if (result.code !== 0) throw new Error('FFmpeg encoder probe failed')
  if (/\blibx264\b/.test(raw)) return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20']
  if (/\blibopenh264\b/.test(raw)) return ['-c:v', 'libopenh264', '-b:v', '4M']
  if (/\bh264_mf\b/.test(raw)) return ['-c:v', 'h264_mf', '-b:v', '4M']
  if (/\bh264_nvenc\b/.test(raw)) return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23', '-b:v', '0']
  if (/\bh264_qsv\b/.test(raw)) return ['-c:v', 'h264_qsv', '-global_quality', '23']
  throw new Error('No H.264 encoder is available')
}

async function probeVideoCodec(ffprobe: string, file: string, signal: AbortSignal): Promise<string | null> {
  const result = await runProcess(
    ffprobe,
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', file],
    signal,
    maximumProcessOutputBytes,
  )
  if (result.aborted) throw cancellationError()
  if (result.code !== 0) return null
  return result.stdout.trim().split(/\s+/)[0]?.toLowerCase() || null
}

async function transcodeToH264(
  ffmpeg: string,
  encoder: readonly string[],
  file: string,
  signal: AbortSignal,
): Promise<string> {
  const temporary = join(dirname(file), `.${randomUUID()}.h264.mp4`)
  const result = await runProcess(
    ffmpeg,
    [
      '-y',
      '-i', file,
      '-map', '0:v:0',
      '-map', '0:a?',
      ...encoder,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      temporary,
    ],
    signal,
    maximumProcessOutputBytes,
  )
  if (result.aborted) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw cancellationError()
  }
  if (result.code !== 0) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw new Error('FFmpeg H.264 conversion failed')
  }
  return temporary
}

export async function replaceWithConvertedFile(
  original: string,
  converted: string,
  operations: FileOperations = fileOperations,
): Promise<void> {
  const output = outputPathFor(original)
  const originalBackup = `${original}.${randomUUID()}.bak`
  const outputBackup = output === original ? null : `${output}.${randomUUID()}.bak`
  await assertNonEmptyFile(converted, operations)

  const originalWasPresent = await pathExistsAny(original, operations)
  if (!originalWasPresent) throw new Error('Original media file is missing')
  const outputWasPresent = outputBackup !== null && await pathExistsAny(output, operations)
  let originalMoved = false
  let outputMoved = false
  let convertedMoved = false

  try {
    await operations.rename(original, originalBackup)
    originalMoved = true
    if (outputBackup && outputWasPresent) {
      await operations.rename(output, outputBackup)
      outputMoved = true
    }
    await operations.rename(converted, output)
    convertedMoved = true
    await assertNonEmptyFile(output, operations)
  } catch (error) {
    // Chỉ xóa output mới đã được cài; target cũ phải được giữ nguyên nếu bước backup thất bại.
    if (convertedMoved) await operations.rm(output, { force: true }).catch(() => undefined)
    if (outputMoved && outputBackup) await operations.rename(outputBackup, output).catch(() => undefined)
    if (originalMoved) await operations.rename(originalBackup, original).catch(() => undefined)
    await operations.rm(converted, { force: true }).catch(() => undefined)
    throw error
  }

  let cleanupError: unknown = null
  await operations.rm(originalBackup, { force: true }).catch((error) => { cleanupError ??= error })
  if (outputBackup) await operations.rm(outputBackup, { force: true }).catch((error) => { cleanupError ??= error })
  if (cleanupError) throw cleanupError
}

function outputPathFor(file: string): string {
  return extname(file).toLowerCase() === '.mp4' ? file : `${file.slice(0, -extname(file).length)}.mp4`
}

function isVideoFile(file: string): boolean {
  return videoExtensions.has(extname(file).toLowerCase())
}

async function pathExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function pathExistsAny(file: string, operations: FileOperations = fileOperations): Promise<boolean> {
  try {
    await operations.stat(file)
    return true
  } catch {
    return false
  }
}

async function assertNonEmptyFile(file: string, operations: FileOperations = fileOperations): Promise<void> {
  const details = await operations.stat(file).catch(() => null)
  if (!details?.isFile() || details.size <= 0) throw new Error('Converted media file is missing or empty')
}

function cancellationError(): DOMException {
  return new DOMException('Cancelled', 'AbortError')
}
