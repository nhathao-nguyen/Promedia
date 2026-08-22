import { app, BrowserWindow, session as electronSession } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  DownloadAuthEvent,
  DownloadAuthSite,
  DownloadAuthStatus,
} from '../../shared/download.ts'
import { downloadAuthSites } from '../../shared/download.ts'

interface SiteConfig {
  domain: string
  loginURL: string
  markers: readonly string[]
}

const siteConfigs: Readonly<Record<DownloadAuthSite, SiteConfig>> = {
  facebook: { domain: 'facebook.com', loginURL: 'https://www.facebook.com/', markers: ['c_user', 'xs'] },
  tiktok: { domain: 'tiktok.com', loginURL: 'https://www.tiktok.com/', markers: ['sessionid'] },
  douyin: { domain: 'douyin.com', loginURL: 'https://www.douyin.com/', markers: ['sessionid'] },
}

export class DownloadAuthService {
  private readonly windows = new Set<BrowserWindow>()

  constructor(private readonly userDataRoot: string) {}

  async statuses(): Promise<DownloadAuthStatus[]> {
    return Promise.all(downloadAuthSites.map((site) => this.status(site)))
  }

  async status(site: DownloadAuthSite): Promise<DownloadAuthStatus> {
    const config = siteConfigs[site]
    const path = this.cookiePath(site)
    if (!existsSync(path)) return { site, hasCookies: false, cookieCount: 0, loggedIn: false }
    try {
      const [metadata, fileStat] = await Promise.all([readFile(path, 'utf8'), stat(path)])
      if (fileStat.size === 0) return { site, hasCookies: false, cookieCount: 0, loggedIn: false }
      const names = new Set(metadata.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t')[5]).filter(Boolean))
      return {
        site,
        hasCookies: names.size > 0,
        cookieCount: names.size,
        loggedIn: config.markers.every((marker) => names.has(marker)),
      }
    } catch {
      return { site, hasCookies: false, cookieCount: 0, loggedIn: false }
    }
  }

  async login(site: DownloadAuthSite, emit: (event: DownloadAuthEvent) => void): Promise<DownloadAuthStatus> {
    const config = siteConfigs[site]
    await mkdir(this.cookieDirectory(), { recursive: true })
    const partition = `persist:promedia-download-${site}`
    const browserSession = electronSession.fromPartition(partition)
    const window = new BrowserWindow({
      width: 1_000,
      height: 720,
      title: `Đăng nhập ${site}`,
      autoHideMenuBar: true,
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    this.windows.add(window)
    window.webContents.setWindowOpenHandler(() => ({ action: 'allow' }))
    emit({ site, phase: 'launching' })
    window.webContents.once('did-finish-load', () => emit({ site, phase: 'ready' }))
    await window.loadURL(config.loginURL).catch(() => undefined)

    return new Promise<DownloadAuthStatus>((resolve) => {
      window.once('closed', () => {
        this.windows.delete(window)
        void this.saveCookies(site, browserSession.cookies.get({}), emit).then(resolve)
      })
    })
  }

  async clear(site: DownloadAuthSite): Promise<void> {
    await rm(this.cookiePath(site), { force: true })
    await electronSession.fromPartition(`persist:promedia-download-${site}`).clearStorageData({ storages: ['cookies'] }).catch(() => undefined)
  }

  cookieFile(site: DownloadAuthSite): string | null {
    return existsSync(this.cookiePath(site)) ? this.cookiePath(site) : null
  }

  async cookies(site: DownloadAuthSite): Promise<Readonly<Record<string, string>>> {
    const path = this.cookiePath(site)
    if (!existsSync(path)) return {}
    try {
      const values: Record<string, string> = {}
      const lines = (await readFile(path, 'utf8')).split(/\r?\n/)
      for (const line of lines) {
        if (!line || line.startsWith('#')) continue
        const fields = line.split('\t')
        const name = fields[5]
        const value = fields.slice(6).join('\t')
        if (name && value) values[name] = value
      }
      return values
    } catch {
      return {}
    }
  }

  dispose(): void {
    for (const window of this.windows) {
      if (!window.isDestroyed()) window.close()
    }
    this.windows.clear()
  }

  private async saveCookies(
    site: DownloadAuthSite,
    cookiesPromise: Promise<Electron.Cookie[]>,
    emit: (event: DownloadAuthEvent) => void,
  ): Promise<DownloadAuthStatus> {
    try {
      const config = siteConfigs[site]
      const cookies = (await cookiesPromise).filter((cookie) => {
        const domain = (cookie.domain ?? '').replace(/^\./, '').toLowerCase()
        return domain === config.domain || domain.endsWith(`.${config.domain}`)
      })
      const active = cookies.filter((cookie) => !cookie.expirationDate || cookie.expirationDate > Date.now() / 1_000)
      await writeFile(this.cookiePath(site), toNetscape(active), 'utf8')
      const status = await this.status(site)
      emit({ site, phase: status.loggedIn ? 'saved' : 'error' })
      return status
    } catch {
      emit({ site, phase: 'error' })
      return { site, hasCookies: false, cookieCount: 0, loggedIn: false }
    }
  }

  private cookieDirectory(): string {
    return join(this.userDataRoot, 'download-cookies')
  }

  private cookiePath(site: DownloadAuthSite): string {
    return join(this.cookieDirectory(), `${site}.txt`)
  }
}

function toNetscape(cookies: readonly Electron.Cookie[]): string {
  const lines = ['# Netscape HTTP Cookie File']
  for (const cookie of cookies) {
    const domain = cookie.domain ?? ''
    const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE'
    const path = cookie.path || '/'
    const secure = cookie.secure ? 'TRUE' : 'FALSE'
    const expiry = cookie.expirationDate ? String(Math.floor(cookie.expirationDate)) : '0'
    lines.push([domain, includeSubdomains, path, secure, expiry, cookie.name, cookie.value].join('\t'))
  }
  return `${lines.join('\n')}\n`
}
