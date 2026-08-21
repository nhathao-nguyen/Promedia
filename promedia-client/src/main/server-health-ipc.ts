import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

import {
  isServerHealthRequest,
  serverHealthChannels,
  type ServerHealthResult,
} from '../shared/server-health.ts'
import { requestServerHealth } from './server-health.ts'

const maximumActiveRequestsPerRenderer = 8

interface ActiveRequest {
  controller: AbortController
  timeout: ReturnType<typeof setTimeout>
  reason: 'cancelled' | 'timeout' | null
}

export function registerServerHealthIPC(): () => void {
  const activeRequests = new Map<string, ActiveRequest>()

  const handleCheck = async (event: IpcMainInvokeEvent, request: unknown): Promise<ServerHealthResult> => {
    if (!isServerHealthRequest(request)) {
      return { requestId: requestID(request), status: 'invalid-request' }
    }

    const key = requestKey(event.sender.id, request.requestId)
    if (activeRequests.has(key)) {
      return { requestId: request.requestId, status: 'invalid-request' }
    }
    if (activeRequestCount(activeRequests, event.sender.id) >= maximumActiveRequestsPerRenderer) {
      return { requestId: request.requestId, status: 'busy' }
    }

    const controller = new AbortController()
    const activeRequest: ActiveRequest = {
      controller,
      reason: null,
      timeout: setTimeout(() => {
        activeRequest.reason = 'timeout'
        controller.abort()
      }, request.timeoutMs),
    }
    activeRequests.set(key, activeRequest)

    try {
      const result = await requestServerHealth(request, controller.signal)
      if (result.status === 'cancelled' && activeRequest.reason === 'timeout') {
        return { ...result, status: 'timeout' }
      }
      return result
    } finally {
      clearTimeout(activeRequest.timeout)
      activeRequests.delete(key)
    }
  }

  const handleCancel = (event: IpcMainEvent, requestId: unknown): void => {
    if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 128) return

    const activeRequest = activeRequests.get(requestKey(event.sender.id, requestId))
    if (!activeRequest) return

    activeRequest.reason = 'cancelled'
    activeRequest.controller.abort()
  }

  ipcMain.handle(serverHealthChannels.check, handleCheck)
  ipcMain.on(serverHealthChannels.cancel, handleCancel)

  return () => {
    ipcMain.removeHandler(serverHealthChannels.check)
    ipcMain.removeListener(serverHealthChannels.cancel, handleCancel)
    for (const request of activeRequests.values()) {
      clearTimeout(request.timeout)
      request.reason = 'cancelled'
      request.controller.abort()
    }
    activeRequests.clear()
  }
}

function activeRequestCount(requests: Map<string, ActiveRequest>, rendererID: number): number {
  const prefix = `${rendererID}:`
  let count = 0
  for (const key of requests.keys()) {
    if (key.startsWith(prefix)) count += 1
  }
  return count
}

function requestKey(rendererID: number, requestId: string): string {
  return `${rendererID}:${requestId}`
}

function requestID(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('requestId' in value)) return ''
  return typeof value.requestId === 'string' ? value.requestId.slice(0, 128) : ''
}
