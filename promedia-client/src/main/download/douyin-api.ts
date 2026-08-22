import type { DownloadCandidate, DownloadFormat } from '../../shared/download.ts'
import { DownloadEngineError } from './engine.ts'

const douyinOrigin = 'https://www.douyin.com'
const detailEndpoint = `${douyinOrigin}/aweme/v1/web/aweme/detail/`
const maximumResponseBytes = 16 * 1_024 * 1_024

export async function probeDouyinURL(
  url: string,
  cookies: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<readonly DownloadCandidate[]> {
  const videoID = extractVideoID(url)
  if (videoID) {
    try {
      const payload = await fetchJSON(detailEndpoint, { aweme_id: videoID, aid: '6383' }, cookies, signal)
      const candidate = parseDouyinAweme(payload.aweme_detail, null)
      if (candidate) return [candidate]
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new DOMException('Cancelled', 'AbortError')
      }
      // Bộ engine bên ngoài vẫn có luồng ký URL và có thể tải dù API probe nhẹ bị chặn.
    }
    const metadata = await fetchDouyinPageMetadata(url, cookies, signal)
    return [fallbackCandidate(url, metadata?.title ?? null, metadata?.thumbnailURL ?? null)]
  }

  const secUserID = extractSecUserID(url)
  if (secUserID) {
    // Giữ URL kênh nguyên vẹn để dy-engine thực hiện đúng number/increase/database.
    return [fallbackCandidate(url, `Douyin channel ${secUserID}`)]
  }
  if (isEngineHandledURL(url)) return [fallbackCandidate(url)]
  throw new DownloadEngineError('unsupported-platform')
}

export function parseDouyinAweme(value: unknown, playlistTitle: string | null): DownloadCandidate | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.aweme_id) ?? stringValue(value.awemeId)
  const video = isRecord(value.video) ? value.video : null
  const gallery = hasGallerySource(value)
  if (!id || (!video && !gallery) || (video && !hasVideoSource(video) && !gallery)) return null

  const author = isRecord(value.author) ? value.author : null
  const uploader = stringValue(author?.nickname) ?? stringValue(author?.unique_id)
  const title = stringValue(value.desc) ?? id
  const durationMilliseconds = numberValue(video?.duration)
  const height = numberValue(video?.height)
  const cover = firstHTTPSURL(video?.cover) ?? firstHTTPSURL(video?.origin_cover) ?? firstGalleryURL(value)
  const isGallery = !video || !hasVideoSource(video)
  const url = isGallery ? `${douyinOrigin}/note/${id}` : `${douyinOrigin}/video/${id}`
  const formats: DownloadFormat[] = isGallery
    ? [{ id: 'douyin-gallery', ext: 'jpg', height: null, fps: null, videoCodec: null, audioCodec: null, sizeBytes: null }]
    : [{
        id: 'douyin-video',
        ext: 'mp4',
        height,
        fps: numberValue(video?.fps),
        videoCodec: null,
        audioCodec: null,
        sizeBytes: null,
      }]

  return {
    id,
    url,
    title,
    platform: 'douyin',
    uploader,
    durationSeconds: durationMilliseconds === null ? null : durationMilliseconds / 1_000,
    durationLabel: formatDuration(durationMilliseconds === null ? null : durationMilliseconds / 1_000),
    thumbnailURL: cover,
    webpageURL: url,
    playlistTitle: playlistTitle ?? uploader,
    formats,
    maxHeight: isGallery ? null : height,
  }
}

function fallbackCandidate(
  url: string,
  titleOverride: string | null = null,
  thumbnailURL: string | null = null,
): DownloadCandidate {
  let title = titleOverride ?? url
  try {
    const parsed = new URL(url)
    title = parsed.pathname.replace(/^\/+/, '') || parsed.hostname
  } catch {
    // URL đã được kiểm tra ở service boundary; giữ nguyên chuỗi nếu parser không đọc được.
  }
  return {
    id: url,
    url,
    title,
    platform: 'douyin',
    uploader: null,
    durationSeconds: null,
    durationLabel: null,
    thumbnailURL,
    webpageURL: url,
    playlistTitle: null,
    formats: [],
    maxHeight: null,
  }
}

export function parseDouyinPageMetadata(html: string): { title: string | null; thumbnailURL: string | null } {
 const title = readDouyinMetaContent(html, ['og:title', 'twitter:title'])
   ?? readDouyinTitle(html)
 const thumbnailURL = firstHTTPSURL(
   readDouyinMetaContent(html, ['og:image', 'twitter:image', 'twitter:image:src']),
 )
  return {
    title: title ? decodeHTML(title).replace(/\s+/g, ' ').trim().slice(0, 500) || null : null,
    thumbnailURL,
  }
}

async function fetchDouyinPageMetadata(
  url: string,
  cookies: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<{ title: string | null; thumbnailURL: string | null } | null> {
  const headers: Record<string, string> = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    referer: `${douyinOrigin}/`,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  }
  const cookiesValue = cookieHeader(cookies)
  if (cookiesValue) headers.cookie = cookiesValue
  try {
    const response = await fetch(url, { headers, signal })
    if (!response.ok) return null
    const length = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(length) && length > maximumResponseBytes) return null
    const text = await response.text()
    if (text.length > maximumResponseBytes) return null
    return parseDouyinPageMetadata(text)
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new DOMException('Cancelled', 'AbortError')
    }
    return null
  }
}

function readDouyinMetaContent(html: string, names: readonly string[]): string | null {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    if (!name || !wanted.has(name)) continue
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]
    if (content) return content
  }
  return null
}

function readDouyinTitle(html: string): string | null {
  return /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null
}

function decodeHTML(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function cookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .filter(([name, value]) => name && value && !name.includes(';') && !value.includes('\n'))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

async function fetchJSON(
  endpoint: string,
  params: Readonly<Record<string, string>>,
  cookies: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const requestURL = new URL(endpoint)
  for (const [key, value] of Object.entries(params)) requestURL.searchParams.set(key, value)
  const headers: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    referer: `${douyinOrigin}/`,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  }
  const cookieHeader = Object.entries(cookies)
    .filter(([name, value]) => name && value && !name.includes(';') && !value.includes('\n'))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
  if (cookieHeader) headers.cookie = cookieHeader

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response
    try {
      response = await fetch(requestURL, { headers, signal })
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new DOMException('Cancelled', 'AbortError')
      }
      throw new DownloadEngineError('network')
    }
    if (response.status === 403 && attempt < 2) {
      await delay(350 * (attempt + 1), signal)
      continue
    }
    if (!response.ok) throw classifyAPIError(response.status)
    const length = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(length) && length > maximumResponseBytes) throw new DownloadEngineError('output-failed')

    let text: string
    try {
      text = await response.text()
    } catch {
      throw new DownloadEngineError('network')
    }
    if (text.length > maximumResponseBytes) throw new DownloadEngineError('output-failed')
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      if (attempt < 2) {
        await delay(350 * (attempt + 1), signal)
        continue
      }
      throw new DownloadEngineError('output-failed')
    }
    if (!isRecord(value)) throw new DownloadEngineError('output-failed')
    const statusCode = numberValue(value.status_code)
    if (statusCode !== null && statusCode !== 0) {
      const message = `${stringValue(value.status_msg) ?? ''} ${stringValue(value.message) ?? ''}`
      if (/login|sign.?in|cookie|auth|permission|private/i.test(message)) throw new DownloadEngineError('authentication-required')
      if (/rate|limit|频繁|请求/i.test(message)) throw new DownloadEngineError('rate-limited')
      throw new DownloadEngineError('output-failed')
    }
    return value
  }
  throw new DownloadEngineError('output-failed')
}

function classifyAPIError(status: number): DownloadEngineError {
  if (status === 401 || status === 403) return new DownloadEngineError('authentication-required')
  if (status === 429) return new DownloadEngineError('rate-limited')
  if (status >= 500) return new DownloadEngineError('network')
  return new DownloadEngineError('output-failed')
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function extractSecUserID(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/user\/([^/]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

function extractVideoID(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/(?:video|note)\/(\d+)/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function isEngineHandledURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.toLowerCase()
    return parsed.hostname.startsWith('v.')
      || /\/(?:user|collection|mix|music|live|follow\/live)\//i.test(path)
      || /\/(?:note|gallery|slides)\//i.test(path)
  } catch {
    return false
  }
}

function hasVideoSource(value: Record<string, unknown>): boolean {
  const playAddress = isRecord(value.play_addr) ? value.play_addr : null
  const downloadAddress = isRecord(value.download_addr) ? value.download_addr : null
  return (Array.isArray(playAddress?.url_list) && playAddress.url_list.length > 0)
    || (Array.isArray(downloadAddress?.url_list) && downloadAddress.url_list.length > 0)
}

function hasGallerySource(value: Record<string, unknown>): boolean {
  const imagePost = isRecord(value.image_post_info) ? value.image_post_info : null
  const collections = [imagePost?.images, imagePost?.image_list, value.images, value.image_list]
  return collections.some((items) => Array.isArray(items) && items.some((item) => isRecord(item)))
}

function firstGalleryURL(value: Record<string, unknown>): string | null {
  const imagePost = isRecord(value.image_post_info) ? value.image_post_info : null
  const collections = [imagePost?.images, imagePost?.image_list, value.images, value.image_list]
  for (const items of collections) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!isRecord(item)) continue
      for (const field of ['download_url', 'download_addr', 'display_image', 'origin_image']) {
        const candidate = firstHTTPSURL(item[field])
        if (candidate) return candidate
      }
    }
  }
  return null
}

function firstHTTPSURL(value: unknown): string | null {
  const urls = typeof value === 'string'
    ? [value]
    : isRecord(value) && Array.isArray(value.url_list)
      ? value.url_list
      : isRecord(value) && typeof value.url === 'string'
        ? [value.url]
        : []
  for (const item of urls) {
    if (typeof item !== 'string') continue
    try {
      if (new URL(item).protocol === 'https:') return item
    } catch {
      continue
    }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatDuration(value: number | null): string | null {
  if (value === null) return null
  const total = Math.max(0, Math.round(value))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}
