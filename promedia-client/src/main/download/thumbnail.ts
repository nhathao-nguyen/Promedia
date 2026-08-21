const maximumThumbnailBytes = 2 * 1_024 * 1_024
const allowedImageTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])
const allowedThumbnailDomains = [
  'ytimg.com',
  'youtube.com',
  'googleusercontent.com',
  'ggpht.com',
  'douyinpic.com',
  'douyinvod.com',
  'douyin.com',
  'snssdk.com',
  'amemv.com',
  'tiktokcdn.com',
  'tiktok.com',
  'ibytedtos.com',
  'byteimg.com',
  'muscdn.com',
  'fbcdn.net',
  'facebook.com',
  'fbsbx.com',
]

export async function fetchThumbnailDataURL(
  thumbnailURL: string,
  sourceURL: string,
  cookies: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<string | null> {
  const imageURL = safeHTTPSURL(thumbnailURL)
  const source = safeHTTPSURL(sourceURL)
  if (!imageURL || !source || !isAllowedThumbnailHost(new URL(imageURL).hostname)) return null

  const headers: Record<string, string> = {
    accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    referer: `${new URL(source).origin}/`,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  }
  const cookieHeader = Object.entries(cookies)
    .filter(([name, value]) => name && value && !name.includes(';') && !value.includes('\n'))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
  if (cookieHeader) headers.cookie = cookieHeader

  let response: Response
  try {
    response = await fetch(imageURL, { headers, signal })
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new DOMException('Cancelled', 'AbortError')
    }
    return null
  }
  if (!response.ok || !isAllowedThumbnailHost(new URL(response.url).hostname)) return null
  const contentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].toLowerCase()
  const length = Number(response.headers.get('content-length') ?? 0)
  if (!allowedImageTypes.has(contentType) || (Number.isFinite(length) && length > maximumThumbnailBytes)) return null

  let bytes: ArrayBuffer
  try {
    bytes = await response.arrayBuffer()
  } catch {
    return null
  }
  if (bytes.byteLength === 0 || bytes.byteLength > maximumThumbnailBytes) return null
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
}

function safeHTTPSURL(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function isAllowedThumbnailHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return allowedThumbnailDomains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`))
}
