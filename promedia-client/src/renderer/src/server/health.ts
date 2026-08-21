import type { ServerHealthResult } from '../../../shared/server-health'

export function checkServerHealth(
  baseURL: string,
  timeoutMs: number,
  requestId: string,
): Promise<ServerHealthResult> {
  return window.promedia.serverHealth.check({ baseURL, timeoutMs, requestId })
}

export function cancelServerHealth(requestId: string): void {
  window.promedia.serverHealth.cancel(requestId)
}
