import type { RuntimeAPI } from './runtime.ts'
import type { ServerHealthAPI } from './server-health.ts'
import type { DialogAPI } from './dialog.ts'
import type { DownloadAPI } from './download.ts'

export interface PromediaAPI {
  serverHealth: ServerHealthAPI
  runtimes: RuntimeAPI
  dialog: DialogAPI
  downloads: DownloadAPI
}
