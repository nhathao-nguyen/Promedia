import { en } from './locales/en'
import { vi, type TranslationKey } from './locales/vi'

export type Locale = 'vi' | 'en'

export const localeChangeEvent = 'promedia:locale-change'

const localeStorageKey = 'promedia.locale'
const messages: Record<Locale, Readonly<Record<TranslationKey, string>>> = { vi, en }
let activeLocale = readStoredLocale()

export function getLocale(): Locale {
  return activeLocale
}

export function isLocale(value: string): value is Locale {
  return value === 'vi' || value === 'en'
}

export function setLocale(locale: Locale): void {
  if (locale === activeLocale) return

  activeLocale = locale
  try {
    window.localStorage.setItem(localeStorageKey, locale)
  } catch {
    // Không làm gián đoạn giao diện nếu môi trường Electron chặn localStorage.
  }

  syncDocumentLocale()
  window.dispatchEvent(new Event(localeChangeEvent))
}

export function initializeLocale(): void {
  syncDocumentLocale()
}

export function t(key: TranslationKey, variables: Record<string, string | number> = {}): string {
  const template = messages[activeLocale][key] ?? messages.en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (match, variable: string) => {
    const value = variables[variable]
    return value === undefined ? match : String(value)
  })
}

function readStoredLocale(): Locale {
  try {
    const storedLocale = window.localStorage.getItem(localeStorageKey)
    return storedLocale && isLocale(storedLocale) ? storedLocale : 'vi'
  } catch {
    return 'vi'
  }
}

function syncDocumentLocale(): void {
  document.documentElement.lang = activeLocale
  document.title = t('app.title')
}
