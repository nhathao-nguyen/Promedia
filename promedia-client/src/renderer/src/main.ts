import './assets/main.css'

import { header } from './components/header'
import { sidebar } from './components/sidebar'
import { initializeLocale, localeChangeEvent } from './i18n'
import { renderPage } from './pages/page'
import { defaultRoute, isRoute, type Route } from './routes'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Không tìm thấy vùng hiển thị chính của ứng dụng.')
}

const root = app
let activePageCleanup: (() => void) | null = null

initializeLocale()

function render(route: Route): void {
  activePageCleanup?.()
  activePageCleanup = null
  const pageView = renderPage(route)

  root.innerHTML = `
    <div class="app-shell flex">
      ${sidebar(route)}
      <div class="app-content flex min-w-0 flex-1 flex-col">
        ${header(route)}
        ${pageView.markup}
      </div>
    </div>
  `

  activePageCleanup = pageView.setup(root)
}

function getRouteFromURL(): Route {
  const route = window.location.hash.replace(/^#\/?/, '')
  return isRoute(route) ? route : defaultRoute
}

function navigate(route: Route): void {
  const hash = `#/${route}`
  if (window.location.hash !== hash) {
    window.history.pushState({ route }, '', hash)
  }
  render(route)
}

app.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return

  const link = event.target.closest<HTMLAnchorElement>('[data-route]')
  if (!link) return

  event.preventDefault()
  const route = link.dataset.route
  if (route && isRoute(route)) {
    navigate(route)
  }
})

window.addEventListener('popstate', () => {
  render(getRouteFromURL())
})

window.addEventListener(localeChangeEvent, () => {
  render(getRouteFromURL())
})

const initialRoute = getRouteFromURL()
if (window.location.hash !== `#/${initialRoute}`) {
  window.history.replaceState({ route: initialRoute }, '', `#/${initialRoute}`)
}
render(initialRoute)
