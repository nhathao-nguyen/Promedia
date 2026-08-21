export const serverHealthChannels = {
  check: 'server-health:check',
  cancel: 'server-health:cancel',
} as const

export type ServerHealthStatus =
  | 'connected'
  | 'invalid-request'
  | 'invalid-response'
  | 'unreachable'
  | 'timeout'
  | 'cancelled'
  | 'busy'

export interface ServerHealthRequest {
  requestId: string
  baseURL: string
  timeoutMs: number
}

export interface ServerHealthResult {
  requestId: string
  status: ServerHealthStatus
  baseURL?: string
}

export interface ServerHealthAPI {
  check(request: ServerHealthRequest): Promise<ServerHealthResult>
  cancel(requestId: string): void
}

export function normalizeServerURL(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`

  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (!url.hostname || url.username || url.password || url.search || url.hash) return null

    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function isServerHealthRequest(value: unknown): value is ServerHealthRequest {
  if (typeof value !== 'object' || value === null) return false

  const request = value as Partial<ServerHealthRequest>
  return typeof request.requestId === 'string'
    && request.requestId.length > 0
    && request.requestId.length <= 128
    && typeof request.baseURL === 'string'
    && request.baseURL.length <= 2_048
    && Number.isInteger(request.timeoutMs)
    && (request.timeoutMs ?? 0) >= 100
    && (request.timeoutMs ?? 0) <= 60_000
}
