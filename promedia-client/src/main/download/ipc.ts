import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

import {
  downloadChannels,
  isDownloadAuthSite,
  isDownloadOperationID,
  isDownloadProbeRequest,
  isDownloadRequest,
  isDownloadThumbnailRequest,
  type DownloadAuthEvent,
  type DownloadEnqueueResult,
  type DownloadOperationStatus,
} from '../../shared/download.ts'
import { DownloadAuthService } from './auth.ts'
import { ChannelHistory } from './channel-history.ts'
import { DownloadJobStore } from './job-store.ts'
import { downloadErrorCode, DownloadService } from './service.ts'
import { detectDownloadPlatform } from './sites.ts'
import type { RuntimeService } from '../runtime/service.ts'

export function registerDownloadIPC(runtime: RuntimeService, userDataRoot: string): () => Promise<void> {
  const auth = new DownloadAuthService(userDataRoot)
  const history = new ChannelHistory(userDataRoot)
  const service = new DownloadService(runtime, auth, userDataRoot)
  const jobs = new DownloadJobStore({
    probe: async (request, signal) => {
      try {
        const result = await service.probe(request, signal)
        return {
          ok: true,
          platform: detectDownloadPlatform(request.url) ?? undefined,
          ...result,
        }
      } catch (error) {
        return { ok: false, candidates: [], collections: [], errorCode: downloadErrorCode(error) }
      }
    },
    start: async (request, signal, report) => {
      try {
        const result = await service.start(request, signal, report)
        if ((result.status === 'done' || result.status === 'skipped') && isDouyinChannelURL(request.url)) {
          await history.recordSuccess({
            url: request.url,
            name: request.displayTitle?.trim() || request.url,
            outputDir: request.outputDir,
            lastMode: request.engine === 'douyin' ? request.options.mode : 'all',
            addedItemCount: result.addedItemCount,
          })
        }
        return result
      } catch (error) {
        return {
          operationId: request.operationId,
          status: signal.aborted ? 'cancelled' : 'error',
          files: [],
          primaryFile: null,
          addedItemCount: 0,
          errorCode: signal.aborted ? 'cancelled' : downloadErrorCode(error),
        }
      }
    },
  })
  const unsubscribeJobs = jobs.subscribe((status) => broadcastOperation(status))

  const handleProbe = async (_event: IpcMainInvokeEvent, request: unknown) => {
    if (!isDownloadProbeRequest(request)) return { ok: false, candidates: [], collections: [], errorCode: 'invalid-request' as const }
    const operationId = crypto.randomUUID()
    return { ...(await jobs.probe(operationId, request)), operationId }
  }

  const handleEnqueue = (_event: IpcMainInvokeEvent, value: unknown): DownloadEnqueueResult => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 100 || !value.every(isDownloadRequest)) {
      return { acceptedOperationIDs: [], errorCode: 'invalid-request' }
    }
    return jobs.enqueue(value)
  }

  const handleList = (): DownloadOperationStatus[] => jobs.list()
  const handleCancel = (_event: IpcMainEvent, value: unknown): void => {
    if (isDownloadOperationID(value)) jobs.cancel(value)
  }
  const handleDismiss = (_event: IpcMainInvokeEvent, value: unknown): void => {
    if (isDownloadOperationID(value)) jobs.dismiss(value)
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

  const handleHistoryList = (): ReturnType<ChannelHistory['list']> => history.list()
  const handleHistoryRemove = async (_event: IpcMainInvokeEvent, value: unknown) => {
    if (typeof value !== 'string' || !isDouyinChannelURL(value)) return []
    return history.remove(value)
  }

  ipcMain.handle(downloadChannels.probe, handleProbe)
  ipcMain.handle(downloadChannels.enqueue, handleEnqueue)
  ipcMain.handle(downloadChannels.list, handleList)
  ipcMain.on(downloadChannels.cancel, handleCancel)
  ipcMain.handle(downloadChannels.dismiss, handleDismiss)
  ipcMain.handle(downloadChannels.proxyTest, handleProxyTest)
  ipcMain.handle(downloadChannels.thumbnail, handleThumbnail)
  ipcMain.handle(downloadChannels.authStatus, handleAuthStatus)
  ipcMain.handle(downloadChannels.authLogin, handleAuthLogin)
  ipcMain.handle(downloadChannels.authClear, handleAuthClear)
  ipcMain.handle(downloadChannels.historyList, handleHistoryList)
  ipcMain.handle(downloadChannels.historyRemove, handleHistoryRemove)
  let disposed = false
  return async () => {
    if (disposed) return
    disposed = true
    ipcMain.removeHandler(downloadChannels.probe)
    ipcMain.removeHandler(downloadChannels.enqueue)
    ipcMain.removeHandler(downloadChannels.list)
    ipcMain.removeListener(downloadChannels.cancel, handleCancel)
    ipcMain.removeHandler(downloadChannels.dismiss)
    ipcMain.removeHandler(downloadChannels.proxyTest)
    ipcMain.removeHandler(downloadChannels.thumbnail)
    ipcMain.removeHandler(downloadChannels.authStatus)
    ipcMain.removeHandler(downloadChannels.authLogin)
    ipcMain.removeHandler(downloadChannels.authClear)
    ipcMain.removeHandler(downloadChannels.historyList)
    ipcMain.removeHandler(downloadChannels.historyRemove)
    unsubscribeJobs()
    await jobs.dispose()
    auth.dispose()
  }
}

function broadcastOperation(status: DownloadOperationStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    try {
      window.webContents.send(downloadChannels.operation, status)
    } catch {
      // Cửa sổ có thể vừa đóng trong lúc tiến trình nền đang báo trạng thái.
    }
  }
}

function isDouyinChannelURL(value: string): boolean {
  try {
    const parsed = new URL(value)
    return detectDownloadPlatform(value) === 'douyin' && /\/user\//i.test(parsed.pathname)
  } catch {
    return false
  }
}
