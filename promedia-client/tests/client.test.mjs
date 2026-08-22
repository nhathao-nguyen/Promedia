import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

import { requestServerHealth } from '../src/main/server-health.ts'
import { validateArchiveEntries } from '../src/main/runtime/archive.ts'
import { findRuntime, parseAssetDigest, parseChecksum, selectReleaseArtifact } from '../src/main/runtime/catalog.ts'
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
import { buildDownloadFormatSelector, parseCandidates, parseProbeCollections } from '../src/main/download/engine.ts'
import { parseDouyinAweme, parseDouyinPageMetadata, probeDouyinURL } from '../src/main/download/douyin-api.ts'
import { buildDouyinConfig, readManifestDelta } from '../src/main/download/douyin-engine.ts'
import { DownloadJobStore } from '../src/main/download/job-store.ts'
import { ChannelHistory } from '../src/main/download/channel-history.ts'
import { replaceWithConvertedFile } from '../src/main/download/codec.ts'
import { buildDownloadRequest } from '../src/renderer/src/pages/download/request.ts'
import { mkdtemp, readFile, readdir, rename as realRename, rm, stat as realStat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  downloadAuthSites,
  isDownloadAuthSite,
  isDownloadProbeRequest,
  isDownloadRequest,
  isDownloadThumbnailRequest,
  requiredDownloadRuntimeIDsForDownload,
  requiredDownloadRuntimeIDsForProbe,
  requiredDownloadRuntimeIDsForProxyTest,
} from '../src/shared/download.ts'

class MemoryStorage {
  #values = new Map()

  getItem(key) {
    return this.#values.get(key) ?? null
  }

  setItem(key, value) {
    this.#values.set(key, value)
  }
}

function testCandidate(platform) {
  return {
    id: `${platform}-1`,
    url: platform === 'douyin'
      ? 'https://www.douyin.com/video/1'
      : `https://www.${platform}.com/video/1`,
    title: `${platform} title`,
    platform,
    uploader: 'creator',
    durationSeconds: 12,
    durationLabel: '0:12',
    thumbnailURL: 'https://example.com/thumb.jpg',
    webpageURL: platform === 'douyin'
      ? 'https://www.douyin.com/video/1'
      : `https://www.${platform}.com/video/1`,
    playlistTitle: 'Collection',
    formats: [],
    maxHeight: 1080,
  }
}

function testControls() {
  return {
    outputDir: 'C:\\Videos',
    useCookies: true,
    proxy: 'http://127.0.0.1:8080',
    ytDlp: {
      kind: 'video',
      maxHeight: 1080,
      audioFormat: 'mp3',
      container: 'mp4',
      ensureH264: true,
      outputTemplate: '%(title)s.%(ext)s',
      folderMode: 'playlist',
      writeSubtitles: true,
      autoSubtitles: false,
      subtitleLanguages: 'vi,en',
      embedSubtitles: false,
      embedThumbnail: true,
      embedMetadata: true,
      useArchive: true,
      forceOverwrite: false,
    },
    douyin: {
      mode: 'batch',
      batchSize: 15,
      music: true,
      cover: true,
      avatar: true,
      metadata: true,
      folderPerVideo: true,
      ensureH264: true,
    },
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

test('Douyin catalog is fail-closed on Linux until a platform entry exists', () => {
  const douyin = findRuntime('douyin-engine')
  assert.ok(douyin)
  assert.equal(douyin.platforms['linux-x64'], undefined)
  assert.equal(douyin.platforms['win32-x64'] !== undefined, true)
})

test('download auth is limited to Facebook, TikTok, and Douyin', () => {
  assert.deepEqual(downloadAuthSites, ['facebook', 'tiktok', 'douyin'])
  assert.equal(isDownloadAuthSite('facebook'), true)
  assert.equal(isDownloadAuthSite('tiktok'), true)
  assert.equal(isDownloadAuthSite('douyin'), true)
  assert.equal(isDownloadAuthSite('youtube'), false)
})

test('runtime requirements follow the selected action and request', () => {
  assert.deepEqual(requiredDownloadRuntimeIDsForProbe('youtube'), ['yt-dlp'])
  assert.deepEqual(requiredDownloadRuntimeIDsForProbe('facebook'), ['yt-dlp'])
  assert.deepEqual(requiredDownloadRuntimeIDsForProbe('tiktok'), ['yt-dlp'])
  assert.deepEqual(requiredDownloadRuntimeIDsForProbe('douyin'), ['douyin-engine'])
  assert.deepEqual(requiredDownloadRuntimeIDsForProxyTest(), ['yt-dlp'])

  const ytRequest = buildDownloadRequest({
    id: 'yt-1', url: 'https://www.youtube.com/watch?v=yt-1', title: 'YouTube',
    platform: 'youtube', uploader: null, durationSeconds: null, durationLabel: null,
    thumbnailURL: null, webpageURL: 'https://www.youtube.com/watch?v=yt-1', playlistTitle: null,
    formats: [], maxHeight: null,
  }, testControls(), 'download-yt')
  const douyinRequest = buildDownloadRequest({
    id: 'dy-1', url: 'https://www.douyin.com/video/1', title: 'Douyin',
    platform: 'douyin', uploader: null, durationSeconds: null, durationLabel: null,
    thumbnailURL: null, webpageURL: 'https://www.douyin.com/video/1', playlistTitle: null,
    formats: [], maxHeight: null,
  }, testControls(), 'download-dy')
  assert.deepEqual(requiredDownloadRuntimeIDsForDownload(ytRequest), ['yt-dlp', 'media-processing'])
  assert.deepEqual(requiredDownloadRuntimeIDsForDownload(douyinRequest), ['douyin-engine', 'media-processing'])
})

test('download request builders create engine-specific immutable snapshots', () => {
  const controls = testControls()
  const yt = buildDownloadRequest(testCandidate('youtube'), controls, 'download-yt')
  const douyin = buildDownloadRequest(testCandidate('douyin'), controls, 'download-dy')

  assert.equal(yt.engine, 'yt-dlp')
  assert.equal(douyin.engine, 'douyin')
  assert.equal('music' in yt.options, false)
  assert.equal('subtitleLanguages' in douyin.options, false)
  assert.equal('avatar' in douyin.options, true)

  controls.ytDlp.outputTemplate = 'changed-after-build'
  controls.douyin.batchSize = 99
  assert.equal(yt.options.outputTemplate, '%(title)s.%(ext)s')
  assert.equal(douyin.options.batchSize, 15)
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
  assert.equal(isDownloadThumbnailRequest({ thumbnailURL: 'file:///secret', sourceURL: 'https://www.youtube.com/watch?v=abc12345' }), false)
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
  const valid = buildDownloadRequest(testCandidate('youtube'), testControls(), 'download-1')
  assert.equal(isDownloadRequest(valid), true)
  assert.equal(isDownloadRequest({ ...valid, options: { ...valid.options, music: false } }), false)
  assert.equal(isDownloadRequest({ ...valid, engine: 'douyin' }), false)
  assert.equal(isDownloadRequest({ ...valid, url: 'http://youtu.be/abc' }), false)
  assert.equal(isDownloadRequest({ ...valid, operationId: '../bad' }), false)
  assert.equal(isDownloadRequest({ ...valid, outputDir: 'relative/path' }), false)
  assert.equal(isDownloadRequest({ ...valid, options: { ...valid.options, outputTemplate: 'nested/../escape' } }), false)
  assert.equal(isDownloadRequest({ ...valid, displayTitle: 'x'.repeat(501) }), false)
  assert.equal(isDownloadRequest({ ...valid, outputDir: `C:\\${'x'.repeat(4100)}` }), false)
  assert.equal(isDownloadRequest({ ...valid, options: { ...valid.options, subtitleLanguages: 'x'.repeat(257) } }), false)
  assert.equal(isDownloadRequest({ ...valid, options: { ...valid.options, ensureH264: 'yes' } }), false)
  assert.equal(isDownloadRequest({ ...valid, options: { ...valid.options, container: 'mp3' } }), false)
  assert.equal(isDownloadRequest({ ...valid, ['unexpected']: true }), false)

  const douyin = buildDownloadRequest(testCandidate('douyin'), testControls(), 'download-dy')
  assert.equal(isDownloadRequest(douyin), true)
  assert.equal(isDownloadRequest({ ...douyin, options: { ...douyin.options, kind: 'video' } }), false)
  assert.equal(isDownloadRequest({ ...douyin, options: { ...douyin.options, metadataEmbedding: true } }), false)
  assert.equal(isDownloadRequest({ ...douyin, options: { ...douyin.options, batchSize: 0 } }), false)
  assert.equal(isDownloadRequest({ ...douyin, options: { ...douyin.options, batchSize: 10001 } }), false)
  assert.equal(isDownloadRequest({ ...douyin, options: { ...douyin.options, batchSize: '15' } }), false)
})

test('Douyin page metadata preserves a title and cover when the lightweight API is blocked', () => {
  const metadata = parseDouyinPageMetadata('<meta property="og:title" content="A Douyin post"><meta property="og:image" content="https://p3-sign.douyinpic.com/cover.jpg">')
  assert.deepEqual(metadata, { title: 'A Douyin post', thumbnailURL: 'https://p3-sign.douyinpic.com/cover.jpg' })
})

test('download format selection keeps progressive fallback compatible with requested height', () => {
  assert.equal(buildDownloadFormatSelector({ kind: 'video', maxHeight: 1080 }, 'normal'), 'bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best')
  assert.equal(buildDownloadFormatSelector({ kind: 'video', maxHeight: 1080 }, 'adaptive'), 'bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best')
  assert.equal(buildDownloadFormatSelector({ kind: 'video', maxHeight: 720 }, 'progressive'), 'best[height<=720]/best')
  assert.equal(buildDownloadFormatSelector({ kind: 'video', maxHeight: 720 }, 'format'), 'bestvideo*+bestaudio/best')
  assert.equal(buildDownloadFormatSelector({ kind: 'audio', maxHeight: null }, 'normal'), 'bestaudio/best')
})

test('Douyin engine config maps channel mode and media options without hidden defaults', () => {
  const config = buildDouyinConfig({
    request: {
      operationId: 'douyin-1',
      url: 'https://www.douyin.com/user/creator',
      displayTitle: 'Creator',
      thumbnailURL: null,
      playlistTitle: null,
      outputDir: 'C:\\Videos',
      useCookies: false,
      proxy: null,
      platform: 'douyin',
      engine: 'douyin',
      options: { mode: 'new', batchSize: 20, music: false, cover: true, avatar: false, metadata: true, folderPerVideo: true, ensureH264: false },
    },
    cookies: { sessionid: 'redacted-in-test' },
    databasePath: 'C:\\Promedia\\douyin-library.db',
  })
  assert.deepEqual(config.number, { post: 0 })
  assert.deepEqual(config.increase, { post: true })
  assert.equal(config.cover, true)
  assert.equal(config.json, true)
  assert.equal(config.folderstyle, true)
  assert.equal(config.database, true)
})

function deferred() {
  let resolve
  const promise = new Promise((release) => { resolve = release })
  return { promise, resolve }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail('timed out waiting for the expected operation state')
}

test('background job store admits an atomic FIFO batch with immutable snapshots', async () => {
  const started = []
  const gates = new Map()
  const store = new DownloadJobStore({
    probe: async () => ({ ok: true, candidates: [], collections: [] }),
    start: async (request, signal) => {
      started.push(request.operationId)
      gates.set(request.operationId, deferred())
      await gates.get(request.operationId).promise
      return {
        operationId: request.operationId,
        status: signal.aborted ? 'cancelled' : 'done',
        files: [],
        primaryFile: null,
        addedItemCount: signal.aborted ? 0 : 1,
      }
    },
  })
  const first = buildDownloadRequest(testCandidate('youtube'), testControls(), 'fifo-1')
  const second = buildDownloadRequest(testCandidate('facebook'), testControls(), 'fifo-2')
  const accepted = store.enqueue([first, second])
  assert.deepEqual(accepted, { acceptedOperationIDs: ['fifo-1', 'fifo-2'] })
  second.options.outputTemplate = 'changed-after-admission'
  await waitFor(() => started.length === 1)
  assert.deepEqual(started, ['fifo-1'])
  const overCapacity = Array.from({ length: 99 }, (_, index) => buildDownloadRequest(testCandidate('tiktok'), testControls(), `fifo-capacity-${index}`))
  assert.deepEqual(store.enqueue(overCapacity), { acceptedOperationIDs: [], errorCode: 'busy' })
  assert.equal(store.list().filter((item) => item.operationId.startsWith('fifo-capacity-')).length, 0)
  gates.get('fifo-1').resolve()
  await waitFor(() => started.length === 2)
  assert.deepEqual(started, ['fifo-1', 'fifo-2'])
  assert.equal(store.list().find((item) => item.operationId === 'fifo-2')?.state, 'running')
  gates.get('fifo-2').resolve()
  await waitFor(() => store.list().every((item) => item.state === 'finished'))
  await store.dispose()
})

test('background job store cancels queued and active work and dismisses only terminal operations', async () => {
  const activeGate = deferred()
  const started = []
  const store = new DownloadJobStore({
    probe: async () => ({ ok: true, candidates: [], collections: [] }),
    start: async (request, signal) => {
      started.push(request.operationId)
      if (request.operationId === 'cancel-active') {
        await activeGate.promise
      }
      return {
        operationId: request.operationId,
        status: signal.aborted ? 'cancelled' : 'done',
        files: [],
        primaryFile: null,
        addedItemCount: signal.aborted ? 0 : 1,
      }
    },
  })
  const active = buildDownloadRequest(testCandidate('youtube'), testControls(), 'cancel-active')
  const queued = buildDownloadRequest(testCandidate('tiktok'), testControls(), 'cancel-queued')
  store.enqueue([active, queued])
  await waitFor(() => store.list().find((item) => item.operationId === 'cancel-active')?.state === 'running')
  assert.equal(store.cancel('cancel-queued'), true)
  assert.equal(store.cancel('cancel-queued'), false)
  assert.equal(store.list().find((item) => item.operationId === 'cancel-queued')?.state, 'cancelled')
  assert.equal(store.dismiss('cancel-active'), false)
  assert.equal(store.cancel('cancel-active'), true)
  activeGate.resolve()
  await waitFor(() => store.list().find((item) => item.operationId === 'cancel-active')?.state === 'cancelled')
  assert.deepEqual(started, ['cancel-active'])
  assert.equal(store.dismiss('cancel-active'), true)
  assert.equal(store.list().some((item) => item.operationId === 'cancel-active'), false)
  assert.equal(store.dismiss('cancel-active'), false)
  await store.dispose()
})

test('background job store survives listener removal and restores operation snapshots', async () => {
  const gate = deferred()
  const store = new DownloadJobStore({
    probe: async () => ({ ok: true, candidates: [], collections: [] }),
    start: async (request) => {
      await gate.promise
      return { operationId: request.operationId, status: 'done', files: [], primaryFile: null, addedItemCount: 1 }
    },
  })
  const events = []
  const unsubscribe = store.subscribe((status) => events.push(status))
  store.enqueue([buildDownloadRequest(testCandidate('youtube'), testControls(), 'restore-1')])
  await waitFor(() => store.list()[0]?.state === 'running')
  unsubscribe()
  gate.resolve()
  await waitFor(() => store.list()[0]?.state === 'finished')
  const restored = []
  const removeRestored = store.subscribe((status) => restored.push(status))
  assert.equal(store.list()[0].state, 'finished')
  assert.equal(events.some((status) => status.state === 'finished'), false)
  assert.equal(restored.length, 0)
  removeRestored()
  await store.dispose()
})

test('background job store rejects new work and settles active and queued work on shutdown', async () => {
  const gate = deferred()
  const store = new DownloadJobStore({
    probe: async () => ({ ok: true, candidates: [], collections: [] }),
    start: async (request, signal) => {
      await gate.promise
      return { operationId: request.operationId, status: signal.aborted ? 'cancelled' : 'done', files: [], primaryFile: null, addedItemCount: signal.aborted ? 0 : 1 }
    },
  })
  store.enqueue([
    buildDownloadRequest(testCandidate('youtube'), testControls(), 'shutdown-1'),
    buildDownloadRequest(testCandidate('youtube'), testControls(), 'shutdown-2'),
  ])
  await waitFor(() => store.list().find((item) => item.operationId === 'shutdown-1')?.state === 'running')
  const disposing = store.dispose()
  assert.deepEqual(store.enqueue([buildDownloadRequest(testCandidate('youtube'), testControls(), 'shutdown-3')]), { acceptedOperationIDs: [], errorCode: 'busy' })
  gate.resolve()
  await disposing
  assert.equal(store.list().find((item) => item.operationId === 'shutdown-1')?.state, 'cancelled')
  assert.equal(store.list().find((item) => item.operationId === 'shutdown-2')?.state, 'cancelled')
})

test('background job store keeps probe work alive and restores its terminal result', async () => {
  let releaseProbe
  const probeGate = new Promise((resolve) => { releaseProbe = resolve })
  const store = new DownloadJobStore({
    probe: async () => {
      await probeGate
      return {
        ok: true,
        platform: 'youtube',
        candidates: [{
          id: 'video-1',
          url: 'https://www.youtube.com/watch?v=video-1',
          title: 'Video 1',
          platform: 'youtube',
          uploader: 'Creator',
          durationSeconds: 10,
          durationLabel: '0:10',
          thumbnailURL: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          webpageURL: 'https://www.youtube.com/watch?v=video-1',
          playlistTitle: null,
          formats: [],
          maxHeight: 1080,
        }],
        collections: [],
      }
    },
    start: async () => ({ operationId: 'unused', status: 'done', files: [], primaryFile: null }),
  })

  const pending = store.probe('probe-1', { url: 'https://www.youtube.com/watch?v=video-1' })
  assert.equal(store.list()[0].state, 'running')
  const unsubscribe = store.subscribe(() => undefined)
  unsubscribe()
  releaseProbe()

  const result = await pending
  assert.equal(result.ok, true)
  assert.equal(store.list()[0].probeResult?.candidates[0].title, 'Video 1')
  await store.dispose()
})

test('background job store caps probes at four and returns typed busy without admission', async () => {
  const gate = deferred()
  const started = []
  const store = new DownloadJobStore({
    probe: async (_request, signal) => {
      started.push(true)
      await gate.promise
      return { ok: !signal.aborted, candidates: [], collections: [] }
    },
    start: async () => ({ operationId: 'unused', status: 'done', files: [], primaryFile: null, addedItemCount: 1 }),
  })
  const requests = Array.from({ length: 5 }, (_, index) => store.probe(`probe-cap-${index}`, {
    url: `https://www.youtube.com/watch?v=probe-cap-${index}`,
    useCookies: false,
  }))
  await waitFor(() => started.length === 4)
  assert.deepEqual(await requests[4], { ok: false, candidates: [], collections: [], errorCode: 'busy' })
  gate.resolve()
  const results = await Promise.all(requests.slice(0, 4))
  assert.equal(results.every((result) => result.ok), true)
  assert.equal(store.list().some((operation) => operation.operationId === 'probe-cap-4'), false)
  await store.dispose()
})

test('Douyin manifest delta counts items independently from generated files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'promedia-manifest-delta-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const video = join(root, 'video.mp4')
  const cover = join(root, 'cover.jpg')
  const music = join(root, 'music.mp3')
  const metadata = join(root, 'video.json')
  await Promise.all([
    writeFile(video, 'video', 'utf8'),
    writeFile(cover, 'cover', 'utf8'),
    writeFile(music, 'music', 'utf8'),
    writeFile(metadata, '{}', 'utf8'),
  ])
  const manifest = join(root, 'download_manifest.jsonl')
  const prefix = '{"aweme_id":"old","file_names":["old.mp4"]}\n'
  const delta = JSON.stringify({
    aweme_id: 'item-1',
    file_names: ['video.mp4', 'cover.jpg', 'music.mp3', 'video.json'],
  }) + '\n' + JSON.stringify({
    aweme_id: 'item-1',
    file_names: ['video.mp4', 'cover.jpg'],
  }) + '\n'
  await writeFile(manifest, prefix + delta, 'utf8')
  const result = await readManifestDelta(manifest, Buffer.byteLength(prefix), root)
  assert.equal(result.addedItemCount, 1)
  assert.equal(result.files.length, 4)
  assert.deepEqual(new Set(result.files), new Set([video, cover, music, metadata]))
})

test('channel history serializes cumulative item counts independently from sidecar files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'promedia-channel-history-concurrent-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const history = new ChannelHistory(root)
  await history.recordSuccess({
    url: 'https://www.douyin.com/user/creator',
    name: 'Creator',
    outputDir: 'C:\\Videos',
    lastMode: 'all',
    addedItemCount: 3,
  })
  await Promise.all([
    history.recordSuccess({
      url: 'https://www.douyin.com/user/creator',
      name: 'Creator batch',
      outputDir: 'C:\\Videos',
      lastMode: 'batch',
      addedItemCount: 2,
      files: ['video.mp4', 'cover.jpg', 'music.mp3', 'video.json'],
    }),
    history.recordSuccess({
      url: 'https://www.douyin.com/user/creator',
      name: 'Creator new',
      outputDir: 'C:\\Videos',
      lastMode: 'new',
      addedItemCount: 1,
      files: ['video.mp4', 'cover.jpg', 'music.mp3', 'video.json'],
    }),
  ])
  const record = (await history.list())[0]
  assert.equal(record.count, 6)
  assert.equal(record.lastMode, 'new')
  assert.equal(record.name, 'Creator new')
})

test('channel history ignores persisted records outside the HTTPS Douyin contract', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'promedia-channel-history-invalid-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'download-channel-history.json'), JSON.stringify([
    {
      url: 'https://www.douyin.com/user/valid',
      name: 'Valid creator',
      lastRun: '2026-08-22T00:00:00.000Z',
      count: 1,
      outputDir: 'C:\\Videos',
      lastMode: 'new',
    },
    {
      url: 'http://www.douyin.com/user/insecure',
      name: 'Insecure creator',
      lastRun: '2026-08-22T00:00:00.000Z',
      count: 1,
      outputDir: 'C:\\Videos',
      lastMode: 'new',
    },
    {
      url: 'https://www.youtube.com/watch?v=not-douyin',
      name: 'Wrong platform',
      lastRun: '2026-08-22T00:00:00.000Z',
      count: 1,
      outputDir: 'C:\\Videos',
      lastMode: 'new',
    },
    {
      url: 'https://www.douyin.com/user/bad-date',
      name: 'Bad date',
      lastRun: 'not-a-date',
      count: 1,
      outputDir: 'C:\\Videos',
      lastMode: 'new',
    },
    {
      url: 'https://www.douyin.com/user/relative-path',
      name: 'Relative path',
      lastRun: '2026-08-22T00:00:00.000Z',
      count: 1,
      outputDir: 'relative/output',
      lastMode: 'new',
    },
  ]), 'utf8')

  assert.deepEqual(await new ChannelHistory(root).list(), [{
    url: 'https://www.douyin.com/user/valid',
    name: 'Valid creator',
    lastRun: '2026-08-22T00:00:00.000Z',
    count: 1,
    outputDir: 'C:\\Videos',
    lastMode: 'new',
  }])
})

test('H.264 replacement keeps the source recoverable until the converted file is installed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'promedia-codec-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const original = join(root, 'clip.mkv')
  const converted = join(root, 'converted.mp4')
  await writeFile(original, 'source', 'utf8')
  await writeFile(converted, 'converted', 'utf8')
  await replaceWithConvertedFile(original, converted)
  assert.equal(await readFile(join(root, 'clip.mp4'), 'utf8'), 'converted')
  const failedOriginal = join(root, 'failed.mkv')
  await writeFile(failedOriginal, 'keep', 'utf8')
  await assert.rejects(() => replaceWithConvertedFile(failedOriginal, join(root, 'missing.mp4')))
  assert.equal(await readFile(failedOriginal, 'utf8'), 'keep')
  assert.equal(await readFile(join(root, 'clip.mp4'), 'utf8'), 'converted')
})

test('H.264 replacement preserves a pre-existing target and rejects empty conversion output', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'promedia-codec-target-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const original = join(root, 'clip.mkv')
  const target = join(root, 'clip.mp4')
  const converted = join(root, 'converted.mp4')
  await writeFile(original, 'source', 'utf8')
  await writeFile(target, 'old-target', 'utf8')
  await writeFile(converted, 'new-target', 'utf8')
  await replaceWithConvertedFile(original, converted)
  assert.equal(await readFile(target, 'utf8'), 'new-target')
  await assert.rejects(() => replaceWithConvertedFile(target, join(root, 'missing.mp4')))
  assert.equal(await readFile(target, 'utf8'), 'new-target')

  const secondOriginal = join(root, 'second.mkv')
  const secondTarget = join(root, 'second.mp4')
  const emptyConverted = join(root, 'empty.mp4')
  await writeFile(secondOriginal, 'second-source', 'utf8')
  await writeFile(secondTarget, 'second-target', 'utf8')
  await writeFile(emptyConverted, '', 'utf8')
  await assert.rejects(() => replaceWithConvertedFile(secondOriginal, emptyConverted))
  assert.equal(await readFile(secondOriginal, 'utf8'), 'second-source')
  assert.equal(await readFile(secondTarget, 'utf8'), 'second-target')
})

test('H.264 replacement restores the pre-existing target when target backup fails', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'promedia-codec-rollback-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const original = join(root, 'clip.mkv')
  const target = join(root, 'clip.mp4')
  const converted = join(root, 'converted.mp4')
  await writeFile(original, 'source', 'utf8')
  await writeFile(target, 'old-target', 'utf8')
  await writeFile(converted, 'converted', 'utf8')

  const operations = {
    rename: async (source, destination) => {
      if (source === target) throw new Error('simulated target backup failure')
      return realRename(source, destination)
    },
    rm,
    stat: realStat,
  }

  await assert.rejects(
    () => replaceWithConvertedFile(original, converted, operations),
    /simulated target backup failure/,
  )
  assert.equal(await readFile(original, 'utf8'), 'source')
  assert.equal(await readFile(target, 'utf8'), 'old-target')
  await assert.rejects(() => readFile(converted, 'utf8'))
  assert.deepEqual((await readdir(root)).filter((name) => name.endsWith('.bak')), [])
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
