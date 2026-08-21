import type { Route } from '../routes'
import { dashboardPage } from './dashboard/page'
import { librariesPage, setupLibraries } from './libraries/page'
import { settingsPage, setupSettings } from './settings/page'

export type PageView = {
  markup: string
  setup: (root: HTMLDivElement) => () => void
}

export function renderPage(route: Route): PageView {
  if (route === 'libraries') {
    return {
      markup: librariesPage(),
      setup: setupLibraries,
    }
  }

  if (route === 'settings') {
    return {
      markup: settingsPage(),
      setup: setupSettings,
    }
  }

  return {
    markup: dashboardPage(),
    setup: emptyPageSetup,
  }
}

function emptyPageSetup(): () => void {
  return () => {}
}
