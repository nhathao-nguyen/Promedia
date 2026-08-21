import { t } from '../i18n'
import { routeDetails, type Route } from '../routes'

export function header(route: Route): string {
  return `
    <header class="app-header flex shrink-0 items-center">
      <h1 class="page-title">${t(routeDetails[route].labelKey)}</h1>
    </header>
  `
}
