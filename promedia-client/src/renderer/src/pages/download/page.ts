import type {
  DownloadAuthEvent,
  DownloadAuthSite,
  DownloadAuthStatus,
  DownloadCandidate,
  DownloadErrorCode,
  DownloadFolderMode,
  DownloadKind,
  DownloadProbeCollection,
  DownloadProgress,
  DownloadResult,
} from '../../../../shared/download.ts'
import { t } from '../../i18n'

type QueueState = 'fetching' | 'ready' | 'downloading' | 'done' | 'skipped' | 'error' | 'cancelled'

interface QueueItem {
  id: string
  candidate: DownloadCandidate
  selected: boolean
  state: QueueState
  progress: DownloadProgress | null
  result: DownloadResult | null
  errorCode: DownloadErrorCode | null
  operationId: string | null
}

interface PendingProbeCollection extends DownloadProbeCollection {
  useCookies: boolean
}

const authSites: readonly DownloadAuthSite[] = ['douyin']
const resolutionOptions = [
  { value: '', label: 'downloads.best' as const },
  { value: '2160', label: '2160p' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
]

export function downloadPage(): string {
  return `
    <main class="app-main min-w-0 flex-1">
      <div class="page-container download-container mx-auto">
        <section class="download-intro" aria-labelledby="download-title">
          <div>
            <p class="download-kicker">${t('downloads.kicker')}</p>
            <h2 id="download-title" class="download-title">${t('downloads.title')}</h2>
            <p class="download-description">${t('downloads.description')}</p>
          </div>
          <p class="download-notice" role="note">${t('downloads.sourceNotice')}</p>
        </section>

        <section class="download-runtime" data-download-runtime aria-live="polite"></section>

        <div class="download-layout">
          <section class="download-panel" aria-labelledby="download-settings-title">
            <div class="download-panel-heading">
              <div>
                <p class="download-panel-kicker">${t('downloads.kicker')}</p>
                <h3 id="download-settings-title" class="download-panel-title">${t('downloads.urlLabel')}</h3>
              </div>
              <span class="download-status" data-download-feedback role="status"></span>
            </div>

            <label class="download-field">
              <span class="download-label">${t('downloads.urlLabel')}</span>
              <textarea class="download-textarea" data-download-urls rows="4" placeholder="${t('downloads.urlPlaceholder')}"></textarea>
            </label>
            <div class="download-action-row">
              <button class="download-primary-button" type="button" data-download-probe>${t('downloads.probe')}</button>
              <button class="download-secondary-button" type="button" data-download-folder>${t('downloads.chooseFolder')}</button>
            </div>

            <div class="download-folder-summary">
              <span class="download-label">${t('downloads.outputFolder')}</span>
              <span class="download-folder-value" data-download-folder-value></span>
            </div>

            <div class="download-grid download-grid-three">
              <label class="download-field">
                <span class="download-label">${t('downloads.kind.video')}</span>
                <select class="download-select" data-download-kind>
                  <option value="video">${t('downloads.kind.video')}</option>
                  <option value="audio">${t('downloads.kind.audio')}</option>
                </select>
              </label>
              <label class="download-field" data-resolution-field>
                <span class="download-label">${t('downloads.resolution')}</span>
                <select class="download-select" data-download-resolution>
                  ${resolutionOptions.map((option) => `<option value="${option.value}">${optionLabel(option.label)}</option>`).join('')}
                </select>
              </label>
              <label class="download-field" data-audio-format-field hidden>
                <span class="download-label">${t('downloads.audioFormat')}</span>
                <select class="download-select" data-download-audio-format>
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="opus">Opus</option>
                  <option value="flac">FLAC</option>
                  <option value="wav">WAV</option>
                </select>
              </label>
              <label class="download-field">
                <span class="download-label">${t('downloads.folderMode')}</span>
                <select class="download-select" data-download-folder-mode>
                  <option value="flat">${t('downloads.folder.flat')}</option>
                  <option value="playlist">${t('downloads.folder.playlist')}</option>
                  <option value="channel">${t('downloads.folder.channel')}</option>
                </select>
              </label>
            </div>

            <details class="download-details" data-download-advanced>
              <summary>${t('downloads.showAdvanced')}</summary>
              <div class="download-details-body">
                <div class="download-grid download-grid-two">
                  <label class="download-field">
                    <span class="download-label">${t('downloads.container')}</span>
                    <select class="download-select" data-download-container>
                      <option value="mp4">MP4</option>
                      <option value="mkv">MKV</option>
                      <option value="webm">WEBM</option>
                    </select>
                  </label>
                  <label class="download-field">
                    <span class="download-label">${t('downloads.outputTemplate')}</span>
                    <input class="download-input" data-download-template value="%(title)s [%(id)s].%(ext)s" spellcheck="false" />
                  </label>
                </div>
                <div class="download-check-grid">
                  <label class="download-check"><input type="checkbox" data-download-subs /> <span>${t('downloads.writeSubs')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-auto-subs disabled /> <span>${t('downloads.autoSubs')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-embed-subs disabled checked /> <span>${t('downloads.embedSubs')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-thumbnail checked /> <span>${t('downloads.embedThumbnail')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-metadata checked /> <span>${t('downloads.embedMetadata')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-archive /> <span>${t('downloads.useArchive')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-overwrite /> <span>${t('downloads.forceOverwrite')}</span></label>
                </div>
                <label class="download-field">
                  <span class="download-label">${t('downloads.proxy')}</span>
                  <div class="download-inline-field">
                    <input class="download-input" data-download-proxy placeholder="${t('downloads.proxyPlaceholder')}" spellcheck="false" />
                    <button class="download-secondary-button" type="button" data-download-proxy-test>${t('downloads.proxyTest')}</button>
                  </div>
                  <span class="download-field-help" data-download-proxy-feedback></span>
                </label>
              </div>
            </details>

            <section class="download-subpanel" aria-labelledby="download-douyin-title">
              <div class="download-subpanel-heading">
                <h4 id="download-douyin-title">${t('downloads.douyinTitle')}</h4>
                <span class="download-subpanel-note">${t('downloads.platform.douyin')}</span>
              </div>
              <div class="download-grid download-grid-three">
                <label class="download-field">
                  <span class="download-label">${t('downloads.douyinMode')}</span>
                  <select class="download-select" data-douyin-mode>
                    <option value="all">${t('downloads.douyinAll')}</option>
                    <option value="batch">${t('downloads.douyinBatch')}</option>
                    <option value="new">${t('downloads.douyinNew')}</option>
                  </select>
                </label>
                <label class="download-field">
                  <span class="download-label">${t('downloads.douyinBatchSize')}</span>
                  <input class="download-input" data-douyin-batch type="number" min="1" max="10000" value="15" />
                </label>
              </div>
              <div class="download-check-grid">
                <label class="download-check"><input type="checkbox" data-douyin-music /> <span>${t('downloads.douyinMusic')}</span></label>
                <label class="download-check"><input type="checkbox" data-douyin-cover checked /> <span>${t('downloads.douyinCover')}</span></label>
                <label class="download-check"><input type="checkbox" data-douyin-metadata checked /> <span>${t('downloads.douyinMetadata')}</span></label>
                <label class="download-check"><input type="checkbox" data-douyin-folder /> <span>${t('downloads.douyinFolderPerVideo')}</span></label>
              </div>
            </section>

            <section class="download-subpanel" aria-labelledby="download-auth-title">
              <div class="download-subpanel-heading">
                <div>
                  <h4 id="download-auth-title">${t('downloads.authTitle')}</h4>
                  <p class="download-field-help">${t('downloads.authDescription')}</p>
                </div>
              </div>
              <div class="download-auth-list" data-download-auth-list></div>
            </section>
          </section>

          <section class="download-panel download-queue-panel" aria-labelledby="download-queue-title">
            <div class="download-panel-heading">
              <div>
                <p class="download-panel-kicker">${t('downloads.queueTitle')}</p>
                <h3 id="download-queue-title" class="download-panel-title" data-download-selected-count>${t('downloads.selectedCount', { count: 0 })}</h3>
              </div>
              <div class="download-action-row download-action-row-compact">
                <button class="download-secondary-button" type="button" data-download-select-all>${t('downloads.selectAll')}</button>
                <button class="download-secondary-button" type="button" data-download-clear>${t('downloads.clear')}</button>
              </div>
            </div>
            <div class="download-queue" data-download-queue aria-live="polite">
              <p class="download-empty">${t('downloads.queueEmpty')}</p>
            </div>
            <div class="download-queue-footer">
              <button class="download-primary-button" type="button" data-download-start>${t('downloads.start')}</button>
              <button class="download-secondary-button" type="button" data-download-cancel hidden>${t('downloads.cancel')}</button>
            </div>
          </section>
        </div>
      </div>
      <div class="download-subchooser-overlay" data-download-subchooser hidden>
        <section class="download-subchooser-modal" role="dialog" aria-modal="true" aria-labelledby="download-subchooser-title">
          <div class="download-subchooser-heading">
            <div>
              <p class="download-panel-kicker">${t('downloads.subchooserKicker')}</p>
              <h3 id="download-subchooser-title" class="download-panel-title">${t('downloads.subchooserTitle')}</h3>
            </div>
            <span class="download-status" data-download-subchooser-count></span>
          </div>
          <p class="download-field-help" data-download-subchooser-description>${t('downloads.subchooserDescription')}</p>
          <div class="download-subchooser-list" data-download-subchooser-list></div>
          <div class="download-action-row download-action-row-compact download-subchooser-footer">
            <button class="download-secondary-button" type="button" data-download-subchooser-close>${t('downloads.subchooserClose')}</button>
          </div>
        </section>
      </div>
    </main>
  `
}

export function setupDownload(root: HTMLDivElement): () => void {
  const runtimeRoot = root.querySelector<HTMLElement>('[data-download-runtime]')!
  const urlsInput = root.querySelector<HTMLTextAreaElement>('[data-download-urls]')!
  const probeButton = root.querySelector<HTMLButtonElement>('[data-download-probe]')!
  const folderButton = root.querySelector<HTMLButtonElement>('[data-download-folder]')!
  const folderValue = root.querySelector<HTMLElement>('[data-download-folder-value]')!
  const kindInput = root.querySelector<HTMLSelectElement>('[data-download-kind]')!
  const resolutionInput = root.querySelector<HTMLSelectElement>('[data-download-resolution]')!
  const resolutionField = root.querySelector<HTMLElement>('[data-resolution-field]')!
  const audioFormatInput = root.querySelector<HTMLSelectElement>('[data-download-audio-format]')!
  const audioFormatField = root.querySelector<HTMLElement>('[data-audio-format-field]')!
  const folderModeInput = root.querySelector<HTMLSelectElement>('[data-download-folder-mode]')!
  const advancedDetails = root.querySelector<HTMLDetailsElement>('[data-download-advanced]')!
  const containerInput = root.querySelector<HTMLSelectElement>('[data-download-container]')!
  const templateInput = root.querySelector<HTMLInputElement>('[data-download-template]')!
  const subsInput = root.querySelector<HTMLInputElement>('[data-download-subs]')!
  const autoSubsInput = root.querySelector<HTMLInputElement>('[data-download-auto-subs]')!
  const embedSubsInput = root.querySelector<HTMLInputElement>('[data-download-embed-subs]')!
  const thumbnailInput = root.querySelector<HTMLInputElement>('[data-download-thumbnail]')!
  const metadataInput = root.querySelector<HTMLInputElement>('[data-download-metadata]')!
  const archiveInput = root.querySelector<HTMLInputElement>('[data-download-archive]')!
  const overwriteInput = root.querySelector<HTMLInputElement>('[data-download-overwrite]')!
  const proxyInput = root.querySelector<HTMLInputElement>('[data-download-proxy]')!
  const proxyTestButton = root.querySelector<HTMLButtonElement>('[data-download-proxy-test]')!
  const proxyFeedback = root.querySelector<HTMLElement>('[data-download-proxy-feedback]')!
  const douyinModeInput = root.querySelector<HTMLSelectElement>('[data-douyin-mode]')!
  const douyinBatchInput = root.querySelector<HTMLInputElement>('[data-douyin-batch]')!
  const douyinMusicInput = root.querySelector<HTMLInputElement>('[data-douyin-music]')!
  const douyinCoverInput = root.querySelector<HTMLInputElement>('[data-douyin-cover]')!
  const douyinMetadataInput = root.querySelector<HTMLInputElement>('[data-douyin-metadata]')!
  const douyinFolderInput = root.querySelector<HTMLInputElement>('[data-douyin-folder]')!
  const authList = root.querySelector<HTMLElement>('[data-download-auth-list]')!
  const queueRoot = root.querySelector<HTMLElement>('[data-download-queue]')!
  const selectedCount = root.querySelector<HTMLElement>('[data-download-selected-count]')!
  const selectAllButton = root.querySelector<HTMLButtonElement>('[data-download-select-all]')!
  const clearButton = root.querySelector<HTMLButtonElement>('[data-download-clear]')!
  const startButton = root.querySelector<HTMLButtonElement>('[data-download-start]')!
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-download-cancel]')!
  const feedback = root.querySelector<HTMLElement>('[data-download-feedback]')!
  const subchooserRoot = root.querySelector<HTMLElement>('[data-download-subchooser]')!
  const subchooserCount = root.querySelector<HTMLElement>('[data-download-subchooser-count]')!
  const subchooserDescription = root.querySelector<HTMLElement>('[data-download-subchooser-description]')!
  const subchooserList = root.querySelector<HTMLElement>('[data-download-subchooser-list]')!
  const subchooserClose = root.querySelector<HTMLButtonElement>('[data-download-subchooser-close]')!

  if (!runtimeRoot || !urlsInput || !probeButton || !folderButton || !folderValue || !kindInput || !resolutionInput || !resolutionField || !audioFormatInput || !audioFormatField || !folderModeInput || !advancedDetails || !containerInput || !templateInput || !subsInput || !autoSubsInput || !embedSubsInput || !thumbnailInput || !metadataInput || !archiveInput || !overwriteInput || !proxyInput || !proxyTestButton || !proxyFeedback || !douyinModeInput || !douyinBatchInput || !douyinMusicInput || !douyinCoverInput || !douyinMetadataInput || !douyinFolderInput || !authList || !queueRoot || !selectedCount || !selectAllButton || !clearButton || !startButton || !cancelButton || !feedback || !subchooserRoot || !subchooserCount || !subchooserDescription || !subchooserList || !subchooserClose) return () => {}

  let disposed = false
  let outputDir = readStored('promedia.download.outputDir')
  let runtimeReady = false
  let probing = false
  let installing = false
  let activeOperationId: string | null = null
  let authStatuses: DownloadAuthStatus[] = []
  let pendingCollections: PendingProbeCollection[] = []
  const useCookies = new Map<DownloadAuthSite, boolean>(authSites.map((site) => [site, readBoolean(`promedia.download.cookies.${site}`)]))
  const queue: QueueItem[] = []
  const progressListener = window.promedia.downloads.onProgress((progress) => {
    const item = queue.find((candidate) => candidate.operationId === progress.operationId)
    if (!item) return
    item.progress = progress
    renderQueue()
  })
  const authEventListener = window.promedia.downloads.auth.onEvent((event) => {
    if (event.phase === 'launching') setFeedback(t('downloads.authLaunching'))
    if (event.phase === 'ready') setFeedback(t('downloads.authReadyMessage'))
    if (event.phase === 'saved') setFeedback(t('downloads.authSaved'))
    if (event.phase === 'error') setFeedback(t('downloads.authError'))
  })
  const runtimeProgressListener = window.promedia.runtimes.onProgress((progress) => {
    if (!installing || disposed) return
    renderRuntimeMessage(progress.percent === undefined ? t('downloads.runtimeMissing') : `${t('downloads.install')} ${progress.percent}%`)
  })

  folderValue.textContent = outputDir || t('downloads.outputFolder')
  kindInput.value = readStored('promedia.download.kind') === 'audio' ? 'audio' : 'video'
  resolutionInput.value = readStored('promedia.download.resolution')
  audioFormatInput.value = readStored('promedia.download.audioFormat') || 'mp3'
  folderModeInput.value = ['flat', 'playlist', 'channel'].includes(readStored('promedia.download.folderMode'))
    ? readStored('promedia.download.folderMode')
    : 'flat'
  restoreDownloadControls()
  syncKindControls()
  autoSubsInput.disabled = !subsInput.checked
  embedSubsInput.disabled = !subsInput.checked
  renderAuth()
  renderQueue()
  void refreshRuntime()
  void refreshAuth()

  const handleKindChange = (): void => {
    syncKindControls()
    persistControls()
  }
  const handleSubsChange = (): void => {
    autoSubsInput.disabled = !subsInput.checked
    embedSubsInput.disabled = !subsInput.checked
    persistControls()
  }
  const handlePersistedControlChange = (): void => {
    persistControls()
  }
  const persistedChangeInputs: readonly (HTMLInputElement | HTMLSelectElement)[] = [
    resolutionInput,
    audioFormatInput,
    folderModeInput,
    containerInput,
    autoSubsInput,
    embedSubsInput,
    thumbnailInput,
    metadataInput,
    archiveInput,
    overwriteInput,
    douyinModeInput,
    douyinBatchInput,
    douyinMusicInput,
    douyinCoverInput,
    douyinMetadataInput,
    douyinFolderInput,
  ]
  const handleFolder = async (): Promise<void> => {
    const selected = await window.promedia.dialog.chooseDirectory()
    if (selected) {
      outputDir = selected
      folderValue.textContent = selected
      writeStored('promedia.download.outputDir', selected)
      renderQueue()
    }
  }

  const appendCandidates = (
    candidates: readonly DownloadCandidate[],
    isDouyinChannel = false,
  ): number => {
    const batchSize = Math.max(1, Number(douyinBatchInput.value) || 15)
    let candidateIndex = 0
    let added = 0
    for (const candidate of candidates.slice(0, 500)) {
      if (queue.some((item) => item.candidate.url === candidate.url && item.candidate.id === candidate.id)) continue
      queue.push({
        id: crypto.randomUUID(),
        candidate,
        selected: !isDouyinChannel || douyinModeInput.value !== 'batch' || candidateIndex < batchSize,
        state: 'ready',
        progress: null,
        result: null,
        errorCode: null,
        operationId: null,
      })
      candidateIndex += 1
      added += 1
    }
    return added
  }

  const renderSubChooser = (): void => {
    const open = pendingCollections.length > 0
    subchooserRoot.hidden = !open
    subchooserCount.textContent = open
      ? t('downloads.subchooserCount', { count: pendingCollections.length })
      : ''
    subchooserDescription.textContent = t('downloads.subchooserDescription')
    subchooserClose.disabled = probing
    subchooserList.replaceChildren()
    if (!open) return
    for (const collection of pendingCollections) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'download-subchooser-item'
      button.disabled = probing
      const title = document.createElement('strong')
      title.textContent = collection.title
      const count = document.createElement('span')
      count.className = 'download-subchooser-item-count'
      count.textContent = collection.count === null
        ? t('downloads.subchooserOpen')
        : t('downloads.subchooserVideoCount', { count: collection.count })
      button.append(title, count)
      button.addEventListener('click', () => { void openSubCollection(collection) })
      subchooserList.append(button)
    }
  }

  const closeSubChooser = (): void => {
    if (probing) return
    pendingCollections = []
    renderSubChooser()
  }

  const openSubCollection = async (collection: PendingProbeCollection): Promise<void> => {
    if (probing || !runtimeReady) return
    probing = true
    probeButton.disabled = true
    probeButton.textContent = t('downloads.probing')
    renderSubChooser()
    try {
      const result = await window.promedia.downloads.probe({
        url: collection.url,
        useCookies: collection.useCookies,
      })
      if (!result.ok) {
        setFeedback(errorLabel(result.errorCode ?? 'unknown'))
        return
      }
      appendCandidates(result.candidates)
      pendingCollections = result.collections.map((child) => ({
        ...child,
        useCookies: collection.useCookies,
      }))
      if (result.candidates.length === 0 && result.collections.length === 0) {
        setFeedback(t('downloads.analysisFailed'))
      }
      renderQueue()
      renderSubChooser()
    } catch {
      setFeedback(t('downloads.analysisFailed'))
    } finally {
      probing = false
      probeButton.disabled = !runtimeReady
      probeButton.textContent = t('downloads.probe')
      renderSubChooser()
    }
  }

  const handleProbe = async (): Promise<void> => {
    if (probing || !runtimeReady) return
    const urls = urlsInput.value.split(/\s+/).map((value) => value.trim()).filter(Boolean)
    if (urls.length === 0) {
      setFeedback(t('downloads.error.invalidUrl'))
      return
    }
    probing = true
    pendingCollections = []
    renderSubChooser()
    probeButton.disabled = true
    probeButton.textContent = t('downloads.probing')
    try {
      for (const url of urls) {
        const site = authSiteForURL(url)
        const result = await window.promedia.downloads.probe({
          url,
          useCookies: site ? useCookies.get(site) ?? false : false,
        })
        if (!result.ok) {
          setFeedback(errorLabel(result.errorCode ?? 'unknown'))
          continue
        }
        const isDouyinChannel = site === 'douyin' && /\/user\//i.test(url)
        appendCandidates(result.candidates, isDouyinChannel)
        pendingCollections.push(...result.collections.map((collection) => ({
          ...collection,
          useCookies: site ? useCookies.get(site) ?? false : false,
        })))
        if (result.candidates.length === 0 && result.collections.length === 0) setFeedback(t('downloads.analysisFailed'))
      }
      urlsInput.value = ''
      renderQueue()
      renderSubChooser()
    } catch {
      setFeedback(t('downloads.analysisFailed'))
    } finally {
      probing = false
      probeButton.disabled = !runtimeReady
      probeButton.textContent = t('downloads.probe')
      renderSubChooser()
    }
  }
  const handleProxyTest = async (): Promise<void> => {
    if (!proxyInput.value.trim()) return
    proxyTestButton.disabled = true
    proxyTestButton.textContent = t('downloads.proxyTesting')
    try {
      const result = await window.promedia.downloads.testProxy(proxyInput.value.trim())
      proxyFeedback.textContent = result.ok ? t('downloads.proxySuccess') : errorLabel(result.errorCode ?? 'network')
      proxyFeedback.className = `download-field-help ${result.ok ? 'is-success' : 'is-error'}`
    } catch {
      proxyFeedback.textContent = t('downloads.proxyFailed')
      proxyFeedback.className = 'download-field-help is-error'
    } finally {
      proxyTestButton.disabled = false
      proxyTestButton.textContent = t('downloads.proxyTest')
    }
  }
  const handleQueueClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return
    const remove = event.target.closest<HTMLButtonElement>('[data-download-remove]')
    if (remove) {
      const item = queue.find((candidate) => candidate.id === remove.dataset.downloadRemove)
      if (item && item.state !== 'downloading') queue.splice(queue.indexOf(item), 1)
      renderQueue()
    }
  }
  const handleQueueChange = (event: Event): void => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || input.dataset.downloadSelect === undefined) return
    const item = queue.find((candidate) => candidate.id === input.dataset.downloadSelect)
    if (item) item.selected = input.checked
    renderQueue()
  }
  const handleSelectAll = (): void => {
    const next = queue.some((item) => !item.selected)
    queue.forEach((item) => { if (item.state !== 'downloading') item.selected = next })
    renderQueue()
  }
  const handleClear = (): void => {
    if (!activeOperationId) queue.splice(0, queue.length)
    renderQueue()
  }
  const handleStart = (): void => { void startQueue() }
  const handleCancel = (): void => {
    if (activeOperationId) window.promedia.downloads.cancel(activeOperationId)
  }
  const handleAuthClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return
    const action = event.target.closest<HTMLButtonElement>('[data-auth-action]')
    if (!action) return
    const site = action.dataset.authSite as DownloadAuthSite | undefined
    if (!site) return
    if (action.dataset.authAction === 'login') void login(site)
    if (action.dataset.authAction === 'clear') void clearAuth(site)
  }
  const handleAuthChange = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.authUse) return
    const site = event.target.dataset.authUse as DownloadAuthSite
    useCookies.set(site, event.target.checked)
    writeStored(`promedia.download.cookies.${site}`, event.target.checked ? 'true' : 'false')
  }

  kindInput.addEventListener('change', handleKindChange)
  subsInput.addEventListener('change', handleSubsChange)
  for (const input of persistedChangeInputs) input.addEventListener('change', handlePersistedControlChange)
  templateInput.addEventListener('input', handlePersistedControlChange)
  proxyInput.addEventListener('input', handlePersistedControlChange)
  advancedDetails.addEventListener('toggle', handlePersistedControlChange)
  const handleFolderClick = (): void => { void handleFolder() }
  const handleProbeClick = (): void => { void handleProbe() }
  const handleProxyTestClick = (): void => { void handleProxyTest() }
  folderButton.addEventListener('click', handleFolderClick)
  probeButton.addEventListener('click', handleProbeClick)
  proxyTestButton.addEventListener('click', handleProxyTestClick)
  queueRoot.addEventListener('click', handleQueueClick)
  queueRoot.addEventListener('change', handleQueueChange)
  selectAllButton.addEventListener('click', handleSelectAll)
  clearButton.addEventListener('click', handleClear)
  startButton.addEventListener('click', handleStart)
  cancelButton.addEventListener('click', handleCancel)
  subchooserClose.addEventListener('click', closeSubChooser)
  authList.addEventListener('click', handleAuthClick)
  authList.addEventListener('change', handleAuthChange)

  async function refreshRuntime(): Promise<void> {
    try {
      const statuses = await Promise.all([
        window.promedia.runtimes.status({ runtimeId: 'yt-dlp' }),
        window.promedia.runtimes.status({ runtimeId: 'media-processing' }),
        window.promedia.runtimes.status({ runtimeId: 'douyin-engine' }),
      ])
      if (disposed) return
      runtimeReady = statuses.every((status) => status?.state === 'ready')
      renderRuntime()
      renderControls()
    } catch {
      runtimeReady = false
      renderRuntimeMessage(t('downloads.runtimeUnavailable'))
      renderControls()
    }
  }

  async function installRuntime(): Promise<void> {
    if (installing) return
    installing = true
    renderRuntimeMessage(t('downloads.install'))
    try {
      for (const runtimeId of ['yt-dlp', 'media-processing', 'douyin-engine']) {
        const status = await window.promedia.runtimes.status({ runtimeId })
        if (status?.state === 'ready') continue
        const result = await window.promedia.runtimes.install({ operationId: crypto.randomUUID(), runtimeId })
        if (result.status !== 'installed') {
          setFeedback(t('downloads.runtimeUnavailable'))
          return
        }
      }
    } finally {
      installing = false
      await refreshRuntime()
    }
  }

  async function refreshAuth(): Promise<void> {
    try {
      authStatuses = await window.promedia.downloads.auth.status()
      if (!disposed) renderAuth()
    } catch {
      authStatuses = []
      if (!disposed) renderAuth()
    }
  }

  async function login(site: DownloadAuthSite): Promise<void> {
    try {
      await window.promedia.downloads.auth.login(site)
      await refreshAuth()
    } catch {
      setFeedback(t('downloads.authError'))
    }
  }

  async function clearAuth(site: DownloadAuthSite): Promise<void> {
    await window.promedia.downloads.auth.clear(site)
    useCookies.set(site, false)
    writeStored(`promedia.download.cookies.${site}`, 'false')
    await refreshAuth()
  }

  async function startQueue(): Promise<void> {
    if (!runtimeReady || !outputDir || activeOperationId) {
      if (!outputDir) setFeedback(t('downloads.chooseFolder'))
      return
    }
    const items = queue.filter((item) => item.selected && ['ready', 'error', 'skipped', 'cancelled'].includes(item.state))
    if (items.length === 0) return
    for (const item of items) {
      if (disposed) return
      const operationId = crypto.randomUUID()
      activeOperationId = operationId
      item.operationId = operationId
      item.state = 'downloading'
      item.progress = null
      item.errorCode = null
      item.result = null
      renderQueue()
      try {
        const result = await window.promedia.downloads.start({
          operationId,
          url: item.candidate.url,
          playlistTitle: item.candidate.playlistTitle,
          kind: kindInput.value as DownloadKind,
          maxHeight: kindInput.value === 'video' ? (resolutionInput.value ? Number(resolutionInput.value) : null) : null,
          audioFormat: audioFormatInput.value as 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav',
          outputDir,
          container: containerInput.value as 'mp4' | 'mkv' | 'webm',
          outputTemplate: templateInput.value,
          folderMode: folderModeInput.value as DownloadFolderMode,
          writeSubtitles: subsInput.checked,
          autoSubtitles: autoSubsInput.checked,
          subtitleLanguages: 'vi,en',
          embedSubtitles: embedSubsInput.checked,
          embedThumbnail: thumbnailInput.checked,
          embedMetadata: metadataInput.checked,
          useArchive: archiveInput.checked,
          forceOverwrite: overwriteInput.checked,
          proxy: proxyInput.value.trim() || null,
          useCookies: useCookies.get(item.candidate.platform) ?? false,
          douyin: {
            mode: douyinModeInput.value as 'all' | 'batch' | 'new',
            batchSize: Math.max(1, Number(douyinBatchInput.value) || 15),
            music: douyinMusicInput.checked,
            cover: douyinCoverInput.checked,
            metadata: douyinMetadataInput.checked,
            folderPerVideo: douyinFolderInput.checked,
          },
        })
        item.result = result
        item.errorCode = result.errorCode ?? null
        item.state = result.status === 'done' ? 'done' : result.status === 'skipped' ? 'skipped' : result.status === 'cancelled' ? 'cancelled' : 'error'
      } catch {
        item.state = 'error'
        item.errorCode = 'unknown'
      } finally {
        activeOperationId = null
        renderQueue()
      }
    }
  }

  function renderRuntime(): void {
    runtimeRoot.hidden = runtimeReady
    runtimeRoot.replaceChildren()
    const title = document.createElement('strong')
    title.textContent = runtimeReady ? t('downloads.runtimeReady') : t('downloads.runtimeMissing')
    const message = document.createElement('span')
    message.textContent = runtimeReady ? t('downloads.runtimeReady') : t('downloads.runtimeDescription')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'download-runtime-button'
    button.textContent = t('downloads.install')
    button.hidden = runtimeReady
    button.disabled = installing
    button.addEventListener('click', () => { void installRuntime() })
    runtimeRoot.append(title, message, button)
  }

  function renderRuntimeMessage(message: string): void {
    runtimeRoot.hidden = false
    const text = document.createElement('span')
    text.textContent = message
    runtimeRoot.replaceChildren(text)
  }

  function renderControls(): void {
    probeButton.disabled = !runtimeReady || probing
    startButton.disabled = !runtimeReady || !outputDir || Boolean(activeOperationId)
    clearButton.disabled = Boolean(activeOperationId)
    folderButton.disabled = Boolean(activeOperationId)
  }

  function renderAuth(): void {
    authList.replaceChildren(...authSites.map((site) => {
      const status = authStatuses.find((candidate) => candidate.site === site)
      const row = document.createElement('div')
      row.className = 'download-auth-row'
      const info = document.createElement('div')
      info.className = 'download-auth-info'
      const name = document.createElement('strong')
      name.textContent = platformLabel(site)
      const state = document.createElement('span')
      state.className = `download-auth-state ${status?.loggedIn ? 'is-ready' : ''}`
      state.textContent = status?.loggedIn ? t('downloads.authReady') : t('downloads.authMissing')
      info.append(name, state)
      const actions = document.createElement('div')
      actions.className = 'download-auth-actions'
      const use = document.createElement('label')
      use.className = 'download-check'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.dataset.authUse = site
      checkbox.checked = useCookies.get(site) ?? false
      checkbox.disabled = !status?.hasCookies
      const useText = document.createElement('span')
      useText.textContent = t('downloads.authUse')
      use.append(checkbox, useText)
      const loginButton = document.createElement('button')
      loginButton.type = 'button'
      loginButton.className = 'download-link-button'
      loginButton.dataset.authAction = 'login'
      loginButton.dataset.authSite = site
      loginButton.textContent = t('downloads.authLogin')
      actions.append(use, loginButton)
      if (status?.hasCookies) {
        const clear = document.createElement('button')
        clear.type = 'button'
        clear.className = 'download-link-button'
        clear.dataset.authAction = 'clear'
        clear.dataset.authSite = site
        clear.textContent = t('downloads.authLogout')
        actions.append(clear)
      }
      row.append(info, actions)
      return row
    }))
  }

  function renderQueue(): void {
    const count = queue.filter((item) => item.selected).length
    selectedCount.textContent = t('downloads.selectedCount', { count })
    renderControls()
    if (queue.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'download-empty'
      empty.textContent = t('downloads.queueEmpty')
      queueRoot.replaceChildren(empty)
      cancelButton.hidden = true
      return
    }
    queueRoot.replaceChildren(...queue.map(queueRow))
    cancelButton.hidden = !activeOperationId
  }

  function queueRow(item: QueueItem): HTMLElement {
    const row = document.createElement('article')
    row.className = `download-queue-row is-${item.state}`
    const select = document.createElement('input')
    select.type = 'checkbox'
    select.dataset.downloadSelect = item.id
    select.checked = item.selected
    select.disabled = item.state === 'downloading'
    const thumbnail = document.createElement('div')
    thumbnail.className = 'download-queue-thumbnail'
    const placeholder = document.createElement('span')
    placeholder.textContent = '🎞'
    thumbnail.append(placeholder)
    if (item.candidate.thumbnailURL) {
      const image = document.createElement('img')
      image.alt = ''
      image.loading = 'lazy'
      image.referrerPolicy = 'no-referrer'
      let proxyAttempted = false
      const loadThumbnailThroughMain = async (): Promise<void> => {
        if (proxyAttempted) {
          image.hidden = true
          return
        }
        proxyAttempted = true
        try {
          const result = await window.promedia.downloads.thumbnail({
            thumbnailURL: item.candidate.thumbnailURL!,
            sourceURL: item.candidate.webpageURL,
            useCookies: useCookies.get(item.candidate.platform) ?? false,
          })
          if (result.dataURL) {
            image.src = result.dataURL
            return
          }
        } catch {
          // Hình thumbnail không được phép làm hỏng danh sách video.
        }
        image.hidden = true
      }
      image.addEventListener('load', () => { placeholder.hidden = true })
      image.addEventListener('error', () => { void loadThumbnailThroughMain() })
      if (item.candidate.platform === 'douyin') void loadThumbnailThroughMain()
      else image.src = item.candidate.thumbnailURL
      thumbnail.append(image)
    }
    const body = document.createElement('div')
    body.className = 'download-queue-body'
    const heading = document.createElement('div')
    heading.className = 'download-queue-heading'
    const title = document.createElement('strong')
    title.textContent = item.candidate.title
    const platform = document.createElement('span')
    platform.className = 'download-platform'
    platform.textContent = platformLabel(item.candidate.platform)
    heading.append(title, platform)
    const meta = document.createElement('span')
    meta.className = 'download-queue-meta'
    meta.textContent = [item.candidate.uploader, item.candidate.durationLabel, item.candidate.playlistTitle].filter(Boolean).join(' · ')
    body.append(heading, meta)
    if (item.progress?.percent !== null && item.progress?.percent !== undefined) {
      const progress = document.createElement('progress')
      progress.className = 'download-progress'
      progress.max = 100
      progress.value = item.progress.percent
      body.append(progress)
    }
    if (item.errorCode) {
      const error = document.createElement('span')
      error.className = 'download-queue-error'
      error.textContent = errorLabel(item.errorCode)
      body.append(error)
    }
    const side = document.createElement('div')
    side.className = 'download-queue-side'
    const state = document.createElement('span')
    state.className = 'download-queue-state'
    state.textContent = queueStateLabel(item.state)
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'download-link-button'
    remove.dataset.downloadRemove = item.id
    remove.title = t('downloads.remove')
    remove.textContent = '×'
    side.append(state, remove)
    row.append(select, thumbnail, body, side)
    return row
  }

  function syncKindControls(): void {
    const audio = kindInput.value === 'audio'
    resolutionField.hidden = audio
    audioFormatField.hidden = !audio
    containerInput.disabled = audio
  }

  function persistControls(): void {
    writeStored('promedia.download.kind', kindInput.value)
    writeStored('promedia.download.resolution', resolutionInput.value)
    writeStored('promedia.download.audioFormat', audioFormatInput.value)
    writeStored('promedia.download.folderMode', folderModeInput.value)
    writeStored('promedia.download.advancedOpen', String(advancedDetails.open))
    writeStored('promedia.download.container', containerInput.value)
    writeStored('promedia.download.template', templateInput.value)
    writeStored('promedia.download.subs', String(subsInput.checked))
    writeStored('promedia.download.autoSubs', String(autoSubsInput.checked))
    writeStored('promedia.download.embedSubs', String(embedSubsInput.checked))
    writeStored('promedia.download.thumbnail', String(thumbnailInput.checked))
    writeStored('promedia.download.metadata', String(metadataInput.checked))
    writeStored('promedia.download.archive', String(archiveInput.checked))
    writeStored('promedia.download.overwrite', String(overwriteInput.checked))
    writeStored('promedia.download.proxy', proxyInput.value)
    writeStored('promedia.download.douyinMode', douyinModeInput.value)
    writeStored('promedia.download.douyinBatch', douyinBatchInput.value)
    writeStored('promedia.download.douyinMusic', String(douyinMusicInput.checked))
    writeStored('promedia.download.douyinCover', String(douyinCoverInput.checked))
    writeStored('promedia.download.douyinMetadata', String(douyinMetadataInput.checked))
    writeStored('promedia.download.douyinFolder', String(douyinFolderInput.checked))
  }

  function restoreDownloadControls(): void {
    restoreBoolean(advancedDetails, 'promedia.download.advancedOpen', 'open')
    restoreValue(containerInput, 'promedia.download.container', ['mp4', 'mkv', 'webm'])
    restoreValue(templateInput, 'promedia.download.template')
    restoreBoolean(subsInput, 'promedia.download.subs')
    restoreBoolean(autoSubsInput, 'promedia.download.autoSubs')
    restoreBoolean(embedSubsInput, 'promedia.download.embedSubs')
    restoreBoolean(thumbnailInput, 'promedia.download.thumbnail')
    restoreBoolean(metadataInput, 'promedia.download.metadata')
    restoreBoolean(archiveInput, 'promedia.download.archive')
    restoreBoolean(overwriteInput, 'promedia.download.overwrite')
    restoreValue(proxyInput, 'promedia.download.proxy')
    restoreValue(douyinModeInput, 'promedia.download.douyinMode', ['all', 'batch', 'new'])

    const storedBatchSize = Number(readStored('promedia.download.douyinBatch'))
    if (Number.isSafeInteger(storedBatchSize) && storedBatchSize >= 1 && storedBatchSize <= 10_000) {
      douyinBatchInput.value = String(storedBatchSize)
    }
    restoreBoolean(douyinMusicInput, 'promedia.download.douyinMusic')
    restoreBoolean(douyinCoverInput, 'promedia.download.douyinCover')
    restoreBoolean(douyinMetadataInput, 'promedia.download.douyinMetadata')
    restoreBoolean(douyinFolderInput, 'promedia.download.douyinFolder')
  }

  function setFeedback(message: string): void {
    if (!disposed) feedback.textContent = message
  }

  return () => {
    disposed = true
    progressListener()
    authEventListener()
    runtimeProgressListener()
    kindInput.removeEventListener('change', handleKindChange)
    subsInput.removeEventListener('change', handleSubsChange)
    for (const input of persistedChangeInputs) input.removeEventListener('change', handlePersistedControlChange)
    templateInput.removeEventListener('input', handlePersistedControlChange)
    proxyInput.removeEventListener('input', handlePersistedControlChange)
    advancedDetails.removeEventListener('toggle', handlePersistedControlChange)
    folderButton.removeEventListener('click', handleFolderClick)
    probeButton.removeEventListener('click', handleProbeClick)
    proxyTestButton.removeEventListener('click', handleProxyTestClick)
    queueRoot.removeEventListener('click', handleQueueClick)
    queueRoot.removeEventListener('change', handleQueueChange)
    selectAllButton.removeEventListener('click', handleSelectAll)
    clearButton.removeEventListener('click', handleClear)
    startButton.removeEventListener('click', handleStart)
    cancelButton.removeEventListener('click', handleCancel)
    subchooserClose.removeEventListener('click', closeSubChooser)
    authList.removeEventListener('click', handleAuthClick)
    authList.removeEventListener('change', handleAuthChange)
  }
}

function authSiteForURL(value: string): DownloadAuthSite | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
    if (hostname === 'douyin.com' || hostname.endsWith('.douyin.com') || hostname === 'iesdouyin.com' || hostname.endsWith('.iesdouyin.com')) return 'douyin'
    if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com') || hostname === 'fb.watch') return 'facebook'
    if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'tiktok'
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') return 'youtube'
  } catch {
    return null
  }
  return null
}

function platformLabel(platform: DownloadAuthSite): string {
  const keys: Record<DownloadAuthSite, 'downloads.platform.facebook' | 'downloads.platform.tiktok' | 'downloads.platform.douyin' | 'downloads.platform.youtube'> = {
    facebook: 'downloads.platform.facebook',
    tiktok: 'downloads.platform.tiktok',
    douyin: 'downloads.platform.douyin',
    youtube: 'downloads.platform.youtube',
  }
  return t(keys[platform])
}

function optionLabel(value: string): string {
  return value === 'downloads.best' ? t('downloads.best') : value
}

function queueStateLabel(state: QueueState): string {
  const keys: Record<QueueState, 'downloads.queueFetching' | 'downloads.queueReady' | 'downloads.queueDownloading' | 'downloads.queueDone' | 'downloads.queueSkipped' | 'downloads.queueError' | 'downloads.queueCancelled'> = {
    fetching: 'downloads.queueFetching',
    ready: 'downloads.queueReady',
    downloading: 'downloads.queueDownloading',
    done: 'downloads.queueDone',
    skipped: 'downloads.queueSkipped',
    error: 'downloads.queueError',
    cancelled: 'downloads.queueCancelled',
  }
  return t(keys[state])
}

function errorLabel(code: DownloadErrorCode): string {
  const keys: Record<DownloadErrorCode, string> = {
    'invalid-request': 'downloads.error.invalidRequest',
    'invalid-url': 'downloads.error.invalidUrl',
    'unsupported-platform': 'downloads.error.unsupportedPlatform',
    'runtime-missing': 'downloads.error.runtimeMissing',
    'runtime-invalid': 'downloads.error.runtimeInvalid',
    network: 'downloads.error.network',
    'authentication-required': 'downloads.error.authentication',
    'rate-limited': 'downloads.error.rateLimited',
    'format-unavailable': 'downloads.error.format',
    'http-403': 'downloads.error.forbidden',
    busy: 'downloads.error.busy',
    'output-failed': 'downloads.error.output',
    cancelled: 'downloads.queueCancelled',
    unknown: 'downloads.error.unknown',
  }
  return t(keys[code] as never)
}

function readStored(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function readBoolean(key: string): boolean {
  return readStored(key) === 'true'
}

function restoreBoolean(input: HTMLInputElement | HTMLDetailsElement, key: string, property: 'checked' | 'open' = 'checked'): void {
  const stored = readStored(key)
  if (stored !== 'true' && stored !== 'false') return
  if (property === 'open' && input instanceof HTMLDetailsElement) input.open = stored === 'true'
  if (property === 'checked' && input instanceof HTMLInputElement) input.checked = stored === 'true'
}

function restoreValue(input: HTMLInputElement | HTMLSelectElement, key: string, allowedValues?: readonly string[]): void {
  const stored = readStored(key)
  if (!stored || (allowedValues && !allowedValues.includes(stored))) return
  input.value = stored
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Không làm gián đoạn lượt tải nếu localStorage không khả dụng.
  }
}
