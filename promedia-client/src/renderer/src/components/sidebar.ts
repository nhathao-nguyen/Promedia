import { primaryRoutes, routeDetails, type Route } from '../routes'
import { t } from '../i18n'
import logoUrl from '../assets/branding/promedia-logo.png'

type SidebarIcon = 'dashboard' | 'libraries' | 'settings'

export function sidebar(activeRoute: Route): string {
  return `
    <aside class="app-sidebar flex shrink-0 flex-col">
      <a class="app-brand flex items-center" href="#/dashboard" data-route="dashboard" aria-label="${t('navigation.dashboardAria')}">
        <img class="app-brand-logo" src="${logoUrl}" alt="" aria-hidden="true" />
        <span class="app-brand-name">Promedia</span>
      </a>

      <nav class="app-nav flex-1" aria-label="${t('navigation.primary')}">
        ${primaryRoutes.map((route) => navigationLink(route, activeRoute, 'dashboard')).join('')}
      </nav>

      <div class="app-sidebar-footer flex flex-col gap-1">
        ${navigationLink('libraries', activeRoute, 'libraries')}
        ${navigationLink('settings', activeRoute, 'settings')}
      </div>
    </aside>
  `
}

function navigationLink(route: Route, activeRoute: Route, icon: SidebarIcon): string {
  const isActive = activeRoute === route

  return `
    <a class="app-nav-link ${isActive ? 'is-active' : ''}" href="#/${route}" data-route="${route}" ${isActive ? 'aria-current="page"' : ''}>
      ${sidebarIcon(icon)}
      <span>${t(routeDetails[route].labelKey)}</span>
    </a>
  `
}

function sidebarIcon(name: SidebarIcon): string {
  const paths: Record<SidebarIcon, string> = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />',
    libraries: '<path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" />',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.1 2.1-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8v.3h-3v-.3a2 2 0 0 0-1.2-1.8 2 2 0 0 0-2.2.4l-.1.1-2.1-2.1.1-.1a2 2 0 0 0 .4-2.2 2 2 0 0 0-1.8-1.2H4v-3h.3a2 2 0 0 0 1.8-1.2 2 2 0 0 0-.4-2.2l-.1-.1 2.1-2.1.1.1a2 2 0 0 0 2.2.4A2 2 0 0 0 11.2 4v-.3h3V4a2 2 0 0 0 1.2 1.8 2 2 0 0 0 2.2-.4l.1-.1 2.1 2.1-.1.1a2 2 0 0 0-.4 2.2 2 2 0 0 0 1.8 1.2h.3v3h-.3a2 2 0 0 0-1.7 1.1Z" />',
  }

  return `<svg class="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}
