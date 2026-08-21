import { languagePanel, setupLanguageSettings } from './language'
import { serverConnectionPanel, setupServerConnection } from './server-connection'

export function settingsPage(): string {
  return `
    <main class="app-main min-w-0 flex-1">
      <div class="page-container settings-container mx-auto">
        ${languagePanel()}
        ${serverConnectionPanel()}
      </div>
    </main>
  `
}

export function setupSettings(root: HTMLDivElement): () => void {
  const cleanups = [setupLanguageSettings(root), setupServerConnection(root)]

  return () => {
    cleanups.forEach((cleanup) => cleanup())
  }
}
