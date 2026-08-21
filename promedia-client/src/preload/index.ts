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
}

contextBridge.exposeInMainWorld('promedia', api)
