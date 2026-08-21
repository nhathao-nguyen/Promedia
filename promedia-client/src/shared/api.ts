import type { RuntimeAPI } from './runtime.ts'
import type { ServerHealthAPI } from './server-health.ts'

export interface PromediaAPI {
  serverHealth: ServerHealthAPI
  runtimes: RuntimeAPI
}
