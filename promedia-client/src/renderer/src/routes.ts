export const routeDetails = {
  dashboard: { labelKey: 'navigation.dashboard' },
  downloads: { labelKey: 'navigation.downloads' },
  libraries: { labelKey: 'navigation.libraries' },
  settings: { labelKey: 'navigation.settings' },
} as const

export type Route = keyof typeof routeDetails

export const defaultRoute: Route = 'dashboard'
export const primaryRoutes: readonly Route[] = ['dashboard', 'downloads']

export function isRoute(value: string): value is Route {
  return Object.hasOwn(routeDetails, value)
}
