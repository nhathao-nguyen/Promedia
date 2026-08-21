import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { registerServerHealthIPC } from './server-health-ipc'
import { registerRuntimeIPC } from './runtime-ipc'

function createWindow(): void {
  const rendererFile = join(__dirname, '../renderer/index.html')
  const rendererURL = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererFile).toString()
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    icon: process.platform === 'win32' ? windowIconPath() : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
    },
  })
  window.setMenuBarVisibility(false)

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.on('will-navigate', (event, targetURL) => {
    if (!isAllowedRendererNavigation(targetURL, rendererURL)) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(rendererFile)
  }
}

function windowIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'promedia.ico')
    : join(app.getAppPath(), 'build', 'promedia.ico')
}

app.whenReady().then(() => {
  const disposeServerHealthIPC = registerServerHealthIPC()
  const disposeRuntimeIPC = registerRuntimeIPC(join(app.getPath('userData'), 'runtimes'))
  app.once('before-quit', () => {
    disposeRuntimeIPC()
    disposeServerHealthIPC()
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

function isAllowedRendererNavigation(target: string, entry: string): boolean {
  try {
    const targetURL = new URL(target)
    const entryURL = new URL(entry)
    if (entryURL.protocol === 'file:') return targetURL.toString() === entryURL.toString()
    return targetURL.origin === entryURL.origin
  } catch {
    return false
  }
}
