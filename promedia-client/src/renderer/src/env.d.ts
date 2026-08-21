/// <reference types="vite/client" />

import type { PromediaAPI } from '../../shared/api.ts'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string
    readonly VITE_API_TIMEOUT_MS?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    promedia: PromediaAPI
  }
}

export {}
