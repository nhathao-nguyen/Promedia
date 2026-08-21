import catalogDocument from './catalog.json' with { type: 'json' }

import { isRuntimeID, type RuntimeDisplayMetadata } from '../../shared/runtime.ts'

const maximumMetadataBytes = 2 * 1_024 * 1_024
const maximumChecksumBytes = 128 * 1_024
const maximumRedirects = 5

export interface RuntimeExecutableDeclaration {
  fileName: string
  probeArgs: readonly string[]
  probePattern: string
}

interface CatalogPlatform {
  archive: 'zip' | 'tar.xz' | 'file'
  assetPattern: string
  versionGroup: string
  matchingVersionGroup?: string
  executables: Readonly<Record<string, RuntimeExecutableDeclaration>>
}

export interface RuntimeCatalogEntry {
  id: string
  metadata: RuntimeDisplayMetadata
  source: {
    apiURL: string
    checksumAssetName?: string
    checksumFromAssetDigest?: boolean
    allowedHosts: readonly string[]
  }
  platforms: Readonly<Record<string, CatalogPlatform>>
}

interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
  digest?: string
}

interface ReleasePayload {
  assets: ReleaseAsset[]
  tagName: string
}

export interface ResolvedRuntimeSource {
  runtimeId: string
  version: string
  artifactName: string
  artifactURL: string
  artifactSize: number
  sha256: string
  archive: CatalogPlatform['archive']
  executables: CatalogPlatform['executables']
  allowedHosts: readonly string[]
}

const catalog = validateCatalog(catalogDocument)

export function runtimeCatalog(): readonly RuntimeCatalogEntry[] {
  return catalog
}

export function findRuntime(runtimeId: string): RuntimeCatalogEntry | undefined {
  return catalog.find((entry) => entry.id === runtimeId)
}

export async function resolveRuntimeSource(
  entry: RuntimeCatalogEntry,
  platform: NodeJS.Platform,
  architecture: string,
  signal: AbortSignal,
): Promise<ResolvedRuntimeSource> {
  const platformEntry = entry.platforms[`${platform}-${architecture}`]
  if (!platformEntry) throw new RuntimeSourceError('unsupported')

  const releaseResponse = await fetchAllowed(entry.source.apiURL, entry.source.allowedHosts, signal, {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Promedia-runtime-manager',
  })
  const release = parseRelease(await readBoundedText(releaseResponse, maximumMetadataBytes))
  const selected = selectReleaseArtifact(
    release.assets,
    platformEntry.assetPattern,
    platformEntry.versionGroup,
    platformEntry.matchingVersionGroup,
    release.tagName,
  )
  if (!selected) throw new RuntimeSourceError('artifact-missing')

  let checksum: string | null = null
  if (entry.source.checksumAssetName) {
    const checksumAsset = release.assets.find((asset) => asset.name === entry.source.checksumAssetName)
    if (!checksumAsset) throw new RuntimeSourceError('checksum-missing')

    const checksumResponse = await fetchAllowed(
      checksumAsset.browser_download_url,
      entry.source.allowedHosts,
      signal,
      { 'User-Agent': 'Promedia-runtime-manager' },
    )
    checksum = parseChecksum(
      await readBoundedText(checksumResponse, maximumChecksumBytes),
      selected.asset.name,
    )
  } else if (entry.source.checksumFromAssetDigest) {
    checksum = parseAssetDigest(selected.asset.digest)
  }
  if (!checksum) throw new RuntimeSourceError('checksum-missing')

  return {
    runtimeId: entry.id,
    version: selected.version,
    artifactName: selected.asset.name,
    artifactURL: selected.asset.browser_download_url,
    artifactSize: selected.asset.size,
    sha256: checksum,
    archive: platformEntry.archive,
    executables: platformEntry.executables,
    allowedHosts: entry.source.allowedHosts,
  }
}

export function selectReleaseArtifact(
  assets: readonly ReleaseAsset[],
  assetPattern: string,
  versionGroup: string,
  matchingVersionGroup?: string,
  releaseVersion?: string,
): { asset: ReleaseAsset; version: string } | null {
  const pattern = new RegExp(assetPattern)

  const candidates = assets.flatMap((asset) => {
    const match = pattern.exec(asset.name)
    if (!match) return []
    const version = versionGroup === 'release' ? releaseVersion : match.groups?.[versionGroup]
    const matchingVersion = matchingVersionGroup ? match?.groups?.[matchingVersionGroup] : version
    if (!version || version !== matchingVersion || (versionGroup !== 'release' && !isNumericVersion(version))) return []
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0) return []
    return [{ asset, version }]
  })

  return candidates.sort((left, right) => compareVersions(right.version, left.version))[0] ?? null
}

export function parseChecksum(document: string, artifactName: string): string | null {
  for (const line of document.split(/\r?\n/)) {
    const match = /^([a-f\d]{64})\s+\*?(.+)$/i.exec(line.trim())
    if (match && match[2] === artifactName) return match[1].toLowerCase()
  }
  return null
}

export function parseAssetDigest(value: string | undefined): string | null {
  const match = /^sha256:([a-f\d]{64})$/i.exec(value ?? '')
  return match?.[1].toLowerCase() ?? null
}

export async function fetchAllowed(
  url: string,
  allowedHosts: readonly string[],
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<Response> {
  let currentURL = validateSourceURL(url, allowedHosts)

  for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
    const response = await fetch(currentURL, { headers, redirect: 'manual', signal })
    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) throw new RuntimeSourceError('http-error')
      return response
    }

    const location = response.headers.get('location')
    if (!location || redirectCount === maximumRedirects) throw new RuntimeSourceError('redirect-error')
    currentURL = validateSourceURL(new URL(location, currentURL).toString(), allowedHosts)
  }

  throw new RuntimeSourceError('redirect-error')
}

export class RuntimeSourceError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'RuntimeSourceError'
  }
}

function validateCatalog(value: unknown): readonly RuntimeCatalogEntry[] {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid runtime catalog')
  const document = value as { schemaVersion?: unknown; runtimes?: unknown }
  if (document.schemaVersion !== 1 || !Array.isArray(document.runtimes)) {
    throw new Error('Unsupported runtime catalog')
  }

  const entries = document.runtimes as RuntimeCatalogEntry[]
  const runtimeIDs = new Set<string>()
  for (const entry of entries) {
    if (!isRuntimeID(entry.id) || runtimeIDs.has(entry.id) || !entry.metadata || !entry.source || !entry.platforms) {
      throw new Error('Invalid runtime catalog entry')
    }
    runtimeIDs.add(entry.id)
    validateMetadata(entry.metadata)
    if (
      (entry.source.checksumAssetName !== undefined
        && (typeof entry.source.checksumAssetName !== 'string' || entry.source.checksumAssetName.length === 0))
      || (entry.source.checksumAssetName === undefined && entry.source.checksumFromAssetDigest !== true)
      || !Array.isArray(entry.source.allowedHosts)
      || entry.source.allowedHosts.length === 0
      || !entry.source.allowedHosts.every((host) => typeof host === 'string' && host.length > 0)
    ) {
      throw new Error('Invalid runtime source')
    }
    validateSourceURL(entry.source.apiURL, entry.source.allowedHosts)
    for (const platform of Object.values(entry.platforms)) validatePlatform(platform)
  }
  return entries
}

function validateMetadata(metadata: RuntimeDisplayMetadata): void {
  const localizedValues = [metadata.featureName, metadata.description, metadata.privacy]
  if (
    !localizedValues.every((value) => typeof value?.vi === 'string' && value.vi.length > 0 && typeof value.en === 'string' && value.en.length > 0)
    || !Array.isArray(metadata.componentNames)
    || !metadata.componentNames.every((name) => typeof name === 'string' && name.length > 0)
    || !['device', 'server'].includes(metadata.processingLocation)
    || typeof metadata.license?.name !== 'string'
    || typeof metadata.license?.url !== 'string'
  ) {
    throw new Error('Invalid runtime metadata')
  }
  const licenseURL = new URL(metadata.license.url)
  if (licenseURL.protocol !== 'https:') throw new Error('Invalid runtime license URL')
}

function validatePlatform(platform: CatalogPlatform): void {
  if (
    !['zip', 'tar.xz', 'file'].includes(platform.archive)
    || typeof platform.assetPattern !== 'string'
    || typeof platform.versionGroup !== 'string'
    || (platform.matchingVersionGroup !== undefined && typeof platform.matchingVersionGroup !== 'string')
    || typeof platform.executables !== 'object'
    || platform.executables === null
    || Object.keys(platform.executables).length === 0
  ) {
    throw new Error('Invalid runtime platform declaration')
  }
  const pattern = new RegExp(platform.assetPattern)
  if (!platform.assetPattern.startsWith('^') || !platform.assetPattern.endsWith('$')) {
    throw new Error('Runtime artifact pattern must be anchored')
  }
  void pattern
  for (const executable of Object.values(platform.executables)) {
    if (
      typeof executable.fileName !== 'string'
      || !/^[a-zA-Z0-9._-]+$/.test(executable.fileName)
      || !Array.isArray(executable.probeArgs)
      || !executable.probeArgs.every((argument) => typeof argument === 'string' && argument.length <= 256)
      || typeof executable.probePattern !== 'string'
    ) {
      throw new Error('Invalid runtime executable declaration')
    }
    new RegExp(executable.probePattern)
  }
}

function parseRelease(document: string): ReleasePayload {
  let value: unknown
  try {
    value = JSON.parse(document)
  } catch {
    throw new RuntimeSourceError('invalid-metadata')
  }

  if (typeof value !== 'object' || value === null || !('assets' in value) || !Array.isArray(value.assets)) {
    throw new RuntimeSourceError('invalid-metadata')
  }

  const assets = value.assets.flatMap((candidate: unknown): ReleaseAsset[] => {
    if (typeof candidate !== 'object' || candidate === null) return []
    const asset = candidate as Partial<ReleaseAsset>
    return typeof asset.name === 'string'
      && typeof asset.browser_download_url === 'string'
      && typeof asset.size === 'number'
      ? [{
          name: asset.name,
          size: asset.size,
          browser_download_url: asset.browser_download_url,
          digest: typeof asset.digest === 'string' ? asset.digest : undefined,
        }]
      : []
  })
  const rawTagName = (value as { tag_name?: unknown }).tag_name
  const tagName = typeof rawTagName === 'string' ? rawTagName.replace(/^v/, '') : ''
  return { assets, tagName }
}

async function readBoundedText(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RuntimeSourceError('response-too-large')
  }
  const body = await response.text()
  if (Buffer.byteLength(body, 'utf8') > maximumBytes) {
    throw new RuntimeSourceError('response-too-large')
  }
  return body
}

function validateSourceURL(value: string, allowedHosts: readonly string[]): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) {
    throw new RuntimeSourceError('source-not-allowed')
  }
  return url
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function isNumericVersion(value: string): boolean {
  return /^\d+(?:\.\d+)*$/.test(value)
}
