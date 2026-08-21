import { t } from '../../i18n'

export function dashboardPage(): string {
  return `
    <main class="app-main min-w-0 flex-1">
      <div class="page-container dashboard-container mx-auto flex flex-1 flex-col">
        <section class="empty-state flex flex-1 flex-col items-center justify-center text-center">
          <span class="empty-state-mark" aria-hidden="true">~</span>
          <h2 class="empty-state-title">${t('dashboard.emptyTitle')}</h2>
          <p class="empty-state-description">${t('dashboard.emptyDescription')}</p>
          <p class="empty-state-note">${t('dashboard.emptyNote')}</p>
        </section>
      </div>
    </main>
  `
}
