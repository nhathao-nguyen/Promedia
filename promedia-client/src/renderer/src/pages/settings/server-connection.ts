import { getLocale, t } from '../../i18n'
import {
  loadServerConfig,
  normalizeServerURL,
  saveServerURL,
  type ServerConfig,
} from '../../server/config'
import { cancelServerHealth, checkServerHealth } from '../../server/health'

export function serverConnectionPanel(): string {
  return `
    <section class="settings-panel" aria-labelledby="server-connection-title">
      <div class="settings-panel-heading flex-col sm:flex-row">
        <div>
          <p class="settings-panel-kicker">${t('settings.serverKicker')}</p>
          <h2 id="server-connection-title" class="settings-panel-title">${t('settings.serverTitle')}</h2>
        </div>
        <span class="connection-status-badge connection-status-neutral" role="status" aria-live="polite">
          <span class="connection-status-dot" data-connection-dot></span>
          <span data-connection-status>${t('settings.serverStatus.notChecked')}</span>
        </span>
      </div>

      <div class="settings-form-row flex flex-col gap-3 sm:flex-row sm:items-start">
        <label class="settings-field min-w-0 flex-1">
          <span class="settings-field-label">${t('settings.serverFieldLabel')}</span>
          <input
            class="settings-input"
            type="text"
            placeholder="${t('settings.serverPlaceholder')}"
            data-server-url
            aria-describedby="server-url-help"
          />
          <span id="server-url-help" class="settings-field-help">${t('settings.serverHelp')}</span>
        </label>
        <button class="settings-primary-button shrink-0" type="button" data-check-connection>
          ${t('settings.serverButton')}
        </button>
      </div>

      <div class="settings-panel-footer flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span data-connection-detail>${t('settings.serverDetail.initial')}</span>
        <span data-last-checked>${t('settings.serverLastChecked.none')}</span>
      </div>
    </section>
  `
}

export function setupServerConnection(root: HTMLDivElement): () => void {
  const input = root.querySelector<HTMLInputElement>('[data-server-url]')
  const button = root.querySelector<HTMLButtonElement>('[data-check-connection]')
  const status = root.querySelector<HTMLElement>('[data-connection-status]')
  const dot = root.querySelector<HTMLElement>('[data-connection-dot]')
  const detail = root.querySelector<HTMLElement>('[data-connection-detail]')
  const lastChecked = root.querySelector<HTMLElement>('[data-last-checked]')

  if (!input || !button || !status || !dot || !detail || !lastChecked) return () => {}

  let activeRequestId: string | null = null
  let isDisposed = false

  const setStatus = (state: 'loading' | 'success' | 'error', message: string): void => {
    const styles = {
      loading: { badge: 'connection-status-loading', dot: 'connection-status-dot-loading' },
      success: { badge: 'connection-status-success', dot: 'connection-status-dot-success' },
      error: { badge: 'connection-status-error', dot: 'connection-status-dot-error' },
    }
    const style = styles[state]
    const badge = status.parentElement

    status.textContent = message
    badge?.classList.remove(
      'connection-status-neutral',
      'connection-status-loading',
      'connection-status-success',
      'connection-status-error',
    )
    badge?.classList.add(style.badge)
    dot.className = `connection-status-dot ${style.dot}`
  }

  const serverConfig: ServerConfig = loadServerConfig()

  input.value = serverConfig.baseURL

  const cancelConnectionRequest = (): void => {
    isDisposed = true
    if (activeRequestId) cancelServerHealth(activeRequestId)
    activeRequestId = null
  }

  const checkConnection = async (): Promise<void> => {
    if (activeRequestId) cancelServerHealth(activeRequestId)

    const serverURL = normalizeServerURL(input.value)
    if (!serverURL) {
      setStatus('error', t('settings.serverStatus.invalidURL'))
      detail.textContent = t('settings.serverDetail.invalidURL')
      return
    }

    const requestId = crypto.randomUUID()
    activeRequestId = requestId

    button.disabled = true
    setStatus('loading', t('settings.serverStatus.loading'))
    detail.textContent = t('settings.serverDetail.checking', { url: serverURL })

    try {
      const result = await checkServerHealth(serverURL, serverConfig.timeoutMs, requestId)

      if (isDisposed || activeRequestId !== requestId || !root.contains(button)) return
      if (result.status === 'cancelled') return
      if (result.status === 'connected') {
        input.value = result.baseURL ?? serverURL
        setStatus('success', t('settings.serverStatus.connected'))
        detail.textContent = saveServerURL(input.value)
          ? t('settings.serverDetail.connected')
          : t('settings.serverDetail.connectedNotSaved')
        return
      }

      setStatus('error', t('settings.serverStatus.disconnected'))
      detail.textContent = result.status === 'timeout'
        ? t('settings.serverDetail.timeout', { seconds: formatTimeout(serverConfig.timeoutMs) })
        : result.status === 'invalid-response'
          ? t('settings.serverDetail.invalidResponse')
          : t('settings.serverDetail.error')
    } catch {
      if (isDisposed || activeRequestId !== requestId || !root.contains(button)) return

      setStatus('error', t('settings.serverStatus.disconnected'))
      detail.textContent = t('settings.serverDetail.error')
    } finally {
      if (activeRequestId !== requestId) return

      activeRequestId = null
      if (isDisposed || !root.contains(button)) return

      lastChecked.textContent = t('settings.serverLastChecked.at', {
        time: formatCheckTime(new Date()),
      })
      button.disabled = false
    }
  }

  const handleClick = (): void => void checkConnection()
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') void checkConnection()
  }
  button.addEventListener('click', handleClick)
  input.addEventListener('keydown', handleKeydown)

  if (serverConfig.baseURL) void checkConnection()
  return () => {
    button.removeEventListener('click', handleClick)
    input.removeEventListener('keydown', handleKeydown)
    cancelConnectionRequest()
  }
}

function formatTimeout(timeoutMs: number): string {
  return (timeoutMs / 1000).toLocaleString(formatLocale(), { maximumFractionDigits: 1 })
}

function formatCheckTime(date: Date): string {
  return date.toLocaleTimeString(formatLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLocale(): string {
  return getLocale() === 'vi' ? 'vi-VN' : 'en-US'
}
