import { getLocale, isLocale, setLocale, t } from '../../i18n'

export function languagePanel(): string {
  return `
    <section class="settings-panel" aria-labelledby="language-title">
      <div class="settings-panel-heading">
        <div>
          <p class="settings-panel-kicker">${t('settings.languageKicker')}</p>
          <h2 id="language-title" class="settings-panel-title">${t('settings.languageTitle')}</h2>
          <p class="settings-panel-description">${t('settings.languageDescription')}</p>
        </div>
        <span class="settings-panel-symbol" aria-hidden="true">Aa</span>
      </div>

      <label class="settings-field settings-language-field">
        <span class="settings-field-label">${t('settings.languageLabel')}</span>
        <select class="settings-input settings-select" data-locale-select>
          <option value="vi">${t('settings.locale.vietnamese')}</option>
          <option value="en">${t('settings.locale.english')}</option>
        </select>
      </label>
    </section>
  `
}

export function setupLanguageSettings(root: HTMLDivElement): () => void {
  const select = root.querySelector<HTMLSelectElement>('[data-locale-select]')
  if (!select) return () => {}

  select.value = getLocale()
  const handleChange = (): void => {
    if (isLocale(select.value)) setLocale(select.value)
  }

  select.addEventListener('change', handleChange)
  return () => select.removeEventListener('change', handleChange)
}
