import type {
  DownloadEnqueueResult,
  DownloadOperationStatus,
  DownloadProbeRequest,
  DownloadProbeResult,
  DownloadProgress,
  DownloadRequest,
  DownloadResult,
} from '../../shared/download.ts'

export interface DownloadJobRunner {
  probe(request: DownloadProbeRequest, signal: AbortSignal): Promise<DownloadProbeResult>
  start(
    request: DownloadRequest,
    signal: AbortSignal,
    report: (progress: DownloadProgress) => void,
  ): Promise<DownloadResult>
}

interface Operation {
  status: DownloadOperationStatus
  request?: DownloadRequest
  controller: AbortController
  promise: Promise<DownloadProbeResult | DownloadResult>
  settle: (result: DownloadProbeResult | DownloadResult) => void
  terminal: boolean
}

type StatusListener = (status: DownloadOperationStatus) => void

const maximumConcurrentProbes = 4
const maximumAdmittedDownloads = 100
const maximumRetainedOperations = 100

export class DownloadJobStore {
  private readonly runner: DownloadJobRunner
  private readonly operations = new Map<string, Operation>()
  private readonly listeners = new Set<StatusListener>()
  private readonly activeProbeIDs = new Set<string>()
  private readonly downloadQueue: string[] = []
  private readonly completionOrder: string[] = []
  private activeDownloadID: string | null = null
  private disposed = false

  constructor(runner: DownloadJobRunner) {
    this.runner = runner
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  list(): DownloadOperationStatus[] {
    return [...this.operations.values()].map((operation) => cloneStatus(operation.status))
  }

  probe(operationId: string, request: DownloadProbeRequest): Promise<DownloadProbeResult> {
    const existing = this.operations.get(operationId)
    if (existing) return existing.promise as Promise<DownloadProbeResult>
    if (this.disposed || this.activeProbeIDs.size >= maximumConcurrentProbes) {
      return Promise.resolve({ ok: false, candidates: [], collections: [], errorCode: 'busy' })
    }

    const operation = this.createOperation({
      operationId,
      kind: 'probe',
      url: request.url,
      displayTitle: null,
      thumbnailURL: null,
      platform: null,
      state: 'starting',
      progress: null,
      probeResult: null,
      result: null,
    })
    this.operations.set(operationId, operation)
    this.activeProbeIDs.add(operationId)
    this.publish(operation.status)
    operation.promise = this.runProbe(operation, { ...request })
    return operation.promise as Promise<DownloadProbeResult>
  }

  enqueue(requests: readonly DownloadRequest[]): DownloadEnqueueResult {
    if (this.disposed || requests.length === 0) return { acceptedOperationIDs: [], ...(this.disposed ? { errorCode: 'busy' as const } : {}) }
    const operationIDs = new Set<string>()
    const existingDownloads = this.downloadQueue.length + (this.activeDownloadID ? 1 : 0)
    if (requests.length > maximumAdmittedDownloads || existingDownloads + requests.length > maximumAdmittedDownloads) {
      return { acceptedOperationIDs: [], errorCode: 'busy' }
    }
    for (const request of requests) {
      if (operationIDs.has(request.operationId) || this.operations.has(request.operationId)) {
        return { acceptedOperationIDs: [], errorCode: 'invalid-request' }
      }
      operationIDs.add(request.operationId)
    }

    const acceptedOperationIDs: string[] = []
    for (const request of requests) {
      const snapshot = cloneRequest(request)
      const operation = this.createOperation({
        operationId: snapshot.operationId,
        kind: 'download',
        url: snapshot.url,
        displayTitle: snapshot.displayTitle,
        thumbnailURL: snapshot.thumbnailURL,
        platform: snapshot.platform,
        state: 'starting',
        progress: null,
        probeResult: null,
        result: null,
      })
      this.operations.set(snapshot.operationId, operation)
      operation.request = snapshot
      this.downloadQueue.push(snapshot.operationId)
      acceptedOperationIDs.push(snapshot.operationId)
      this.publish(operation.status)
    }
    this.pump()
    return { acceptedOperationIDs }
  }

  cancel(operationId: string): boolean {
    const operation = this.operations.get(operationId)
    if (!operation || operation.terminal) return false

    if (operation.status.kind === 'download' && this.activeDownloadID !== operationId) {
      const queueIndex = this.downloadQueue.indexOf(operationId)
      if (queueIndex >= 0) {
        this.downloadQueue.splice(queueIndex, 1)
        this.complete(operation, cancelledResult(operationId))
        this.pump()
        return true
      }
    }
    operation.controller.abort()
    return true
  }

  dismiss(operationId: string): boolean {
    const operation = this.operations.get(operationId)
    if (!operation || !operation.terminal) return false
    this.operations.delete(operationId)
    const index = this.completionOrder.indexOf(operationId)
    if (index >= 0) this.completionOrder.splice(index, 1)
    return true
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const operationId of [...this.downloadQueue]) {
      const operation = this.operations.get(operationId)
      if (operation && !operation.terminal) this.complete(operation, cancelledResult(operationId))
    }
    this.downloadQueue.length = 0
    for (const operation of this.operations.values()) {
      if (!operation.terminal) operation.controller.abort()
    }
    await Promise.allSettled([...this.operations.values()].map((operation) => operation.promise))
    this.listeners.clear()
  }

  private createOperation(status: DownloadOperationStatus): Operation {
    let settle!: (result: DownloadProbeResult | DownloadResult) => void
    const promise = new Promise<DownloadProbeResult | DownloadResult>((resolve) => { settle = resolve })
    return {
      status,
      controller: new AbortController(),
      promise,
      settle,
      terminal: false,
    }
  }

  private async runProbe(operation: Operation, request: DownloadProbeRequest): Promise<DownloadProbeResult> {
    operation.status.state = 'running'
    this.publish(operation.status)
    let result: DownloadProbeResult
    try {
      result = await this.runner.probe(request, operation.controller.signal)
    } catch {
      result = {
        ok: false,
        candidates: [],
        collections: [],
        errorCode: operation.controller.signal.aborted ? 'cancelled' : 'unknown',
      }
    }
    operation.status.probeResult = result
    operation.status.platform = result.platform ?? operation.status.platform
    this.activeProbeIDs.delete(operation.status.operationId)
    this.complete(operation, result)
    return result
  }

  private async runDownload(operation: Operation, request: DownloadRequest): Promise<void> {
    operation.status.state = 'running'
    this.publish(operation.status)
    let result: DownloadResult
    try {
      result = await this.runner.start(request, operation.controller.signal, (progress) => {
        if (operation.terminal) return
        operation.status.progress = { ...progress }
        this.publish(operation.status)
      })
    } catch {
      result = operation.controller.signal.aborted
        ? cancelledResult(operation.status.operationId)
        : errorResult(operation.status.operationId)
    }
    this.complete(operation, result)
    if (this.activeDownloadID === operation.status.operationId) this.activeDownloadID = null
    this.pump()
  }

  private complete(operation: Operation, result: DownloadProbeResult | DownloadResult): void {
    if (operation.terminal) return
    operation.terminal = true
    if ('status' in result) {
      operation.status.result = result
      operation.status.state = result.status === 'cancelled'
        ? 'cancelled'
        : result.status === 'error'
          ? 'error'
          : 'finished'
    } else {
      operation.status.probeResult = result
      operation.status.state = result.ok ? 'finished' : result.errorCode === 'cancelled' ? 'cancelled' : 'error'
    }
    this.completionOrder.push(operation.status.operationId)
    operation.settle(result)
    this.publish(operation.status)
    this.pruneTerminalOperations()
  }

  private pump(): void {
    if (this.disposed || this.activeDownloadID !== null) return
    const operationId = this.downloadQueue.shift()
    if (!operationId) return
    const operation = this.operations.get(operationId)
    if (!operation || operation.terminal) {
      this.pump()
      return
    }
    this.activeDownloadID = operationId
    const request = operationRequest(operation)
    void this.runDownload(operation, request)
  }

  private publish(status: DownloadOperationStatus): void {
    const snapshot = cloneStatus(status)
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // Một renderer lỗi không được làm gián đoạn tiến trình nền.
      }
    }
  }

  private pruneTerminalOperations(): void {
    while (this.completionOrder.length > maximumRetainedOperations) {
      const operationId = this.completionOrder.shift()
      if (!operationId) continue
      const operation = this.operations.get(operationId)
      if (operation?.terminal) this.operations.delete(operationId)
    }
  }
}

function operationRequest(operation: Operation): DownloadRequest {
  if (!operation.request) throw new Error('Download operation request is missing')
  return operation.request
}

function cloneRequest(request: DownloadRequest): DownloadRequest {
  return request.engine === 'douyin'
    ? { ...request, options: { ...request.options } }
    : { ...request, options: { ...request.options } }
}

function cloneStatus(status: DownloadOperationStatus): DownloadOperationStatus {
  return {
    ...status,
    progress: status.progress ? { ...status.progress } : null,
    probeResult: status.probeResult
      ? {
          ...status.probeResult,
          candidates: status.probeResult.candidates.map((candidate) => ({ ...candidate, formats: candidate.formats.map((format) => ({ ...format })) })),
          collections: status.probeResult.collections.map((collection) => ({ ...collection })),
        }
      : null,
    result: status.result ? { ...status.result, files: [...status.result.files] } : null,
  }
}

function cancelledResult(operationId: string): DownloadResult {
  return { operationId, status: 'cancelled', files: [], primaryFile: null, addedItemCount: 0, errorCode: 'cancelled' }
}

function errorResult(operationId: string): DownloadResult {
  return { operationId, status: 'error', files: [], primaryFile: null, addedItemCount: 0, errorCode: 'unknown' }
}
