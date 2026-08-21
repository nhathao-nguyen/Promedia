import {
  isServerHealthRequest,
  normalizeServerURL,
  type ServerHealthRequest,
  type ServerHealthResult,
} from '../shared/server-health.ts'

const maximumResponseBytes = 64 * 1_024

interface HealthResponse {
  status: 'ok'
}

export async function requestServerHealth(
  request: unknown,
  signal: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<ServerHealthResult> {
  const requestId = readRequestId(request)
  if (!isServerHealthRequest(request)) {
    return { requestId, status: 'invalid-request' }
  }

  const baseURL = normalizeServerURL(request.baseURL)
  if (!baseURL) {
    return { requestId, status: 'invalid-request' }
  }

  try {
    const response = await fetchImplementation(serverEndpoint(baseURL, 'healthz'), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      redirect: 'error',
      signal,
    })

    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return { requestId, status: 'invalid-response', baseURL }
    }

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
      return { requestId, status: 'invalid-response', baseURL }
    }

    const responseBody = await response.text()
    if (Buffer.byteLength(responseBody, 'utf8') > maximumResponseBytes) {
      return { requestId, status: 'invalid-response', baseURL }
    }

    const payload = parseResponse(responseBody)
    if (!isHealthResponse(payload)) {
      return { requestId, status: 'invalid-response', baseURL }
    }

    return { requestId, status: 'connected', baseURL }
  } catch {
    return {
      requestId,
      status: signal.aborted ? 'cancelled' : 'unreachable',
      baseURL,
    }
  }
}

function parseResponse(responseBody: string): unknown {
  try {
    return JSON.parse(responseBody)
  } catch {
    return null
  }
}

function serverEndpoint(baseURL: string, path: string): string {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`
  return new URL(path, base).toString()
}

function readRequestId(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('requestId' in value)) return ''
  return typeof value.requestId === 'string' ? value.requestId.slice(0, 128) : ''
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === 'object'
    && value !== null
    && 'status' in value
    && value.status === 'ok'
}

export type { ServerHealthRequest }
