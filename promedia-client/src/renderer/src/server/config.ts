import { normalizeServerURL } from '../../../shared/server-health.ts'

export interface ServerConfig {
  baseURL: string
  timeoutMs: number
}

interface ClientEnvironment {
  VITE_API_URL?: string
  VITE_API_TIMEOUT_MS?: string
}

interface ServerConfigStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const serverURLStorageKey = 'promedia.server.base-url'
const defaultTimeoutMs = 5_000

export function loadServerConfig(
  environment: ClientEnvironment = clientEnvironment(),
  storage: ServerConfigStorage | undefined = browserStorage(),
): ServerConfig {
  const storedURL = readStoredServerURL(storage)
  const baseURL = normalizeServerURL(storedURL ?? environment.VITE_API_URL ?? '') ?? ''

  const rawTimeout = environment.VITE_API_TIMEOUT_MS?.trim()
  const timeoutMs = Number(rawTimeout)

  return {
    baseURL,
    timeoutMs: Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 60_000
      ? timeoutMs
      : defaultTimeoutMs,
  }
}

function clientEnvironment(): ClientEnvironment {
  return {
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_API_TIMEOUT_MS: import.meta.env.VITE_API_TIMEOUT_MS,
  }
}

export function saveServerURL(
  value: string,
  storage: ServerConfigStorage | undefined = browserStorage(),
): boolean {
  const normalized = normalizeServerURL(value)
  if (!normalized || !storage) return false

  try {
    storage.setItem(serverURLStorageKey, normalized)
    return true
  } catch {
    return false
  }
}

function readStoredServerURL(storage: ServerConfigStorage | undefined): string | null {
  if (!storage) return null

  try {
    const value = storage.getItem(serverURLStorageKey)
    return value && normalizeServerURL(value) ? value : null
  } catch {
    return null
  }
}

function browserStorage(): ServerConfigStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export { normalizeServerURL }
