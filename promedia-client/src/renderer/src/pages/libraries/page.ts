import type {
  RuntimeInstallPhase,
  RuntimeInstallProgress,
  RuntimeState,
  RuntimeStatus,
} from '../../../../shared/runtime.ts'
import { getLocale, t } from '../../i18n'

export function librariesPage(): string {
  return `
    <main class="app-main min-w-0 flex-1">
      <div class="page-container libraries-container mx-auto">
        <section class="libraries-intro" aria-labelledby="libraries-intro-title">
          <div>
            <p class="libraries-kicker">${t('libraries.kicker')}</p>
            <h2 id="libraries-intro-title" class="libraries-intro-title">${t('libraries.title')}</h2>
            <p class="libraries-intro-description">${t('libraries.description')}</p>
          </div>
          <button class="libraries-secondary-button" type="button" data-refresh-runtimes>
            ${t('libraries.action.refresh')}
          </button>
        </section>

        <div class="libraries-notice" role="note">${t('libraries.notice')}</div>
        <section class="runtime-list" aria-live="polite" aria-busy="true" data-runtime-list>
          <p class="libraries-loading">${t('libraries.loading')}</p>
        </section>
      </div>
    </main>
  `
}

export function setupLibraries(root: HTMLDivElement): () => void {
  const list = root.querySelector<HTMLElement>('[data-runtime-list]')
  const refreshButton = root.querySelector<HTMLButtonElement>('[data-refresh-runtimes]')
  if (!list || !refreshButton) return () => {}

  let disposed = false
  let statuses: RuntimeStatus[] = []
  const progressByRuntime = new Map<string, RuntimeInstallProgress>()
  const operationByRuntime = new Map<string, string>()

  const render = (): void => renderRuntimeList(list, statuses, progressByRuntime, operationByRuntime)

  const load = async (showLoading = false): Promise<void> => {
    if (showLoading) {
      list.replaceChildren(textElement('p', 'libraries-loading', t('libraries.loading')))
      list.setAttribute('aria-busy', 'true')
    }
    refreshButton.disabled = true
    try {
      const nextStatuses = await window.promedia.runtimes.list()
      if (disposed || !root.contains(list)) return
      statuses = nextStatuses
      render()
    } catch {
      if (disposed || !root.contains(list)) return
      list.replaceChildren(textElement('p', 'libraries-error', t('libraries.error.load')))
    } finally {
      if (!disposed && root.contains(refreshButton)) refreshButton.disabled = false
      list.setAttribute('aria-busy', 'false')
    }
  }

  const install = async (runtimeId: string): Promise<void> => {
    if (operationByRuntime.has(runtimeId)) return
    const operationId = crypto.randomUUID()
    operationByRuntime.set(runtimeId, operationId)
    progressByRuntime.set(runtimeId, { operationId, runtimeId, phase: 'resolving' })
    render()

    try {
      const result = await window.promedia.runtimes.install({ operationId, runtimeId })
      if (disposed || !root.contains(list)) return
      if (result.status === 'installed') {
        progressByRuntime.set(runtimeId, { operationId, runtimeId, phase: 'done', percent: 100 })
      } else if (result.status === 'cancelled') {
        progressByRuntime.set(runtimeId, { operationId, runtimeId, phase: 'cancelled' })
      } else if (result.status === 'busy') {
        progressByRuntime.set(runtimeId, { operationId, runtimeId, phase: 'error', errorCode: 'busy' })
      } else {
        progressByRuntime.set(runtimeId, {
          operationId,
          runtimeId,
          phase: 'error',
          errorCode: result.errorCode ?? 'unknown',
        })
      }
      await load()
    } catch {
      if (!disposed && root.contains(list)) {
        progressByRuntime.set(runtimeId, { operationId, runtimeId, phase: 'error' })
        render()
      }
    } finally {
      operationByRuntime.delete(runtimeId)
      if (!disposed && root.contains(list)) render()
    }
  }

  const handleClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return
    const action = event.target.closest<HTMLButtonElement>('[data-runtime-action]')
    if (!action) return
    const runtimeId = action.dataset.runtimeId
    if (!runtimeId) return

    if (action.dataset.runtimeAction === 'cancel') {
      const operationId = operationByRuntime.get(runtimeId)
      if (operationId) window.promedia.runtimes.cancel(operationId)
      return
    }
    void install(runtimeId)
  }

  const handleRefresh = (): void => void load(true)
  const removeProgressListener = window.promedia.runtimes.onProgress((progress) => {
    if (disposed || operationByRuntime.get(progress.runtimeId) !== progress.operationId) return
    progressByRuntime.set(progress.runtimeId, progress)
    render()
  })
  list.addEventListener('click', handleClick)
  refreshButton.addEventListener('click', handleRefresh)
  void load()

  return () => {
    disposed = true
    removeProgressListener()
    list.removeEventListener('click', handleClick)
    refreshButton.removeEventListener('click', handleRefresh)
  }
}

function renderRuntimeList(
  root: HTMLElement,
  statuses: readonly RuntimeStatus[],
  progressByRuntime: ReadonlyMap<string, RuntimeInstallProgress>,
  operationByRuntime: ReadonlyMap<string, string>,
): void {
  if (statuses.length === 0) {
    root.replaceChildren(textElement('p', 'libraries-empty', t('libraries.empty')))
    return
  }

  root.replaceChildren(...statuses.map((status) => runtimeCard(
    status,
    progressByRuntime.get(status.runtimeId),
    operationByRuntime.has(status.runtimeId),
  )))
}

function runtimeCard(status: RuntimeStatus, progress: RuntimeInstallProgress | undefined, isOwned: boolean): HTMLElement {
  const article = document.createElement('article')
  article.className = 'runtime-card'

  const heading = document.createElement('div')
  heading.className = 'runtime-card-heading'
  const titleGroup = document.createElement('div')
  titleGroup.append(
    textElement('p', 'runtime-components', status.metadata.componentNames.join(' · ')),
    textElement('h3', 'runtime-title', localized(status.metadata.featureName)),
  )
  heading.append(titleGroup, statusBadge(progress?.phase ? phaseState(progress.phase) : status.state))

  const description = textElement('p', 'runtime-description', localized(status.metadata.description))
  const details = document.createElement('dl')
  details.className = 'runtime-details'
  appendDetail(details, t('libraries.detail.version'), versionText(status))
  appendDetail(details, t('libraries.detail.size'), sizeText(status.downloadSizeBytes))
  appendDetail(details, t('libraries.detail.location'), processingLocation(status))
  appendDetail(details, t('libraries.detail.privacy'), localized(status.metadata.privacy))
  appendDetail(details, t('libraries.detail.license'), status.metadata.license.name)
  if (status.installedAt) appendDetail(details, t('libraries.detail.installedAt'), formatDate(status.installedAt))

  article.append(heading, description, details)
  if (progress) article.append(progressView(progress))

  const actions = document.createElement('div')
  actions.className = 'runtime-actions'
  if (isOwned && progress && !isTerminalPhase(progress.phase)) {
    actions.append(runtimeButton(status.runtimeId, 'cancel', t('libraries.action.cancel'), 'secondary'))
  } else if (status.canInstall) {
    const label = status.state === 'invalid' ? t('libraries.action.repair') : t('libraries.action.install')
    actions.append(runtimeButton(status.runtimeId, 'install', label, 'primary'))
  }
  if (actions.childElementCount > 0) article.append(actions)
  return article
}

function progressView(progress: RuntimeInstallProgress): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = `runtime-progress runtime-progress-${progress.phase}`
  const heading = document.createElement('div')
  heading.className = 'runtime-progress-heading'
  const progressLabel = progress.phase === 'error' && progress.errorCode
    ? failureLabel(progress.errorCode)
    : phaseLabel(progress.phase)
  heading.append(
    textElement('span', '', progressLabel),
    textElement('span', '', progress.percent === undefined ? '' : `${progress.percent}%`),
  )
  const track = document.createElement('progress')
  track.className = 'runtime-progress-track'
  track.setAttribute('aria-label', progressLabel)
  track.max = 100
  if (progress.percent !== undefined) track.value = progress.percent
  wrapper.append(heading, track)
  return wrapper
}

function statusBadge(state: RuntimeState): HTMLElement {
  const badge = textElement('span', `runtime-status runtime-status-${state}`, stateLabel(state))
  badge.setAttribute('role', 'status')
  return badge
}

function runtimeButton(runtimeId: string, action: string, label: string, style: 'primary' | 'secondary'): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = `libraries-${style}-button`
  button.type = 'button'
  button.dataset.runtimeAction = action
  button.dataset.runtimeId = runtimeId
  button.textContent = label
  return button
}

function appendDetail(list: HTMLDListElement, label: string, value: string): void {
  const item = document.createElement('div')
  item.className = 'runtime-detail'
  item.append(textElement('dt', '', label), textElement('dd', '', value))
  list.append(item)
}

function localized(value: Readonly<Record<'vi' | 'en', string>>): string {
  return value[getLocale()] || value.en
}

function versionText(status: RuntimeStatus): string {
  if (status.installedVersion) return status.installedVersion
  if (status.availableVersion) return status.availableVersion
  return t('libraries.detail.unavailable')
}

function sizeText(bytes: number | undefined): string {
  if (!bytes) return t('libraries.detail.unavailable')
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1_024 && unitIndex < units.length - 1) {
    value /= 1_024
    unitIndex += 1
  }
  return `${value.toLocaleString(getLocale() === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 })} ${units[unitIndex]}`
}

function processingLocation(status: RuntimeStatus): string {
  return status.metadata.processingLocation === 'device'
    ? t('libraries.location.device')
    : t('libraries.location.server')
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('libraries.detail.unavailable')
  return date.toLocaleString(getLocale() === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function stateLabel(state: RuntimeState): string {
  switch (state) {
    case 'ready': return t('libraries.status.ready')
    case 'missing': return t('libraries.status.missing')
    case 'invalid': return t('libraries.status.invalid')
    case 'installing': return t('libraries.status.installing')
    case 'unsupported': return t('libraries.status.unsupported')
    case 'source-unavailable': return t('libraries.status.sourceUnavailable')
  }
}

function phaseLabel(phase: RuntimeInstallPhase): string {
  switch (phase) {
    case 'resolving': return t('libraries.phase.resolving')
    case 'downloading': return t('libraries.phase.downloading')
    case 'verifying': return t('libraries.phase.verifying')
    case 'extracting': return t('libraries.phase.extracting')
    case 'installing': return t('libraries.phase.installing')
    case 'done': return t('libraries.phase.done')
    case 'error': return t('libraries.phase.error')
    case 'cancelled': return t('libraries.phase.cancelled')
  }
}

function failureLabel(code: NonNullable<RuntimeInstallProgress['errorCode']>): string {
  switch (code) {
    case 'busy': return t('libraries.error.busy')
    case 'network': return t('libraries.error.network')
    case 'source-unavailable': return t('libraries.error.sourceUnavailable')
    case 'unsupported': return t('libraries.error.unsupported')
    case 'insufficient-space': return t('libraries.error.insufficientSpace')
    case 'download-invalid': return t('libraries.error.downloadInvalid')
    case 'checksum-mismatch': return t('libraries.error.checksumMismatch')
    case 'unsafe-archive': return t('libraries.error.unsafeArchive')
    case 'extract-failed': return t('libraries.error.extractFailed')
    case 'invalid-runtime': return t('libraries.error.invalidRuntime')
    case 'filesystem': return t('libraries.error.filesystem')
    case 'unknown': return t('libraries.phase.error')
  }
}

function phaseState(phase: RuntimeInstallPhase): RuntimeState {
  if (phase === 'done') return 'ready'
  if (phase === 'error' || phase === 'cancelled') return 'invalid'
  return 'installing'
}

function isTerminalPhase(phase: RuntimeInstallPhase): boolean {
  return phase === 'done' || phase === 'error' || phase === 'cancelled'
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) element.className = className
  element.textContent = text
  return element
}
