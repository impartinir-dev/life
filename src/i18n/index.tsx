import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '../data/types'
import { de } from './de'
import { en, type MessageKey } from './en'

const messages: Record<Language, Record<MessageKey, string>> = { en, de }
const STORAGE_KEY = 'life:language'

export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export function initialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'de') return saved
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

interface I18n {
  lang: Language
  locale: string
  setLang: (lang: Language) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLanguage)

  const setLang = useCallback((next: Language) => {
    localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next
    setLangState(next)
  }, [])

  const value = useMemo<I18n>(
    () => ({
      lang,
      locale: lang === 'de' ? 'de-DE' : 'en-GB',
      setLang,
      t: (key, vars) => format(messages[lang][key] ?? key, vars),
    }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
