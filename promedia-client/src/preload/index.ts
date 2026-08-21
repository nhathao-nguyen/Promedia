import { contextBridge, ipcRenderer } from 'electron'

import {
  serverHealthChannels,
  type ServerHealthRequest,
  type ServerHealthResult,
} from '../shared/server-health.ts'
import type { PromediaAPI } from '../shared/api.ts'
import {
  runtimeChannels,
  type RuntimeInstallProgress,
  type RuntimeInstallRequest,
  type RuntimeInstallResult,
  type RuntimeStatus,
  type RuntimeStatusRequest,
} from '../shared/runtime.ts'
import { dialogChannels } from '../shared/dialog.ts'
import {
  downloadChannels,
  type DownloadAPI,
  type DownloadAuthEvent,
  type DownloadAuthSite,
  type DownloadAuthStatus,
  type DownloadOperationStatus,
  type DownloadProbeRequest,
  type DownloadProbeResult,
  type DownloadProgress,
  type DownloadRequest,
  type DownloadResult,
  type DownloadProxyTestResult,
  type DownloadThumbnailRequest,
  type DownloadThumbnailResult,
} from '../shared/download.ts'

const api: PromediaAPI = {
  serverHealth: {
    check: (request: ServerHealthRequest): Promise<ServerHealthResult> => (
      ipcRenderer.invoke(serverHealthChannels.check, request)
    ),
    cancel: (requestId: string): void => {
      ipcRenderer.send(serverHealthChannels.cancel, requestId)
    },
  },
  runtimes: {
    list: (): Promise<RuntimeStatus[]> => ipcRenderer.invoke(runtimeChannels.list),
    status: (request: RuntimeStatusRequest): Promise<RuntimeStatus | null> => (
      ipcRenderer.invoke(runtimeChannels.status, request)
    ),
    install: (request: RuntimeInstallRequest): Promise<RuntimeInstallResult> => (
      ipcRenderer.invoke(runtimeChannels.install, request)
    ),
    cancel: (operationId: string): void => {
      ipcRenderer.send(runtimeChannels.cancel, operationId)
    },
    onProgress: (listener: (progress: RuntimeInstallProgress) => void): (() => void) => {
      const handleProgress = (_event: Electron.IpcRendererEvent, progress: RuntimeInstallProgress): void => {
        listener(progress)
      }
      ipcRenderer.on(runtimeChannels.progress, handleProgress)
      return () => ipcRenderer.removeListener(runtimeChannels.progress, handleProgress)
    },
  },
  dialog: {
    chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke(dialogChannels.chooseDirectory),
  },
  downloads: {
    probe: (request: DownloadProbeRequest): Promise<DownloadProbeResult> => ipcRenderer.invoke(downloadChannels.probe, request),
    start: (request: DownloadRequest): Promise<DownloadResult> => ipcRenderer.invoke(downloadChannels.start, request),
    list: (): Promise<DownloadOperationStatus[]> => ipcRenderer.invoke(downloadChannels.list),
    cancel: (operationId: string): void => ipcRenderer.send(downloadChannels.cancel, operationId),
    onProgress: (listener: (progress: DownloadProgress) => void): (() => void) => {
      const handleProgress = (_event: Electron.IpcRendererEvent, progress: DownloadProgress): void => listener(progress)
      ipcRenderer.on(downloadChannels.progress, handleProgress)
      return () => ipcRenderer.removeListener(downloadChannels.progress, handleProgress)
    },
    testProxy: (proxy: string): Promise<DownloadProxyTestResult> => ipcRenderer.invoke(downloadChannels.proxyTest, proxy),
    thumbnail: (request: DownloadThumbnailRequest): Promise<DownloadThumbnailResult> => ipcRenderer.invoke(downloadChannels.thumbnail, request),
    auth: {
      status: (): Promise<DownloadAuthStatus[]> => ipcRenderer.invoke(downloadChannels.authStatus),
      login: (site: DownloadAuthSite): Promise<DownloadAuthStatus> => ipcRenderer.invoke(downloadChannels.authLogin, site),
      clear: (site: DownloadAuthSite): Promise<void> => ipcRenderer.invoke(downloadChannels.authClear, site),
      onEvent: (listener: (event: DownloadAuthEvent) => void): (() => void) => {
        const handleEvent = (_event: Electron.IpcRendererEvent, value: DownloadAuthEvent): void => listener(value)
        ipcRenderer.on(downloadChannels.authEvent, handleEvent)
        return () => ipcRenderer.removeListener(downloadChannels.authEvent, handleEvent)
      },
    },
  } satisfies DownloadAPI,
}

contextBridge.exposeInMainWorld('promedia', api)
