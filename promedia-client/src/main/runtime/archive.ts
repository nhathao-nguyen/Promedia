import { spawn } from 'node:child_process'
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises'
import { basename, join, posix, relative, resolve, sep } from 'node:path'

import type { RuntimeExecutableDeclaration } from './catalog.ts'

const maximumArchiveEntries = 20_000
const maximumListingBytes = 4 * 1_024 * 1_024

export async function extractRuntimeExecutables(
  archivePath: string,
  destination: string,
  declarations: Readonly<Record<string, RuntimeExecutableDeclaration>>,
  signal: AbortSignal,
): Promise<Readonly<Record<string, string>>> {
  const listing = await runTar(['-tf', archivePath], signal, maximumListingBytes)
  validateArchiveEntries(listing.split(/\r?\n/))

  const verboseListing = await runTar(['-tvf', archivePath], signal, maximumListingBytes)
  validateArchiveEntryTypes(verboseListing.split(/\r?\n/))

  const extractedDirectory = join(destination, 'extracted')
  const payloadDirectory = join(destination, 'payload')
  const binaryDirectory = join(payloadDirectory, 'bin')
  await mkdir(extractedDirectory, { recursive: true })
  await mkdir(binaryDirectory, { recursive: true })
  await runTar(['-xf', archivePath, '-C', extractedDirectory], signal, maximumListingBytes)

  const files = await collectRegularFiles(extractedDirectory)
  const installedPaths: Record<string, string> = {}
  for (const [logicalName, declaration] of Object.entries(declarations)) {
    const candidates = files
      .filter((file) => basename(file) === declaration.fileName)
      .sort((left, right) => left.length - right.length)
    const source = candidates[0]
    if (!source) throw new ArchiveError('executable-missing')

    const relativePath = join('bin', declaration.fileName)
    await copyFile(source, join(payloadDirectory, relativePath))
    installedPaths[logicalName] = relativePath
  }

  return installedPaths
}

export function validateArchiveEntries(entries: readonly string[]): void {
  if (entries.length > maximumArchiveEntries) throw new ArchiveError('too-many-entries')

  for (const rawEntry of entries) {
    const entry = rawEntry.trim()
    if (!entry) continue
    const normalized = entry.replaceAll('\\', '/')
    const segments = normalized.split('/')
    if (
      normalized.includes('\0')
      || posix.isAbsolute(normalized)
      || /^[a-z]:/i.test(normalized)
      || segments.some((segment) => segment === '..')
    ) {
      throw new ArchiveError('unsafe-entry')
    }
  }
}

export class ArchiveError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'ArchiveError'
  }
}

async function collectRegularFiles(root: string): Promise<string[]> {
  const rootPath = resolve(root)
  const pending = [rootPath]
  const files: string[] = []
  let entryCount = 0

  while (pending.length > 0) {
    const directory = pending.pop()
    if (!directory) break
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      entryCount += 1
      if (entryCount > maximumArchiveEntries) throw new ArchiveError('too-many-entries')
      const entryPath = join(directory, entry.name)
      const stat = await lstat(entryPath)
      if (stat.isSymbolicLink()) throw new ArchiveError('link-not-allowed')
      if (stat.isDirectory()) {
        pending.push(entryPath)
      } else if (stat.isFile()) {
        assertInside(rootPath, entryPath)
        files.push(entryPath)
      } else {
        throw new ArchiveError('special-entry-not-allowed')
      }
    }
  }

  return files
}

function validateArchiveEntryTypes(lines: readonly string[]): void {
  for (const line of lines) {
    if (!line.trim()) continue
    const type = line.trimStart()[0]
    if (type !== '-' && type !== 'd') throw new ArchiveError('link-not-allowed')
  }
}

function assertInside(parent: string, child: string): void {
  const childRelativePath = relative(parent, resolve(child))
  if (childRelativePath === '..' || childRelativePath.startsWith(`..${sep}`)) {
    throw new ArchiveError('unsafe-entry')
  }
}

function runTar(args: readonly string[], signal: AbortSignal, maximumOutputBytes: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.platform === 'win32' ? 'tar.exe' : 'tar', args, {
      shell: false,
      signal,
      windowsHide: true,
    })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    let outputBytes = 0

    const capture = (chunks: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.length
      if (outputBytes > maximumOutputBytes) {
        child.kill()
        reject(new ArchiveError('listing-too-large'))
        return
      }
      chunks.push(chunk)
    }

    child.stdout.on('data', (chunk: Buffer) => capture(output, chunk))
    child.stderr.on('data', (chunk: Buffer) => capture(errors, chunk))
    child.once('error', reject)
    child.once('close', (code) => {
      if (signal.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'))
      } else if (code !== 0) {
        reject(new ArchiveError('extract-failed'))
      } else {
        resolvePromise(Buffer.concat(output).toString('utf8'))
      }
    })
  })
}
