import type { DownloadPlatform } from '../../shared/download.ts'

export function detectDownloadPlatform(value: string): DownloadPlatform | null {
  let hostname: string
  try {
    hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }

  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') {
    return 'youtube'
  }
  if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com') || hostname === 'fb.watch') {
    return 'facebook'
  }
  if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'tiktok'
  if (hostname === 'douyin.com' || hostname.endsWith('.douyin.com') || hostname === 'iesdouyin.com' || hostname.endsWith('.iesdouyin.com')) {
    return 'douyin'
  }
  return null
}

export function isSupportedDownloadURL(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && detectDownloadPlatform(value) !== null
  } catch {
    return false
  }
}
