import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

import {
  isRuntimeInstallRequest,
  isRuntimeStatusRequest,
  runtimeChannels,
  type RuntimeInstallProgress,
  type RuntimeInstallResult,
  type RuntimeStatus,
} from '../shared/runtime.ts'
import { isCancellation, runtimeInstallFailureCode, RuntimeService } from './runtime/service.ts'

const maximumConcurrentInstalls = 1
const statusTimeoutMs = 20_000

interface ActiveInstall {
  controller: AbortController
}

export function registerRuntimeIPC(runtimeRoot: string): () => void {
  const service = new RuntimeService(runtimeRoot)
  const activeInstalls = new Map<string, ActiveInstall>()
  const runtimeLocks = new Map<string, string>()

  const handleList = async (): Promise<RuntimeStatus[]> => {
    const statuses = await service.list(AbortSignal.timeout(statusTimeoutMs))
    return statuses.map(markActiveInstall)
  }

  const handleStatus = async (_event: IpcMainInvokeEvent, request: unknown): Promise<RuntimeStatus | null> => {
    if (!isRuntimeStatusRequest(request)) return null
    const status = await service.status(request.runtimeId, AbortSignal.timeout(statusTimeoutMs))
    return status ? markActiveInstall(status) : null
  }

  const handleInstall = async (
    event: IpcMainInvokeEvent,
    request: unknown,
  ): Promise<RuntimeInstallResult> => {
    if (!isRuntimeInstallRequest(request)) {
      return invalidInstallResult(request)
    }

    const key = operationKey(event.sender.id, request.operationId)
    if (
      activeInstalls.has(key)
      || runtimeLocks.has(request.runtimeId)
      || activeInstalls.size >= maximumConcurrentInstalls
    ) {
      return { ...request, status: 'busy' }
    }

    const controller = new AbortController()
    activeInstalls.set(key, { controller })
    runtimeLocks.set(request.runtimeId, key)
    const cancelWhenRendererCloses = (): void => controller.abort()
    event.sender.once('destroyed', cancelWhenRendererCloses)

    const report = (progress: Omit<RuntimeInstallProgress, 'operationId' | 'runtimeId'>): void => {
      if (event.sender.isDestroyed()) return
      try {
        event.sender.send(runtimeChannels.progress, {
          ...progress,
          operationId: request.operationId,
          runtimeId: request.runtimeId,
        } satisfies RuntimeInstallProgress)
      } catch {
        controller.abort()
      }
    }

    try {
      await service.install(request.runtimeId, controller.signal, report)
      return { ...request, status: 'installed' }
    } catch (error) {
      if (isCancellation(error) || controller.signal.aborted) {
        report({ phase: 'cancelled' })
        return { ...request, status: 'cancelled' }
      }

      const errorCode = runtimeInstallFailureCode(error)
      console.error('Runtime installation failed', { runtimeId: request.runtimeId, errorCode })
      report({ phase: 'error', errorCode })
      return { ...request, status: 'failed', errorCode }
    } finally {
      event.sender.removeListener('destroyed', cancelWhenRendererCloses)
      activeInstalls.delete(key)
      if (runtimeLocks.get(request.runtimeId) === key) runtimeLocks.delete(request.runtimeId)
    }
  }

  const handleCancel = (event: IpcMainEvent, operationId: unknown): void => {
    if (typeof operationId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(operationId)) return
    activeInstalls.get(operationKey(event.sender.id, operationId))?.controller.abort()
  }

  ipcMain.handle(runtimeChannels.list, handleList)
  ipcMain.handle(runtimeChannels.status, handleStatus)
  ipcMain.handle(runtimeChannels.install, handleInstall)
  ipcMain.on(runtimeChannels.cancel, handleCancel)

  function markActiveInstall(status: RuntimeStatus): RuntimeStatus {
    return runtimeLocks.has(status.runtimeId)
      ? { ...status, state: 'installing', canInstall: false }
      : status
  }

  return () => {
    ipcMain.removeHandler(runtimeChannels.list)
    ipcMain.removeHandler(runtimeChannels.status)
    ipcMain.removeHandler(runtimeChannels.install)
    ipcMain.removeListener(runtimeChannels.cancel, handleCancel)
    for (const install of activeInstalls.values()) install.controller.abort()
    activeInstalls.clear()
    runtimeLocks.clear()
  }
}

function operationKey(rendererId: number, operationId: string): string {
  return `${rendererId}:${operationId}`
}

function invalidInstallResult(value: unknown): RuntimeInstallResult {
  if (typeof value !== 'object' || value === null) {
    return { operationId: '', runtimeId: '', status: 'invalid-request' }
  }
  const request = value as { operationId?: unknown; runtimeId?: unknown }
  return {
    operationId: typeof request.operationId === 'string' ? request.operationId.slice(0, 128) : '',
    runtimeId: typeof request.runtimeId === 'string' ? request.runtimeId.slice(0, 64) : '',
    status: 'invalid-request',
  }
}
