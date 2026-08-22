import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'

import type { DownloadChannelRecord, DouyinMode } from '../../shared/download.ts'
import { detectDownloadPlatform } from './sites.ts'

export interface DownloadChannelSuccessInput {
  url: string
  name: string
  outputDir: string
  lastMode: DouyinMode
  addedItemCount: number
}

export class ChannelHistory {
  private readonly userDataRoot: string
  private readonly filePath: string
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(userDataRoot: string) {
    this.userDataRoot = userDataRoot
    this.filePath = join(userDataRoot, 'download-channel-history.json')
  }

  async list(): Promise<DownloadChannelRecord[]> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.flatMap((value) => {
        const record = normalizeRecord(value)
        return record ? [record] : []
      })
    } catch {
      return []
    }
  }

  async recordSuccess(input: DownloadChannelSuccessInput): Promise<DownloadChannelRecord> {
    return this.enqueueMutation(async () => {
      const current = (await this.list()).find((item) => item.url === input.url)
      const normalized = normalizeRecord({
        url: input.url,
        name: input.name,
        lastRun: new Date().toISOString(),
        count: (current?.count ?? 0) + Math.max(0, Number.isSafeInteger(input.addedItemCount) ? input.addedItemCount : 0),
        outputDir: input.outputDir,
        lastMode: input.lastMode,
      })
      if (!normalized) throw new Error('Invalid channel history success')
      const next = [normalized, ...(await this.list()).filter((item) => item.url !== normalized.url)]
      await this.write(next)
      return normalized
    })
  }

  async remove(url: string): Promise<DownloadChannelRecord[]> {
    return this.enqueueMutation(async () => {
      const next = (await this.list()).filter((item) => item.url !== url)
      await this.write(next)
      return next
    })
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation)
    this.mutationTail = result.then(() => undefined, () => undefined)
    return result
  }

  private async write(records: readonly DownloadChannelRecord[]): Promise<void> {
    await mkdir(this.userDataRoot, { recursive: true })
    const temporary = join(this.userDataRoot, `.download-channel-history-${randomUUID()}.tmp`)
    const backup = join(this.userDataRoot, `.download-channel-history-${randomUUID()}.backup`)
    await writeFile(temporary, JSON.stringify(records, null, 2), 'utf8')
    try {
      try {
        await rename(this.filePath, backup)
      } catch {
        // Lần đầu ghi file chưa có bản cũ để backup.
      }
      await rename(temporary, this.filePath)
      await rm(backup, { force: true })
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      try {
        await rename(backup, this.filePath)
      } catch {
        // Giữ lỗi gốc; lần ghi tiếp theo vẫn có thể tạo lại file lịch sử.
      }
      throw error
    }
  }
}

function normalizeRecord(value: unknown): DownloadChannelRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<DownloadChannelRecord>
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
  if (typeof candidate.name !== 'string' || typeof candidate.lastRun !== 'string') return null
  const outputDir = typeof candidate.outputDir === 'string' ? candidate.outputDir.trim() : ''
  if (!isValidHTTPSDouyinURL(url) || !Number.isFinite(new Date(candidate.lastRun).getTime()) || !isAbsolute(outputDir)) return null
  const count = candidate.count
  const lastMode = candidate.lastMode
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null
  if (!isDouyinMode(lastMode)) return null
  return {
    url,
    name: candidate.name.trim() || 'Douyin channel',
    lastRun: candidate.lastRun,
    count,
    outputDir,
    lastMode,
  }
}

function isValidHTTPSDouyinURL(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:' && detectDownloadPlatform(value) === 'douyin'
  } catch {
    return false
  }
}

function isDouyinMode(value: unknown): value is DouyinMode {
  return value === 'all' || value === 'batch' || value === 'new'
}
