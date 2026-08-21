import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

import {
  downloadChannels,
  isDownloadAuthSite,
  isDownloadOperationID,
  isDownloadProbeRequest,
  isDownloadRequest,
  isDownloadThumbnailRequest,
  type DownloadAuthEvent,
  type DownloadAuthSite,
  type DownloadOperationStatus,
  type DownloadProgress,
  type DownloadResult,
} from '../../shared/download.ts'
import { DownloadAuthService } from './auth.ts'
import { downloadErrorCode, DownloadService } from './service.ts'
import type { RuntimeService } from '../runtime/service.ts'

const maximumConcurrentDownloads = 1

interface ActiveDownload {
  key: string
  rendererID: number
  controller: AbortController
  status: DownloadOperationStatus
}

export function registerDownloadIPC(runtime: RuntimeService, userDataRoot: string): () => void {
  const auth = new DownloadAuthService(userDataRoot)
  const service = new DownloadService(runtime, auth, userDataRoot)
  const active = new Map<string, ActiveDownload>()

  const handleProbe = async (_event: IpcMainInvokeEvent, request: unknown) => {
    if (!isDownloadProbeRequest(request)) return { ok: false, candidates: [], collections: [], errorCode: 'invalid-request' as const }
    const controller = new AbortController()
    try {
      const result = await service.probe(request, controller.signal)
      return { ok: true, ...result }
    } catch (error) {
      return { ok: false, candidates: [], collections: [], errorCode: downloadErrorCode(error) }
    }
  }

  const handleStart = async (event: IpcMainInvokeEvent, request: unknown): Promise<DownloadResult> => {
    if (!isDownloadRequest(request)) return invalidResult(request)
    const key = operationKey(event.sender.id, request.operationId)
    if (active.size >= maximumConcurrentDownloads || active.has(key)) {
      return { operationId: request.operationId, status: 'error', files: [], primaryFile: null, errorCode: 'busy' }
    }

    const controller = new AbortController()
    const status: DownloadOperationStatus = {
      operationId: request.operationId,
      url: request.url,
      state: 'starting',
      progress: null,
      result: null,
    }
    const operation: ActiveDownload = { key, rendererID: event.sender.id, controller, status }
    active.set(key, operation)
    const onRendererDestroyed = (): void => controller.abort()
    event.sender.once('destroyed', onRendererDestroyed)

    const report = (progress: DownloadProgress): void => {
      operation.status.progress = progress
      operation.status.state = progress.phase === 'error'
        ? 'error'
        : progress.phase === 'cancelled'
          ? 'cancelled'
          : progress.phase === 'finished'
            ? 'finished'
            : 'running'
      if (event.sender.isDestroyed()) {
        controller.abort()
        return
      }
      try {
        event.sender.send(downloadChannels.progress, progress)
      } catch {
        controller.abort()
      }
    }

    try {
      const result = await service.start(request, controller.signal, report)
      operation.status.result = result
      operation.status.state = result.status === 'cancelled' ? 'cancelled' : result.status === 'error' ? 'error' : 'finished'
      return result
    } catch (error) {
      const errorCode = controller.signal.aborted ? 'cancelled' : downloadErrorCode(error)
      const result: DownloadResult = {
        operationId: request.operationId,
        status: errorCode === 'cancelled' ? 'cancelled' : 'error',
        files: [],
        primaryFile: null,
        errorCode,
      }
      operation.status.result = result
      operation.status.state = result.status === 'cancelled' ? 'cancelled' : 'error'
      report({
        operationId: request.operationId,
        phase: result.status === 'cancelled' ? 'cancelled' : 'error',
        percent: null,
        downloadedBytes: null,
        totalBytes: null,
        speed: null,
        eta: null,
        filePath: null,
        message: null,
        errorCode,
      })
      return result
    } finally {
      event.sender.removeListener('destroyed', onRendererDestroyed)
      active.delete(key)
    }
  }

  const handleList = (event: IpcMainInvokeEvent): DownloadOperationStatus[] => (
    [...active.values()]
      .filter((operation) => operation.rendererID === event.sender.id)
      .map((operation) => ({ ...operation.status }))
  )

  const handleCancel = (event: IpcMainEvent, value: unknown): void => {
    if (!isDownloadOperationID(value)) return
    active.get(operationKey(event.sender.id, value))?.controller.abort()
  }

  const handleProxyTest = async (_event: IpcMainInvokeEvent, value: unknown) => {
    if (typeof value !== 'string') return { ok: false, errorCode: 'invalid-request' as const }
    try {
      await service.testProxy(value, new AbortController().signal)
      return { ok: true }
    } catch (error) {
      return { ok: false, errorCode: downloadErrorCode(error) }
    }
  }

  const handleThumbnail = async (_event: IpcMainInvokeEvent, request: unknown) => {
    if (!isDownloadThumbnailRequest(request)) return { dataURL: null }
    try {
      return { dataURL: await service.thumbnail(request, new AbortController().signal) }
    } catch {
      return { dataURL: null }
    }
  }

  const handleAuthStatus = (): ReturnType<DownloadAuthService['statuses']> => auth.statuses()
  const handleAuthLogin = async (event: IpcMainInvokeEvent, value: unknown) => {
    if (!isDownloadAuthSite(value)) return null
    const emit = (authEvent: DownloadAuthEvent): void => {
      if (!event.sender.isDestroyed()) event.sender.send(downloadChannels.authEvent, authEvent)
    }
    return auth.login(value, emit)
  }
  const handleAuthClear = async (_event: IpcMainInvokeEvent, value: unknown): Promise<void> => {
    if (isDownloadAuthSite(value)) await auth.clear(value)
  }

  ipcMain.handle(downloadChannels.probe, handleProbe)
  ipcMain.handle(downloadChannels.start, handleStart)
  ipcMain.handle(downloadChannels.list, handleList)
  ipcMain.on(downloadChannels.cancel, handleCancel)
  ipcMain.handle(downloadChannels.proxyTest, handleProxyTest)
  ipcMain.handle(downloadChannels.thumbnail, handleThumbnail)
  ipcMain.handle(downloadChannels.authStatus, handleAuthStatus)
  ipcMain.handle(downloadChannels.authLogin, handleAuthLogin)
  ipcMain.handle(downloadChannels.authClear, handleAuthClear)
  return () => {
    ipcMain.removeHandler(downloadChannels.probe)
    ipcMain.removeHandler(downloadChannels.start)
    ipcMain.removeHandler(downloadChannels.list)
    ipcMain.removeListener(downloadChannels.cancel, handleCancel)
    ipcMain.removeHandler(downloadChannels.proxyTest)
    ipcMain.removeHandler(downloadChannels.thumbnail)
    ipcMain.removeHandler(downloadChannels.authStatus)
    ipcMain.removeHandler(downloadChannels.authLogin)
    ipcMain.removeHandler(downloadChannels.authClear)
    for (const operation of active.values()) operation.controller.abort()
    active.clear()
    auth.dispose()
  }
}

function operationKey(rendererID: number, operationID: string): string {
  return `${rendererID}:${operationID}`
}

function invalidResult(value: unknown): DownloadResult {
  const operationId = typeof value === 'object' && value !== null && typeof (value as { operationId?: unknown }).operationId === 'string'
    ? String((value as { operationId: string }).operationId).slice(0, 128)
    : ''
  return { operationId, status: 'error', files: [], primaryFile: null, errorCode: 'invalid-request' }
}
