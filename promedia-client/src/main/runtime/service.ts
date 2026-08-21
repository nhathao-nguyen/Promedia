import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  statfs,
  writeFile,
} from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type {
  RuntimeInstallFailureCode,
  RuntimeInstallProgress,
  RuntimeStatus,
} from '../../shared/runtime.ts'
import { ArchiveError, extractRuntimeExecutables } from './archive.ts'
import {
  fetchAllowed,
  findRuntime,
  resolveRuntimeSource,
  runtimeCatalog,
  RuntimeSourceError,
  type ResolvedRuntimeSource,
  type RuntimeCatalogEntry,
  type RuntimeExecutableDeclaration,
} from './catalog.ts'

const sourceCacheLifetimeMs = 5 * 60 * 1_000
const sourceResolutionTimeoutMs = 30_000
const artifactDownloadTimeoutMs = 30 * 60 * 1_000
const minimumFreeSpaceMargin = 64 * 1_024 * 1_024
const probeTimeoutMs = 10_000
const maximumProbeOutputBytes = 128 * 1_024

interface InstalledExecutable {
  path: string
  sha256: string
}

interface InstalledMarker {
  schemaVersion: 1
  runtimeId: string
  version: string
  artifactName: string
  artifactSize: number
  artifactSHA256: string
  installedAt: string
  installationDirectory: string
  executables: Record<string, InstalledExecutable>
}

interface LocalInspection {
  state: 'ready' | 'missing' | 'invalid'
  marker?: InstalledMarker
}

type ProgressReporter = (progress: Omit<RuntimeInstallProgress, 'operationId' | 'runtimeId'>) => void

export class RuntimeService {
  private readonly sourceCache = new Map<string, { expiresAt: number; value: ResolvedRuntimeSource }>()
  private readonly rootDirectory: string

  constructor(rootDirectory: string) {
    this.rootDirectory = rootDirectory
  }

  async list(signal: AbortSignal): Promise<RuntimeStatus[]> {
    return Promise.all(runtimeCatalog().map((entry) => this.statusForEntry(entry, signal)))
  }

  async status(runtimeId: string, signal: AbortSignal): Promise<RuntimeStatus | null> {
    const entry = findRuntime(runtimeId)
    return entry ? this.statusForEntry(entry, signal) : null
  }

  async install(runtimeId: string, signal: AbortSignal, report: ProgressReporter): Promise<void> {
    const entry = findRuntime(runtimeId)
    if (!entry) throw new RuntimeInstallError('runtime-not-found')
    if (!entry.platforms[platformKey()]) throw new RuntimeInstallError('unsupported')

    const existing = await inspectLocalInstall(this.runtimeDirectory(entry.id), entry, signal)
    if (existing.state === 'ready') {
      report({
        phase: 'done',
        receivedBytes: existing.marker?.artifactSize,
        totalBytes: existing.marker?.artifactSize,
        percent: 100,
      })
      return
    }

    report({ phase: 'resolving' })
    const source = await this.resolveSource(
      entry,
      AbortSignal.any([signal, AbortSignal.timeout(sourceResolutionTimeoutMs)]),
      true,
    )
    throwIfCancelled(signal)

    const runtimeDirectory = this.runtimeDirectory(entry.id)
    await mkdir(runtimeDirectory, { recursive: true })
    await assertFreeSpace(runtimeDirectory, source.artifactSize)
    const stagingDirectory = await mkdtemp(join(runtimeDirectory, '.install-'))
    const archivePath = join(stagingDirectory, `artifact${archiveExtension(source.archive)}`)
    let installationCommitted = false

    try {
      await downloadArtifact(
        source,
        archivePath,
        AbortSignal.any([signal, AbortSignal.timeout(artifactDownloadTimeoutMs)]),
        (receivedBytes) => {
        report({
          phase: 'downloading',
          receivedBytes,
          totalBytes: source.artifactSize,
          percent: Math.min(100, Math.round((receivedBytes / source.artifactSize) * 100)),
        })
        },
      )
      throwIfCancelled(signal)
      report({ phase: 'verifying', receivedBytes: source.artifactSize, totalBytes: source.artifactSize, percent: 100 })

      const artifactHash = await hashFile(archivePath, signal)
      if (artifactHash !== source.sha256) throw new RuntimeInstallError('checksum-mismatch')

      report({ phase: 'extracting' })
      const relativeExecutablePaths = await extractRuntimeExecutables(
        archivePath,
        stagingDirectory,
        source.executables,
        signal,
      )
      throwIfCancelled(signal)

      report({ phase: 'installing' })
      const payloadDirectory = join(stagingDirectory, 'payload')
      const executables = await validatePayload(
        payloadDirectory,
        relativeExecutablePaths,
        source.executables,
        signal,
      )
      const installationDirectory = installDirectoryName(source)
      const finalDirectory = join(runtimeDirectory, installationDirectory)
      await rename(payloadDirectory, finalDirectory)

      const marker: InstalledMarker = {
        schemaVersion: 1,
        runtimeId: entry.id,
        version: source.version,
        artifactName: source.artifactName,
        artifactSize: source.artifactSize,
        artifactSHA256: source.sha256,
        installedAt: new Date().toISOString(),
        installationDirectory,
        executables,
      }

      try {
        await replaceMarker(runtimeDirectory, marker)
        installationCommitted = true
      } catch (error) {
        await rm(finalDirectory, { force: true, recursive: true })
        throw error
      }

      try {
        await pruneOldInstallations(runtimeDirectory, installationDirectory)
      } catch {
        console.warn('Old runtime installation cleanup was deferred', { runtimeId: entry.id })
      }
      report({ phase: 'done', receivedBytes: source.artifactSize, totalBytes: source.artifactSize, percent: 100 })
    } finally {
      try {
        await rm(stagingDirectory, { force: true, recursive: true })
      } catch (error) {
        if (!installationCommitted) throw error
        console.warn('Runtime staging cleanup was deferred', { runtimeId: entry.id })
      }
    }
  }

  private async statusForEntry(entry: RuntimeCatalogEntry, signal: AbortSignal): Promise<RuntimeStatus> {
    if (!entry.platforms[platformKey()]) {
      return baseStatus(entry, 'unsupported', false)
    }

    const local = await inspectLocalInstall(this.runtimeDirectory(entry.id), entry, signal)
    try {
      const source = await this.resolveSource(entry, signal)
      return {
        ...baseStatus(entry, local.state, local.state !== 'ready'),
        installedVersion: local.marker?.version,
        installedAt: local.marker?.installedAt,
        availableVersion: source.version,
        downloadSizeBytes: source.artifactSize,
      }
    } catch {
      if (local.state === 'ready') {
        return {
          ...baseStatus(entry, 'ready', false),
          installedVersion: local.marker?.version,
          installedAt: local.marker?.installedAt,
          availableVersion: local.marker?.version,
          downloadSizeBytes: local.marker?.artifactSize,
        }
      }
      if (local.state === 'invalid') return baseStatus(entry, 'invalid', false)
      return baseStatus(entry, 'source-unavailable', false)
    }
  }

  private async resolveSource(
    entry: RuntimeCatalogEntry,
    signal: AbortSignal,
    refresh = false,
  ): Promise<ResolvedRuntimeSource> {
    const cached = this.sourceCache.get(entry.id)
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value

    const value = await resolveRuntimeSource(entry, process.platform, process.arch, signal)
    this.sourceCache.set(entry.id, { value, expiresAt: Date.now() + sourceCacheLifetimeMs })
    return value
  }

  private runtimeDirectory(runtimeId: string): string {
    return join(this.rootDirectory, runtimeId)
  }
}

export class RuntimeInstallError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'RuntimeInstallError'
  }
}

function baseStatus(
  entry: RuntimeCatalogEntry,
  state: RuntimeStatus['state'],
  canInstall: boolean,
): RuntimeStatus {
  return {
    runtimeId: entry.id,
    metadata: entry.metadata,
    state,
    canInstall,
  }
}

async function inspectLocalInstall(
  runtimeDirectory: string,
  entry: RuntimeCatalogEntry,
  signal: AbortSignal,
): Promise<LocalInspection> {
  let marker: InstalledMarker
  try {
    marker = parseMarker(await readFile(join(runtimeDirectory, 'installed.json'), 'utf8'))
  } catch (error) {
    return isMissingFile(error) ? { state: 'missing' } : { state: 'invalid' }
  }

  if (marker.runtimeId !== entry.id) return { state: 'invalid' }
  const declarations = entry.platforms[platformKey()]?.executables
  if (!declarations) return { state: 'invalid' }

  try {
    for (const [logicalName, declaration] of Object.entries(declarations)) {
      throwIfCancelled(signal)
      const installed = marker.executables[logicalName]
      if (!installed) return { state: 'invalid' }
      const executablePath = safeInstalledPath(runtimeDirectory, marker.installationDirectory, installed.path)
      const stat = await lstat(executablePath)
      if (!stat.isFile() || stat.isSymbolicLink()) return { state: 'invalid' }
      if (await hashFile(executablePath, signal) !== installed.sha256) return { state: 'invalid' }
      await probeExecutable(executablePath, declaration, signal)
    }
  } catch {
    return { state: 'invalid' }
  }

  return { state: 'ready', marker }
}

async function validatePayload(
  payloadDirectory: string,
  relativePaths: Readonly<Record<string, string>>,
  declarations: Readonly<Record<string, RuntimeExecutableDeclaration>>,
  signal: AbortSignal,
): Promise<Record<string, InstalledExecutable>> {
  const executables: Record<string, InstalledExecutable> = {}
  for (const [logicalName, declaration] of Object.entries(declarations)) {
    const relativePath = relativePaths[logicalName]
    if (!relativePath) throw new RuntimeInstallError('executable-missing')
    const executablePath = safeInstalledPath(payloadDirectory, '.', relativePath)
    if (process.platform !== 'win32') await chmod(executablePath, 0o755)
    await probeExecutable(executablePath, declaration, signal)
    executables[logicalName] = { path: relativePath, sha256: await hashFile(executablePath, signal) }
  }
  return executables
}

async function downloadArtifact(
  source: ResolvedRuntimeSource,
  destination: string,
  signal: AbortSignal,
  reportBytes: (receivedBytes: number) => void,
): Promise<void> {
  const response = await fetchAllowed(
    source.artifactURL,
    source.allowedHosts,
    signal,
    { 'User-Agent': 'Promedia-runtime-manager' },
  )
  const contentLength = response.headers.get('content-length')
  const declaredLength = contentLength === null ? Number.NaN : Number(contentLength)
  if (Number.isFinite(declaredLength) && declaredLength !== source.artifactSize) {
    throw new RuntimeInstallError('size-mismatch')
  }
  if (!response.body) throw new RuntimeInstallError('empty-download')

  const file = await open(destination, 'wx')
  const reader = response.body.getReader()
  let receivedBytes = 0
  let lastReportAt = 0
  let downloadComplete = false
  try {
    while (true) {
      throwIfCancelled(signal)
      const chunk = await reader.read()
      if (chunk.done) {
        downloadComplete = true
        break
      }
      receivedBytes += chunk.value.byteLength
      if (receivedBytes > source.artifactSize) throw new RuntimeInstallError('size-mismatch')
      await file.write(chunk.value)
      if (Date.now() - lastReportAt >= 150) {
        reportBytes(receivedBytes)
        lastReportAt = Date.now()
      }
    }
    await file.sync()
  } finally {
    if (!downloadComplete) await reader.cancel().catch(() => {})
    await file.close()
    reader.releaseLock()
  }

  if (receivedBytes !== source.artifactSize) throw new RuntimeInstallError('size-mismatch')
  reportBytes(receivedBytes)
}

async function hashFile(path: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  try {
    for await (const chunk of stream) {
      throwIfCancelled(signal)
      hash.update(chunk as Buffer)
    }
  } finally {
    stream.destroy()
  }
  return hash.digest('hex')
}

function probeExecutable(
  executablePath: string,
  declaration: RuntimeExecutableDeclaration,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executablePath, declaration.probeArgs, {
      shell: false,
      windowsHide: true,
    })
    const output: Buffer[] = []
    let outputBytes = 0
    let settled = false
    let terminalError: Error | undefined

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
      if (error) reject(error)
      else resolvePromise()
    }
    const cancel = (): void => {
      if (terminalError) return
      terminalError = new DOMException('Cancelled', 'AbortError')
      child.kill()
    }
    const timeout = setTimeout(() => {
      if (terminalError) return
      terminalError = new RuntimeInstallError('probe-timeout')
      child.kill()
    }, probeTimeoutMs)

    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    const capture = (chunk: Buffer): void => {
      if (terminalError) return
      outputBytes += chunk.length
      if (outputBytes > maximumProbeOutputBytes) {
        terminalError = new RuntimeInstallError('probe-output-too-large')
        child.kill()
      } else {
        output.push(chunk)
      }
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.once('error', finish)
    child.once('close', (code) => {
      if (settled) return
      if (terminalError) {
        finish(terminalError)
        return
      }
      const text = Buffer.concat(output).toString('utf8')
      if (code !== 0 || !new RegExp(declaration.probePattern, 'm').test(text)) {
        finish(new RuntimeInstallError('probe-failed'))
      } else {
        finish()
      }
    })
  })
}

async function assertFreeSpace(path: string, artifactSize: number): Promise<void> {
  const filesystem = await statfs(path, { bigint: true })
  const availableBytes = filesystem.bavail * filesystem.bsize
  const requiredBytes = BigInt((artifactSize * 4) + minimumFreeSpaceMargin)
  if (availableBytes < requiredBytes) throw new RuntimeInstallError('insufficient-space')
}

async function replaceMarker(runtimeDirectory: string, marker: InstalledMarker): Promise<void> {
  const markerPath = join(runtimeDirectory, 'installed.json')
  const temporaryPath = join(runtimeDirectory, `.installed-${randomUUID()}.json`)
  const backupPath = join(runtimeDirectory, `.installed-${randomUUID()}.backup`)
  await writeFile(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })

  let hasBackup = false
  try {
    try {
      await rename(markerPath, backupPath)
      hasBackup = true
    } catch (error) {
      if (!isMissingFile(error)) throw error
    }
    await rename(temporaryPath, markerPath)
    if (hasBackup) await rm(backupPath, { force: true })
  } catch (error) {
    await rm(temporaryPath, { force: true })
    if (hasBackup) await rename(backupPath, markerPath)
    throw error
  }
}

async function pruneOldInstallations(runtimeDirectory: string, currentDirectory: string): Promise<void> {
  for (const entry of await readdir(runtimeDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === currentDirectory || entry.name.startsWith('.install-')) continue
    const oldDirectory = join(runtimeDirectory, entry.name)
    assertInside(runtimeDirectory, oldDirectory)
    await rm(oldDirectory, { force: true, recursive: true })
  }
}

function parseMarker(document: string): InstalledMarker {
  const value = JSON.parse(document) as Partial<InstalledMarker>
  if (
    value.schemaVersion !== 1
    || typeof value.runtimeId !== 'string'
    || typeof value.version !== 'string'
    || typeof value.artifactName !== 'string'
    || typeof value.artifactSize !== 'number'
    || typeof value.artifactSHA256 !== 'string'
    || typeof value.installedAt !== 'string'
    || typeof value.installationDirectory !== 'string'
    || typeof value.executables !== 'object'
    || value.executables === null
  ) {
    throw new RuntimeInstallError('invalid-marker')
  }
  return value as InstalledMarker
}

function safeInstalledPath(root: string, installationDirectory: string, relativePath: string): string {
  if (!isSafeRelativePath(installationDirectory) || !isSafeRelativePath(relativePath)) {
    throw new RuntimeInstallError('unsafe-marker-path')
  }
  const parent = resolve(root)
  const child = resolve(root, installationDirectory, relativePath)
  assertInside(parent, child)
  return child
}

function isSafeRelativePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  return Boolean(path)
    && !path.includes('\0')
    && !isAbsolute(path)
    && !/^[a-z]:/i.test(normalized)
    && !normalized.startsWith('/')
    && !normalized.split('/').includes('..')
}

function assertInside(parent: string, child: string): void {
  const childRelativePath = relative(resolve(parent), resolve(child))
  if (!childRelativePath || childRelativePath === '..' || childRelativePath.startsWith(`..${sep}`)) {
    throw new RuntimeInstallError('unsafe-path')
  }
}

function installDirectoryName(source: ResolvedRuntimeSource): string {
  return `${source.version.replace(/[^a-zA-Z0-9._-]/g, '-')}-${source.sha256.slice(0, 12)}-${Date.now()}`
}

function archiveExtension(archive: ResolvedRuntimeSource['archive']): string {
  return archive === 'zip' ? '.zip' : '.tar.xz'
}

function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

function throwIfCancelled(signal: AbortSignal): void {
  if (!signal.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new DOMException('Cancelled', 'AbortError')
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function runtimeInstallFailureCode(error: unknown): RuntimeInstallFailureCode {
  if (error instanceof RuntimeSourceError) {
    return error.code === 'unsupported' ? 'unsupported' : 'source-unavailable'
  }
  if (error instanceof ArchiveError) {
    if (error.code === 'executable-missing') return 'invalid-runtime'
    return [
      'unsafe-entry',
      'link-not-allowed',
      'special-entry-not-allowed',
      'too-many-entries',
      'listing-too-large',
    ].includes(error.code)
      ? 'unsafe-archive'
      : 'extract-failed'
  }
  if (error instanceof RuntimeInstallError) {
    if (error.code === 'unsupported') return 'unsupported'
    if (error.code === 'insufficient-space') return 'insufficient-space'
    if (error.code === 'checksum-mismatch') return 'checksum-mismatch'
    if (['size-mismatch', 'empty-download'].includes(error.code)) return 'download-invalid'
    if (['executable-missing', 'probe-timeout', 'probe-output-too-large', 'probe-failed'].includes(error.code)) {
      return 'invalid-runtime'
    }
    if (error.code === 'runtime-not-found') return 'unsupported'
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'network'
  if (error instanceof TypeError) return 'network'
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error.code === 'ENOSPC' ? 'insufficient-space' : 'filesystem'
  }
  return 'unknown'
}
