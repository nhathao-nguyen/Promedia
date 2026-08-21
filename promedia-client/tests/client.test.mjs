import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

import { requestServerHealth } from '../src/main/server-health.ts'
import { validateArchiveEntries } from '../src/main/runtime/archive.ts'
import { parseAssetDigest, parseChecksum, selectReleaseArtifact } from '../src/main/runtime/catalog.ts'
import {
  runtimeInstallFailureCode,
  RuntimeInstallError,
} from '../src/main/runtime/service.ts'
import {
  loadServerConfig,
  normalizeServerURL,
  saveServerURL,
} from '../src/renderer/src/server/config.ts'
import {
  isRuntimeInstallRequest,
  isRuntimeStatusRequest,
} from '../src/shared/runtime.ts'
import { detectDownloadPlatform, isSupportedDownloadURL } from '../src/main/download/sites.ts'
import { parseCandidates, parseProbeCollections } from '../src/main/download/engine.ts'
import { parseDouyinAweme, probeDouyinURL } from '../src/main/download/douyin-api.ts'
import { isDownloadProbeRequest, isDownloadRequest, isDownloadThumbnailRequest } from '../src/shared/download.ts'

class MemoryStorage {
  #values = new Map()

  getItem(key) {
    return this.#values.get(key) ?? null
  }

  setItem(key, value) {
    this.#values.set(key, value)
  }
}

test('server URL normalization accepts LAN addresses and rejects unsafe URL parts', () => {
  assert.equal(normalizeServerURL('192.168.1.20:8080'), 'http://192.168.1.20:8080')
  assert.equal(normalizeServerURL('https://SERVER.local:8443/'), 'https://server.local:8443')
  assert.equal(normalizeServerURL('https://user:secret@server.local'), null)
  assert.equal(normalizeServerURL('file:///tmp/server'), null)
})

test('verified server URL storage overrides the environment on the next load', () => {
  const storage = new MemoryStorage()
  const environment = {
    VITE_API_URL: 'http://localhost:8080',
    VITE_API_TIMEOUT_MS: '5000',
  }

  assert.equal(saveServerURL('192.168.1.20:8080', storage), true)
  assert.deepEqual(loadServerConfig(environment, storage), {
    baseURL: 'http://192.168.1.20:8080',
    timeoutMs: 5000,
  })
  assert.equal(saveServerURL('file:///tmp/server', storage), false)
})

test('server configuration works without build-time environment values', () => {
  assert.deepEqual(loadServerConfig({}, new MemoryStorage()), {
    baseURL: '',
    timeoutMs: 5000,
  })
  assert.deepEqual(loadServerConfig({ VITE_API_TIMEOUT_MS: 'invalid' }, new MemoryStorage()), {
    baseURL: '',
    timeoutMs: 5000,
  })
})

test('runtime catalog selects the newest matching stable artifact dynamically', () => {
  const assets = [
    { name: 'ffmpeg-n8.1-latest-win64-lgpl-8.1.zip', size: 120, browser_download_url: 'https://github.com/v8' },
    { name: 'ffmpeg-n10.0-latest-win64-lgpl-10.0.zip', size: 140, browser_download_url: 'https://github.com/v10' },
    { name: 'ffmpeg-master-latest-win64-lgpl.zip', size: 150, browser_download_url: 'https://github.com/master' },
    { name: 'ffmpeg-n10.0-latest-win64-gpl-10.0.zip', size: 150, browser_download_url: 'https://github.com/gpl' },
  ]

  assert.deepEqual(selectReleaseArtifact(
    assets,
    '^ffmpeg-n(?<version>\\d+(?:\\.\\d+)*)-latest-win64-lgpl-(?<compatibilityVersion>\\d+(?:\\.\\d+)*)\\.zip$',
    'version',
    'compatibilityVersion',
  ), {
    asset: assets[1],
    version: '10.0',
  })
})

test('runtime catalog can bind a single-file tool to the release tag', () => {
  const asset = { name: 'yt-dlp.exe', size: 100, browser_download_url: 'https://github.com/yt-dlp.exe' }
  const checksum = { name: 'SHA2-256SUMS', size: 50, browser_download_url: 'https://github.com/SHA2-256SUMS' }
  assert.deepEqual(selectReleaseArtifact(
    [checksum, asset],
    '^yt-dlp\\.exe$',
    'release',
    undefined,
    '2026.08.19',
  ), { asset, version: '2026.08.19' })
})

test('runtime checksum parsing requires an exact artifact name', () => {
  const digest = 'a'.repeat(64)
  const document = `${digest}  ffmpeg-n10.0-latest-win64-lgpl-10.0.zip\n`
  assert.equal(parseChecksum(document, 'ffmpeg-n10.0-latest-win64-lgpl-10.0.zip'), digest)
  assert.equal(parseChecksum(document, 'ffmpeg-n10.0-latest-win64-lgpl-10.0.zip.exe'), null)
})

test('runtime catalog accepts a verified GitHub asset digest', () => {
  const digest = 'b'.repeat(64)
  assert.equal(parseAssetDigest(`sha256:${digest}`), digest)
  assert.equal(parseAssetDigest(`sha512:${digest}`), null)
})

test('runtime archive validation rejects traversal and absolute paths', () => {
  assert.doesNotThrow(() => validateArchiveEntries(['release/bin/ffmpeg.exe', 'release/bin/ffprobe.exe']))
  assert.throws(() => validateArchiveEntries(['release/../../outside.exe']))
  assert.throws(() => validateArchiveEntries(['C:\\outside.exe']))
  assert.throws(() => validateArchiveEntries(['/outside']))
})

test('runtime IPC request validators accept only declared IDs and operation IDs', () => {
  assert.equal(isRuntimeStatusRequest({ runtimeId: 'media-processing' }), true)
  assert.equal(isRuntimeStatusRequest({ runtimeId: '../media-processing' }), false)
  assert.equal(isRuntimeInstallRequest({ runtimeId: 'media-processing', operationId: 'install-123' }), true)
  assert.equal(isRuntimeInstallRequest({ runtimeId: 'media-processing', operationId: '' }), false)
})

test('runtime failures are reduced to safe actionable renderer codes', () => {
  assert.equal(runtimeInstallFailureCode(new RuntimeInstallError('checksum-mismatch')), 'checksum-mismatch')
  assert.equal(runtimeInstallFailureCode(new RuntimeInstallError('probe-failed')), 'invalid-runtime')
  assert.equal(runtimeInstallFailureCode(Object.assign(new Error('disk'), { code: 'ENOSPC' })), 'insufficient-space')
  assert.equal(runtimeInstallFailureCode(new DOMException('timeout', 'TimeoutError')), 'network')
  assert.equal(runtimeInstallFailureCode(new Error('sensitive raw message')), 'unknown')
})

test('download platform routing accepts only the four requested hosts', () => {
  assert.equal(detectDownloadPlatform('https://www.youtube.com/watch?v=abc'), 'youtube')
  assert.equal(detectDownloadPlatform('https://www.tiktok.com/@user/video/1'), 'tiktok')
  assert.equal(detectDownloadPlatform('https://www.facebook.com/reel/1'), 'facebook')
  assert.equal(detectDownloadPlatform('https://www.douyin.com/video/1'), 'douyin')
  assert.equal(detectDownloadPlatform('https://notfacebook.com/video/1'), null)
  assert.equal(isSupportedDownloadURL('https://youtu.be/abc'), true)
  assert.equal(isSupportedDownloadURL('file:///tmp/video.mp4'), false)
})

test('download probe accepts an explicit cookie choice without widening the request', () => {
  assert.equal(isDownloadProbeRequest({ url: 'https://www.douyin.com/user/abc', useCookies: true }), true)
  assert.equal(isDownloadProbeRequest({ url: 'https://www.douyin.com/user/abc', useCookies: false }), true)
  assert.equal(isDownloadProbeRequest({ url: 'https://www.douyin.com/user/abc', useCookies: 'yes' }), false)
  assert.equal(isDownloadThumbnailRequest({
    thumbnailURL: 'https://i.ytimg.com/vi/abc12345/hqdefault.jpg',
    sourceURL: 'https://www.youtube.com/watch?v=abc12345',
    useCookies: false,
  }), true)
  assert.equal(isDownloadThumbnailRequest({ thumbnailURL: 'file:///secret', sourceURL: 'https://www.youtube.com/watch?v=abc12345' }), true)
})

test('Douyin channel parsing returns only video posts with thumbnail metadata', () => {
  const candidate = parseDouyinAweme({
    aweme_id: '7667077061483985256',
    desc: 'A cat video',
    author: { nickname: 'Creator' },
    video: {
      duration: 10_000,
      height: 1920,
      fps: 30,
      play_addr: { url_list: ['https://example.com/video.mp4'] },
      cover: { url_list: ['https://example.com/cover.jpg'] },
    },
  }, 'Creator')
  assert.equal(candidate?.id, '7667077061483985256')
  assert.equal(candidate?.title, 'A cat video')
  assert.equal(candidate?.thumbnailURL, 'https://example.com/cover.jpg')
  assert.equal(candidate?.durationSeconds, 10)
  assert.equal(parseDouyinAweme({ aweme_id: 'image-only', image_post_info: {} }, null), null)
})

test('Douyin cover parsing accepts a direct HTTPS cover URL', () => {
  const candidate = parseDouyinAweme({
    aweme_id: 'plain-cover',
    desc: 'Plain cover',
    video: {
      play_addr: { url_list: ['https://example.com/video.mp4'] },
      cover: 'https://example.com/plain-cover.jpg',
    },
  }, null)
  assert.equal(candidate?.thumbnailURL, 'https://example.com/plain-cover.jpg')
})

test('Douyin gallery parsing exposes a note candidate for the external engine', () => {
  const candidate = parseDouyinAweme({
    aweme_id: 'gallery-123',
    desc: 'A photo note',
    image_post_info: {
      images: [
        { display_image: { url_list: ['https://example.com/gallery-cover.jpg'] } },
        { display_image: { url_list: ['https://example.com/gallery-2.jpg'] } },
      ],
    },
  }, null)
  assert.equal(candidate?.url, 'https://www.douyin.com/note/gallery-123')
  assert.equal(candidate?.formats[0]?.id, 'douyin-gallery')
  assert.equal(candidate?.thumbnailURL, 'https://example.com/gallery-cover.jpg')
  assert.equal(candidate?.maxHeight, null)
})

test('Douyin channel probing preserves the channel URL for engine modes', async () => {
  const url = 'https://www.douyin.com/user/MS4wLjABAAAAdR6jQo_RhENFIeUHiYbyB7iy6U4PSwY0hkW2HJnXeaQ'
  const candidates = await probeDouyinURL(url, {}, new AbortController().signal)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].url, url)
  assert.equal(candidates[0].id, url)
})

test('playlist parsing expands entries and supplies a safe YouTube thumbnail fallback', () => {
  const candidates = parseCandidates({
    _type: 'playlist',
    title: 'Playlist',
    entries: [
      { id: 'abc12345', title: 'First', webpage_url: 'https://www.youtube.com/watch?v=abc12345' },
      { id: 'def67890', title: 'Second', webpage_url: 'https://www.youtube.com/watch?v=def67890' },
    ],
  }, 'https://www.youtube.com/playlist?list=demo', 'youtube')
  assert.equal(candidates.length, 2)
  assert.equal(candidates[0].title, 'First')
  assert.equal(candidates[0].thumbnailURL, 'https://i.ytimg.com/vi/abc12345/hqdefault.jpg')
  assert.equal(candidates[1].playlistTitle, 'Playlist')
})

test('playlist parsing does not expose YouTube channel tabs as downloadable videos', () => {
  const candidates = parseCandidates({
    _type: 'playlist',
    title: 'Channel',
    entries: [
      { _type: 'playlist', id: 'channel', title: 'Channel - Videos', webpage_url: 'https://www.youtube.com/@channel/videos' },
      { _type: 'playlist', id: 'channel', title: 'Channel - Shorts', webpage_url: 'https://www.youtube.com/@channel/shorts' },
      { _type: 'url', id: 'video123', title: 'A video', url: 'https://www.youtube.com/watch?v=video123' },
      { _type: 'url', id: 'short123', title: 'A short', thumbnails: [{ url: 'https://i.ytimg.com/vi/short123/oar2.jpg' }], url: 'https://www.youtube.com/shorts/short123' },
    ],
  }, 'https://www.youtube.com/@channel', 'youtube')
  assert.deepEqual(candidates.map((candidate) => candidate.id), ['video123', 'short123'])
  assert.equal(candidates[1].thumbnailURL, 'https://i.ytimg.com/vi/short123/oar2.jpg')
})

test('playlist probing exposes YouTube channel tabs as bounded subcollections', () => {
  const collections = parseProbeCollections({
    _type: 'playlist',
    entries: [
      { _type: 'playlist', id: 'channel', title: 'Channel - Videos', webpage_url: 'https://www.youtube.com/@channel/videos', playlist_count: 42 },
      { _type: 'playlist', id: 'channel', title: 'Channel - Shorts', webpage_url: 'https://www.youtube.com/@channel/shorts', playlist_count: 7 },
      { _type: 'url', id: 'video123', title: 'A video', url: 'https://www.youtube.com/watch?v=video123' },
    ],
  }, 'https://www.youtube.com/@channel')
  assert.deepEqual(collections.map((collection) => collection.title), ['Channel - Videos', 'Channel - Shorts'])
  assert.deepEqual(collections.map((collection) => collection.count), [42, 7])
})


test('download request validation keeps the IPC shape narrow', () => {
  assert.equal(isDownloadRequest({
    operationId: 'download-1',
    url: 'https://youtu.be/abc',
    kind: 'video',
    outputDir: 'C:\\Videos',
    outputTemplate: '%(title)s.%(ext)s',
    douyin: { mode: 'all', batchSize: 15, music: false, cover: true, metadata: true, folderPerVideo: false },
  }), true)
  assert.equal(isDownloadRequest({ operationId: '../bad', url: 'https://youtu.be/abc', kind: 'video' }), false)
})

test('health check reaches a real HTTP server and validates its payload', async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ status: 'ok' }))
  })
  const baseURL = await listen(server)
  t.after(() => server.close())

  const result = await requestServerHealth({
    requestId: 'success-request',
    baseURL,
    timeoutMs: 1_000,
  }, new AbortController().signal)

  assert.deepEqual(result, {
    requestId: 'success-request',
    status: 'connected',
    baseURL,
  })
})

test('health check rejects a structurally invalid server response', async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ status: 'unexpected' }))
  })
  const baseURL = await listen(server)
  t.after(() => server.close())

  const result = await requestServerHealth({
    requestId: 'invalid-response-request',
    baseURL,
    timeoutMs: 1_000,
  }, new AbortController().signal)

  assert.equal(result.status, 'invalid-response')
})

test('health check classifies malformed JSON as an invalid response', async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end('{not-json')
  })
  const baseURL = await listen(server)
  t.after(() => server.close())

  const result = await requestServerHealth({
    requestId: 'malformed-json-request',
    baseURL,
    timeoutMs: 1_000,
  }, new AbortController().signal)

  assert.equal(result.status, 'invalid-response')
})

test('health check reports cancellation and closes the real request', async (t) => {
  const server = createServer(() => {})
  const baseURL = await listen(server)
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })

  const controller = new AbortController()
  const pendingResult = requestServerHealth({
    requestId: 'cancelled-request',
    baseURL,
    timeoutMs: 1_000,
  }, controller.signal)
  setTimeout(() => controller.abort(), 20)

  assert.equal((await pendingResult).status, 'cancelled')
})

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, 'object')
  return `http://127.0.0.1:${address.port}`
}
