import type {
  DownloadCandidate,
  DownloadRequest,
  DouyinDownloadOptions,
  YtDlpDownloadOptions,
} from '../../../../shared/download.ts'

export interface DownloadControlState {
  outputDir: string
  useCookies: boolean
  proxy: string | null
  ytDlp: YtDlpDownloadOptions
  douyin: DouyinDownloadOptions
}

export function buildDownloadRequest(
  candidate: DownloadCandidate,
  controls: DownloadControlState,
  operationId: string,
): DownloadRequest {
  const base = {
    operationId,
    url: candidate.url,
    displayTitle: candidate.title,
    thumbnailURL: candidate.thumbnailURL,
    playlistTitle: candidate.playlistTitle,
    outputDir: controls.outputDir,
    useCookies: controls.useCookies,
    proxy: controls.proxy,
  }

  if (candidate.platform === 'douyin') {
    return {
      ...base,
      platform: 'douyin',
      engine: 'douyin',
      options: { ...controls.douyin },
    }
  }

  return {
    ...base,
    platform: candidate.platform,
    engine: 'yt-dlp',
    options: { ...controls.ytDlp },
  }
}
