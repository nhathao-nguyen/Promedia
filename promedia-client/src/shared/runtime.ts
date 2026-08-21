export const runtimeChannels = {
  list: 'runtime:list',
  status: 'runtime:status',
  install: 'runtime:install',
  cancel: 'runtime:cancel',
  progress: 'runtime:progress',
} as const

export type LocalizedRuntimeText = Readonly<Record<'vi' | 'en', string>>

export type RuntimeState =
  | 'ready'
  | 'missing'
  | 'invalid'
  | 'installing'
  | 'unsupported'
  | 'source-unavailable'

export interface RuntimeDisplayMetadata {
  featureName: LocalizedRuntimeText
  description: LocalizedRuntimeText
  privacy: LocalizedRuntimeText
  componentNames: readonly string[]
  processingLocation: 'device' | 'server'
  license: {
    name: string
    url: string
  }
}

export interface RuntimeStatus {
  runtimeId: string
  metadata: RuntimeDisplayMetadata
  state: RuntimeState
  installedVersion?: string
  availableVersion?: string
  downloadSizeBytes?: number
  installedAt?: string
  canInstall: boolean
}

export type RuntimeInstallPhase =
  | 'resolving'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'done'
  | 'error'
  | 'cancelled'

export type RuntimeInstallFailureCode =
  | 'busy'
  | 'network'
  | 'source-unavailable'
  | 'unsupported'
  | 'insufficient-space'
  | 'download-invalid'
  | 'checksum-mismatch'
  | 'unsafe-archive'
  | 'extract-failed'
  | 'invalid-runtime'
  | 'filesystem'
  | 'unknown'

export interface RuntimeInstallProgress {
  operationId: string
  runtimeId: string
  phase: RuntimeInstallPhase
  receivedBytes?: number
  totalBytes?: number
  percent?: number
  errorCode?: RuntimeInstallFailureCode
}

export interface RuntimeInstallRequest {
  operationId: string
  runtimeId: string
}

export interface RuntimeStatusRequest {
  runtimeId: string
}

export type RuntimeInstallResultStatus =
  | 'installed'
  | 'cancelled'
  | 'busy'
  | 'invalid-request'
  | 'failed'

export interface RuntimeInstallResult {
  operationId: string
  runtimeId: string
  status: RuntimeInstallResultStatus
  errorCode?: RuntimeInstallFailureCode
}

export interface RuntimeAPI {
  list(): Promise<RuntimeStatus[]>
  status(request: RuntimeStatusRequest): Promise<RuntimeStatus | null>
  install(request: RuntimeInstallRequest): Promise<RuntimeInstallResult>
  cancel(operationId: string): void
  onProgress(listener: (progress: RuntimeInstallProgress) => void): () => void
}

export function isRuntimeID(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value)
}

export function isRuntimeStatusRequest(value: unknown): value is RuntimeStatusRequest {
  return typeof value === 'object'
    && value !== null
    && 'runtimeId' in value
    && isRuntimeID(value.runtimeId)
}

export function isRuntimeInstallRequest(value: unknown): value is RuntimeInstallRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Partial<RuntimeInstallRequest>
  return isRuntimeID(request.runtimeId)
    && typeof request.operationId === 'string'
    && /^[a-zA-Z0-9-]{1,128}$/.test(request.operationId)
}
