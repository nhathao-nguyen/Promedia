import type {
  DownloadAuthEvent,
  DownloadAuthSite,
  DownloadAuthStatus,
  DownloadChannelRecord,
  DownloadCandidate,
  DownloadErrorCode,
  DownloadFolderMode,
  DownloadPlatform,
  DownloadProbeCollection,
  DownloadProgress,
  DownloadProgressDetailCode,
  DownloadResult,
  DownloadOperationStatus,
} from '../../../../shared/download.ts'
import {
  downloadAuthSites,
  requiredDownloadRuntimeIDsForDownload,
  requiredDownloadRuntimeIDsForProbe,
  requiredDownloadRuntimeIDsForProxyTest,
} from '../../../../shared/download.ts'
import { buildDownloadRequest, type DownloadControlState } from './request.ts'
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

const authSites: readonly DownloadAuthSite[] = downloadAuthSites
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

            <fieldset class="download-platform-fieldset" data-yt-options>
              <legend>${t('downloads.platform.youtube')}</legend>
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
                  <label class="download-check"><input type="checkbox" data-download-h264 /> <span>${t('downloads.ensureH264')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-archive /> <span>${t('downloads.useArchive')}</span></label>
                  <label class="download-check"><input type="checkbox" data-download-overwrite /> <span>${t('downloads.forceOverwrite')}</span></label>
                </div>
              </div>
            </details>
            </fieldset>

            <section class="download-common-options" aria-labelledby="download-proxy-title">
              <label class="download-field">
                <span class="download-label" id="download-proxy-title">${t('downloads.proxy')}</span>
                <div class="download-inline-field">
                  <input class="download-input" data-download-proxy placeholder="${t('downloads.proxyPlaceholder')}" spellcheck="false" />
                  <button class="download-secondary-button" type="button" data-download-proxy-test>${t('downloads.proxyTest')}</button>
                </div>
                <span class="download-field-help" data-download-proxy-feedback></span>
              </label>
            </section>

            <fieldset class="download-subpanel download-platform-fieldset" aria-labelledby="download-douyin-title" data-douyin-options>
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
                <label class="download-check"><input type="checkbox" data-douyin-avatar /> <span>${t('downloads.douyinAvatar')}</span></label>
                <label class="download-check"><input type="checkbox" data-douyin-metadata checked /> <span>${t('downloads.douyinMetadata')}</span></label>
                <label class="download-check"><input type="checkbox" data-douyin-folder /> <span>${t('downloads.douyinFolderPerVideo')}</span></label>
                <label class="download-check"><input type="checkbox" data-douyin-h264 /> <span>${t('downloads.ensureH264')}</span></label>
              </div>
            </fieldset>

            <section class="download-subpanel" aria-labelledby="download-auth-title">
              <div class="download-subpanel-heading">
                <div>
                  <h4 id="download-auth-title">${t('downloads.authTitle')}</h4>
                  <p class="download-field-help">${t('downloads.authDescription')}</p>
                </div>
              </div>
              <div class="download-auth-list" data-download-auth-list></div>
            </section>

            <section class="download-subpanel" aria-labelledby="download-history-title">
              <div class="download-subpanel-heading">
                <div>
                  <h4 id="download-history-title">${t('downloads.historyTitle')}</h4>
                  <p class="download-field-help">${t('downloads.historyDescription')}</p>
                </div>
                <button class="download-link-button" type="button" data-download-history-refresh>${t('downloads.historyRefresh')}</button>
              </div>
              <div class="download-history-list" data-download-history-list aria-live="polite"></div>
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
        <section class="download-subchooser-modal" role="dialog" aria-modal="true" aria-labelledby="download-subchooser-title" tabindex="-1">
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
  const h264Input = root.querySelector<HTMLInputElement>('[data-download-h264]')!
  const archiveInput = root.querySelector<HTMLInputElement>('[data-download-archive]')!
  const overwriteInput = root.querySelector<HTMLInputElement>('[data-download-overwrite]')!
  const proxyInput = root.querySelector<HTMLInputElement>('[data-download-proxy]')!
  const proxyTestButton = root.querySelector<HTMLButtonElement>('[data-download-proxy-test]')!
  const proxyFeedback = root.querySelector<HTMLElement>('[data-download-proxy-feedback]')!
  const ytOptionGroups = [...root.querySelectorAll<HTMLElement>('[data-yt-options]')]
  const douyinOptionGroup = root.querySelector<HTMLElement>('[data-douyin-options]')!
  const douyinModeInput = root.querySelector<HTMLSelectElement>('[data-douyin-mode]')!
  const douyinBatchInput = root.querySelector<HTMLInputElement>('[data-douyin-batch]')!
  const douyinMusicInput = root.querySelector<HTMLInputElement>('[data-douyin-music]')!
  const douyinCoverInput = root.querySelector<HTMLInputElement>('[data-douyin-cover]')!
  const douyinAvatarInput = root.querySelector<HTMLInputElement>('[data-douyin-avatar]')!
  const douyinMetadataInput = root.querySelector<HTMLInputElement>('[data-douyin-metadata]')!
  const douyinFolderInput = root.querySelector<HTMLInputElement>('[data-douyin-folder]')!
  const douyinH264Input = root.querySelector<HTMLInputElement>('[data-douyin-h264]')!
  const authList = root.querySelector<HTMLElement>('[data-download-auth-list]')!
  const historyRefresh = root.querySelector<HTMLButtonElement>('[data-download-history-refresh]')!
  const historyList = root.querySelector<HTMLElement>('[data-download-history-list]')!
  const queueRoot = root.querySelector<HTMLElement>('[data-download-queue]')!
  const selectedCount = root.querySelector<HTMLElement>('[data-download-selected-count]')!
  const selectAllButton = root.querySelector<HTMLButtonElement>('[data-download-select-all]')!
  const clearButton = root.querySelector<HTMLButtonElement>('[data-download-clear]')!
  const startButton = root.querySelector<HTMLButtonElement>('[data-download-start]')!
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-download-cancel]')!
  const feedback = root.querySelector<HTMLElement>('[data-download-feedback]')!
  const subchooserRoot = root.querySelector<HTMLElement>('[data-download-subchooser]')!
  const subchooserModal = root.querySelector<HTMLElement>('.download-subchooser-modal')!
  const subchooserCount = root.querySelector<HTMLElement>('[data-download-subchooser-count]')!
  const subchooserDescription = root.querySelector<HTMLElement>('[data-download-subchooser-description]')!
  const subchooserList = root.querySelector<HTMLElement>('[data-download-subchooser-list]')!
  const subchooserClose = root.querySelector<HTMLButtonElement>('[data-download-subchooser-close]')!

  if (!runtimeRoot || !urlsInput || !probeButton || !folderButton || !folderValue || !kindInput || !resolutionInput || !resolutionField || !audioFormatInput || !audioFormatField || !folderModeInput || !advancedDetails || !containerInput || !templateInput || !subsInput || !autoSubsInput || !embedSubsInput || !thumbnailInput || !metadataInput || !h264Input || !archiveInput || !overwriteInput || !proxyInput || !proxyTestButton || !proxyFeedback || !douyinModeInput || !douyinBatchInput || !douyinMusicInput || !douyinCoverInput || !douyinAvatarInput || !douyinMetadataInput || !douyinFolderInput || !douyinH264Input || !authList || !historyRefresh || !historyList || !queueRoot || !selectedCount || !selectAllButton || !clearButton || !startButton || !cancelButton || !feedback || !subchooserRoot || !subchooserModal || !subchooserCount || !subchooserDescription || !subchooserList || !subchooserClose) return () => {}

  let disposed = false
  let outputDir = readStored('promedia.download.outputDir')
  let runtimeReady = false
  let runtimeRefreshVersion = 0
  let probing = false
  let installing = false
  let activeOperationId: string | null = null
  let authStatuses: DownloadAuthStatus[] = []
  let channelHistory: DownloadChannelRecord[] = []
  let pendingCollections: PendingProbeCollection[] = []
  let subchooserOpener: HTMLElement | null = null
  const useCookies = new Map<DownloadAuthSite, boolean>(authSites.map((site) => [site, readBoolean(`promedia.download.cookies.${site}`)]))
  const queue: QueueItem[] = []
  const operationListener = window.promedia.downloads.onOperation((status) => {
    applyOperationStatus(status)
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
  syncPlatformControls()
  autoSubsInput.disabled = !subsInput.checked
  embedSubsInput.disabled = !subsInput.checked
  renderAuth()
  renderHistory()
  renderQueue()
  void refreshRuntime()
  void refreshAuth()
  void refreshHistory()
  void hydrateBackgroundOperations()

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
  const handleURLsInput = (): void => {
    syncPlatformControls()
    void refreshRuntime()
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
    h264Input,
    archiveInput,
    overwriteInput,
    douyinModeInput,
    douyinBatchInput,
    douyinMusicInput,
    douyinCoverInput,
    douyinAvatarInput,
    douyinMetadataInput,
    douyinFolderInput,
    douyinH264Input,
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
    if (open) queueMicrotask(() => subchooserModal.focus())
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
    subchooserOpener?.focus()
    subchooserOpener = null
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
      if (result.operationId) void window.promedia.downloads.dismiss(result.operationId)
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
    setFeedback('')
    subchooserOpener = probeButton
    probing = true
    pendingCollections = []
    renderSubChooser()
    probeButton.disabled = true
    probeButton.textContent = t('downloads.probing')
    const failedURLs: string[] = []
    try {
      const results = await Promise.all(urls.map(async (url) => {
        const site = authSiteForURL(url)
        const result = await window.promedia.downloads.probe({
          url,
          useCookies: site ? useCookies.get(site) ?? false : false,
        })
        return { url, site, result }
      }))
      for (const { url, site, result } of results) {
        if (!result.ok) {
          failedURLs.push(url)
          setFeedback(errorLabel(result.errorCode ?? 'unknown'))
          continue
        }
        const isDouyinChannel = site === 'douyin' && /\/user\//i.test(url)
        appendCandidates(result.candidates, isDouyinChannel)
        pendingCollections.push(...result.collections.map((collection) => ({
          ...collection,
          useCookies: site ? useCookies.get(site) ?? false : false,
        })))
        if (result.candidates.length === 0 && result.collections.length === 0) {
          failedURLs.push(url)
          setFeedback(t('downloads.analysisFailed'))
        }
        if (result.operationId) void window.promedia.downloads.dismiss(result.operationId)
      }
      urlsInput.value = failedURLs.join('\n')
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
      const runtimeStatuses = await Promise.all(requiredDownloadRuntimeIDsForProxyTest().map((runtimeId) => window.promedia.runtimes.status({ runtimeId })))
      if (runtimeStatuses.some((status) => status?.state !== 'ready')) {
        proxyFeedback.textContent = errorLabel('runtime-missing')
        proxyFeedback.className = 'download-field-help is-error'
        return
      }
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
      if (!item) return
      if (item.state === 'ready') {
        queue.splice(queue.indexOf(item), 1)
      } else if (item.state === 'fetching' || item.state === 'downloading') {
        if (item.operationId) window.promedia.downloads.cancel(item.operationId)
      } else {
        if (item.operationId) void window.promedia.downloads.dismiss(item.operationId)
        queue.splice(queue.indexOf(item), 1)
      }
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
    queue.forEach((item) => { if (item.state === 'ready' || item.state === 'error' || item.state === 'skipped' || item.state === 'cancelled') item.selected = next })
    renderQueue()
  }
  const handleClear = (): void => {
    for (const item of [...queue]) {
      if (item.state === 'fetching' || item.state === 'downloading') continue
      if (item.operationId) void window.promedia.downloads.dismiss(item.operationId)
      queue.splice(queue.indexOf(item), 1)
    }
    renderQueue()
  }
  const handleHistoryRefresh = (): void => { void refreshHistory() }
  const handleStart = (): void => { void startQueue() }
  const handleCancel = (): void => {
    if (activeOperationId) window.promedia.downloads.cancel(activeOperationId)
  }
  const handleSubChooserKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !subchooserRoot.hidden) closeSubChooser()
    if (event.key !== 'Tab' || subchooserRoot.hidden) return
    const focusable = [...subchooserModal.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
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
  subchooserRoot.addEventListener('keydown', handleSubChooserKeydown)
  authList.addEventListener('click', handleAuthClick)
  authList.addEventListener('change', handleAuthChange)
  historyRefresh.addEventListener('click', handleHistoryRefresh)
  urlsInput.addEventListener('input', handleURLsInput)

  async function refreshRuntime(): Promise<void> {
    const refreshVersion = ++runtimeRefreshVersion
    try {
      const statuses = await Promise.all(runtimeIDsForProbeInputs().map((runtimeId) => window.promedia.runtimes.status({ runtimeId })))
      if (disposed || refreshVersion !== runtimeRefreshVersion) return
      runtimeReady = statuses.length > 0 && statuses.every((status) => status?.state === 'ready')
      renderRuntime()
      renderControls()
    } catch {
      if (refreshVersion !== runtimeRefreshVersion) return
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
      for (const runtimeId of runtimeIDsForProbeInputs()) {
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

  async function refreshHistory(): Promise<void> {
    try {
      channelHistory = await window.promedia.downloads.history.list()
      if (!disposed) renderHistory()
    } catch {
      channelHistory = []
      if (!disposed) renderHistory()
    }
  }

  async function hydrateBackgroundOperations(): Promise<void> {
    try {
      const operations = await window.promedia.downloads.list()
      if (disposed) return
      for (const operation of operations) applyOperationStatus(operation)
      renderQueue()
    } catch {
      // Việc khôi phục trạng thái chỉ là cải thiện UX, không được chặn màn hình tải.
    }
  }

  function applyOperationStatus(operation: DownloadOperationStatus): void {
    if (operation.kind === 'probe') {
      if (operation.state === 'finished' && operation.probeResult?.ok) {
        appendCandidates(operation.probeResult.candidates)
        void window.promedia.downloads.dismiss(operation.operationId)
      } else if (operation.state === 'error' && !urlsInput.value.split(/\s+/).includes(operation.url)) {
        urlsInput.value = [urlsInput.value.trim(), operation.url].filter(Boolean).join('\n')
      }
      return
    }
    const active = operation.state === 'starting' || operation.state === 'running'
    const resultState: QueueState | null = operation.result?.status === 'done'
      ? 'done'
      : operation.result?.status === 'skipped'
        ? 'skipped'
        : operation.result?.status === 'cancelled'
          ? 'cancelled'
          : operation.result?.status === 'error'
            ? 'error'
            : null
    let item = queue.find((candidate) => candidate.operationId === operation.operationId)
      ?? queue.find((candidate) => candidate.candidate.url === operation.url && ['fetching', 'ready'].includes(candidate.state))
    if (!item && (active || resultState)) {
      const platform = operation.platform ?? platformForURL(operation.url) ?? 'youtube'
      item = {
        id: crypto.randomUUID(),
        candidate: {
          id: operation.operationId,
          url: operation.url,
          title: operation.displayTitle ?? operation.url,
          platform,
          uploader: null,
          durationSeconds: null,
          durationLabel: null,
          thumbnailURL: operation.thumbnailURL,
          webpageURL: operation.url,
          playlistTitle: null,
          formats: [],
          maxHeight: null,
        },
        selected: false,
        state: active ? 'fetching' : resultState!,
        progress: null,
        result: null,
        errorCode: null,
        operationId: operation.operationId,
      }
      queue.push(item)
    }
    if (!item) return
    item.operationId = operation.operationId
    item.progress = operation.progress
    item.result = operation.result
    item.errorCode = operation.result?.errorCode ?? null
    if (active) {
      item.state = 'fetching'
      if (operation.state === 'running') item.state = 'downloading'
      activeOperationId = operation.operationId
    } else if (resultState) {
      item.state = resultState
      if (activeOperationId === operation.operationId) activeOperationId = null
    }
  }

  function runtimeIDsForProbeInputs(): string[] {
    const platforms = new Set<DownloadPlatform>()
    for (const value of urlsInput.value.split(/\s+/).map((item) => item.trim()).filter(Boolean)) {
      const platform = platformForURL(value)
      if (platform) platforms.add(platform)
    }
    if (platforms.size === 0) platforms.add('youtube')
    const ids = new Set<string>()
    for (const platform of platforms) for (const runtimeId of requiredDownloadRuntimeIDsForProbe(platform)) ids.add(runtimeId)
    return [...ids]
  }

  async function ensureRuntimeForDownload(requests: readonly ReturnType<typeof buildDownloadRequest>[]): Promise<boolean> {
    if (requests.some((request) => request.engine === 'douyin') && isLinuxDouyinUnsupported()) {
      setFeedback(t('downloads.douyinUnsupported'))
      return false
    }
    const ids = new Set<string>()
    for (const request of requests) for (const runtimeId of requiredDownloadRuntimeIDsForDownload(request)) ids.add(runtimeId)
    if (ids.size === 0) return true
    installing = true
    renderRuntimeMessage(t('downloads.install'))
    try {
      for (const runtimeId of ids) {
        const status = await window.promedia.runtimes.status({ runtimeId })
        if (status?.state === 'ready') continue
        const result = await window.promedia.runtimes.install({ operationId: crypto.randomUUID(), runtimeId })
        if (result.status !== 'installed') {
          setFeedback(t('downloads.runtimeUnavailable'))
          return false
        }
      }
      runtimeReady = true
      return true
    } finally {
      installing = false
      await refreshRuntime()
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

  async function startQueue(itemsOverride?: readonly QueueItem[]): Promise<void> {
    if (!outputDir) {
      if (!outputDir) setFeedback(t('downloads.chooseFolder'))
      return
    }
    const items = [...(itemsOverride ?? queue.filter((item) => item.selected && ['ready', 'error', 'skipped', 'cancelled'].includes(item.state)))]
    if (items.length === 0) return
    setFeedback('')
    const requests = items.map((item) => buildRequest(item))
    if (!await ensureRuntimeForDownload(requests)) return
    if (disposed) return
    const result = await window.promedia.downloads.enqueue(requests)
    if (result.errorCode || result.acceptedOperationIDs.length !== requests.length) {
      setFeedback(errorLabel(result.errorCode ?? 'busy'))
      return
    }
    requests.forEach((request, index) => {
      const item = items[index]
      item.operationId = request.operationId
      item.state = 'fetching'
      item.progress = null
      item.errorCode = null
      item.result = null
    })
    renderQueue()
  }

  function buildRequest(item: QueueItem): ReturnType<typeof buildDownloadRequest> {
    const site = authSiteForPlatform(item.candidate.platform)
    const controls: DownloadControlState = {
      outputDir,
      useCookies: site ? useCookies.get(site) ?? false : false,
      proxy: proxyInput.value.trim() || null,
      ytDlp: {
        kind: kindInput.value as 'video' | 'audio',
        maxHeight: kindInput.value === 'video' ? (resolutionInput.value ? Number(resolutionInput.value) : null) : null,
        audioFormat: audioFormatInput.value as 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav',
        container: containerInput.value as 'mp4' | 'mkv' | 'webm',
        ensureH264: h264Input.checked,
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
      },
      douyin: {
        mode: douyinModeInput.value as 'all' | 'batch' | 'new',
        batchSize: Math.max(1, Number(douyinBatchInput.value) || 15),
        music: douyinMusicInput.checked,
        cover: douyinCoverInput.checked,
        avatar: douyinAvatarInput.checked,
        metadata: douyinMetadataInput.checked,
        folderPerVideo: douyinFolderInput.checked,
        ensureH264: douyinH264Input.checked,
      },
    }
    return buildDownloadRequest(item.candidate, controls, crypto.randomUUID())
  }

  function renderRuntime(): void {
    const douyinUnsupported = isLinuxDouyinUnsupported() && !douyinOptionGroup.hidden
    runtimeRoot.hidden = runtimeReady && !douyinUnsupported
    runtimeRoot.replaceChildren()
    const title = document.createElement('strong')
    title.textContent = douyinUnsupported
      ? t('downloads.douyinUnsupported')
      : runtimeReady ? t('downloads.runtimeReady') : t('downloads.runtimeMissing')
    const message = document.createElement('span')
    message.textContent = douyinUnsupported
      ? t('downloads.douyinUnsupported')
      : runtimeReady ? t('downloads.runtimeReady') : t('downloads.runtimeDescription')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'download-runtime-button'
    button.textContent = t('downloads.install')
    button.hidden = runtimeReady || douyinUnsupported
    button.disabled = installing || douyinUnsupported
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
    startButton.disabled = !outputDir || !queue.some((item) => item.selected && ['ready', 'error', 'skipped', 'cancelled'].includes(item.state))
    clearButton.disabled = false
    folderButton.disabled = false
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
    syncPlatformControls()
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

  function renderHistory(): void {
    historyList.replaceChildren()
    if (channelHistory.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'download-field-help'
      empty.textContent = t('downloads.historyEmpty')
      historyList.append(empty)
      return
    }
    for (const record of channelHistory) {
      const row = document.createElement('div')
      row.className = 'download-history-row'
      const info = document.createElement('div')
      info.className = 'download-history-info'
      const name = document.createElement('strong')
      name.textContent = record.name
      const meta = document.createElement('span')
      meta.className = 'download-field-help'
      meta.textContent = `${record.count} · ${new Date(record.lastRun).toLocaleString()}`
      info.append(name, meta)
      const actions = document.createElement('div')
      actions.className = 'download-action-row download-action-row-compact'
      const getNew = document.createElement('button')
      getNew.type = 'button'
      getNew.className = 'download-link-button'
      getNew.textContent = t('downloads.historyGetNew')
      getNew.addEventListener('click', () => {
        douyinModeInput.value = 'new'
        outputDir = record.outputDir
        folderValue.textContent = outputDir
        writeStored('promedia.download.outputDir', outputDir)
        const item: QueueItem = {
          id: crypto.randomUUID(),
          candidate: {
            id: record.url,
            url: record.url,
            title: record.name,
            platform: 'douyin',
            uploader: record.name,
            durationSeconds: null,
            durationLabel: null,
            thumbnailURL: null,
            webpageURL: record.url,
            playlistTitle: record.name,
            formats: [],
            maxHeight: null,
          },
          selected: true,
          state: 'ready',
          progress: null,
          result: null,
          errorCode: null,
          operationId: null,
        }
        queue.push(item)
        void startQueue([item])
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'download-link-button'
      remove.textContent = t('downloads.remove')
      remove.addEventListener('click', () => {
        void window.promedia.downloads.history.remove(record.url).then((records) => {
          channelHistory = records
          renderHistory()
        })
      })
      actions.append(getNew, remove)
      row.append(info, actions)
      historyList.append(row)
    }
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
            useCookies: authSiteForPlatform(item.candidate.platform) ? useCookies.get(authSiteForPlatform(item.candidate.platform)!) ?? false : false,
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
    if (item.progress && (item.progress.speed || item.progress.eta || item.progress.filePath)) {
      const progressMeta = document.createElement('span')
      progressMeta.className = 'download-queue-meta'
      progressMeta.textContent = [item.progress.speed, item.progress.eta ? t('downloads.eta', { value: item.progress.eta }) : null, item.progress.filePath].filter(Boolean).join(' · ')
      body.append(progressMeta)
    }
    if (item.progress?.detailCode) {
      const detail = document.createElement('span')
      detail.className = 'download-queue-meta'
      detail.textContent = progressDetailLabel(item.progress.detailCode)
      body.append(detail)
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

  function syncPlatformControls(): void {
    const platforms = new Set<DownloadPlatform>()
    for (const item of queue) if (item.selected) platforms.add(item.candidate.platform)
    for (const value of urlsInput.value.split(/\s+/).map((item) => item.trim()).filter(Boolean)) {
      const platform = platformForURL(value)
      if (platform) platforms.add(platform)
    }
    const showDouyin = platforms.has('douyin')
    const showYtDlp = platforms.size === 0 || [...platforms].some((platform) => platform !== 'douyin')
    for (const group of ytOptionGroups) group.hidden = !showYtDlp
    douyinOptionGroup.hidden = !showDouyin
    renderRuntime()
  }

  function isLinuxDouyinUnsupported(): boolean {
    return /Linux/i.test(window.navigator.userAgent)
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
    writeStored('promedia.download.h264', String(h264Input.checked))
    writeStored('promedia.download.archive', String(archiveInput.checked))
    writeStored('promedia.download.overwrite', String(overwriteInput.checked))
    writeStored('promedia.download.proxy', proxyInput.value)
    writeStored('promedia.download.douyinMode', douyinModeInput.value)
    writeStored('promedia.download.douyinBatch', douyinBatchInput.value)
    writeStored('promedia.download.douyinMusic', String(douyinMusicInput.checked))
    writeStored('promedia.download.douyinCover', String(douyinCoverInput.checked))
    writeStored('promedia.download.douyinAvatar', String(douyinAvatarInput.checked))
    writeStored('promedia.download.douyinMetadata', String(douyinMetadataInput.checked))
    writeStored('promedia.download.douyinFolder', String(douyinFolderInput.checked))
    writeStored('promedia.download.douyinH264', String(douyinH264Input.checked))
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
    restoreBoolean(h264Input, 'promedia.download.h264')
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
    restoreBoolean(douyinAvatarInput, 'promedia.download.douyinAvatar')
    restoreBoolean(douyinMetadataInput, 'promedia.download.douyinMetadata')
    restoreBoolean(douyinFolderInput, 'promedia.download.douyinFolder')
    restoreBoolean(douyinH264Input, 'promedia.download.douyinH264')
  }

  function setFeedback(message: string): void {
    if (!disposed) feedback.textContent = message
  }

  return () => {
    disposed = true
    operationListener()
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
    subchooserRoot.removeEventListener('keydown', handleSubChooserKeydown)
    authList.removeEventListener('click', handleAuthClick)
    authList.removeEventListener('change', handleAuthChange)
    historyRefresh.removeEventListener('click', handleHistoryRefresh)
    urlsInput.removeEventListener('input', handleURLsInput)
  }
}

function authSiteForURL(value: string): DownloadAuthSite | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
    if (hostname === 'douyin.com' || hostname.endsWith('.douyin.com') || hostname === 'iesdouyin.com' || hostname.endsWith('.iesdouyin.com')) return 'douyin'
    if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com') || hostname === 'fb.watch') return 'facebook'
    if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'tiktok'
  } catch {
    return null
  }
  return null
}

function platformLabel(platform: DownloadPlatform): string {
  const keys: Record<DownloadPlatform, 'downloads.platform.facebook' | 'downloads.platform.tiktok' | 'downloads.platform.douyin' | 'downloads.platform.youtube'> = {
    facebook: 'downloads.platform.facebook',
    tiktok: 'downloads.platform.tiktok',
    douyin: 'downloads.platform.douyin',
    youtube: 'downloads.platform.youtube',
  }
  return t(keys[platform])
}

function platformForURL(value: string): DownloadPlatform | null {
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

function authSiteForPlatform(platform: DownloadPlatform): DownloadAuthSite | null {
  return platform === 'youtube' ? null : platform
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

function progressDetailLabel(code: DownloadProgressDetailCode): string {
  const keys: Record<DownloadProgressDetailCode, string> = {
    preparing: 'downloads.detail.preparing',
    postprocessing: 'downloads.detail.postprocessing',
    'retry-without-cookies': 'downloads.detail.retryWithoutCookies',
    'retry-adaptive': 'downloads.detail.retryAdaptive',
    'retry-progressive': 'downloads.detail.retryProgressive',
    'retry-automatic-format': 'downloads.detail.retryAutomaticFormat',
    'conversion-h264': 'downloads.detail.conversionH264',
    'conversion-music': 'downloads.detail.conversionMusic',
    finished: 'downloads.detail.finished',
    cancelled: 'downloads.detail.cancelled',
    error: 'downloads.detail.error',
  }
  return t(keys[code] as never)
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
