import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

import { requestServerHealth } from '../src/main/server-health.ts'
import { validateArchiveEntries } from '../src/main/runtime/archive.ts'
import { parseChecksum, selectReleaseArtifact } from '../src/main/runtime/catalog.ts'
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

test('runtime checksum parsing requires an exact artifact name', () => {
  const digest = 'a'.repeat(64)
  const document = `${digest}  ffmpeg-n10.0-latest-win64-lgpl-10.0.zip\n`
  assert.equal(parseChecksum(document, 'ffmpeg-n10.0-latest-win64-lgpl-10.0.zip'), digest)
  assert.equal(parseChecksum(document, 'ffmpeg-n10.0-latest-win64-lgpl-10.0.zip.exe'), null)
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
