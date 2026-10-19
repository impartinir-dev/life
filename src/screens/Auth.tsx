import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n'
import { appUrl, supabase } from '../lib/supabase'

function LanguageSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <div className="segmented small">
      {(['en', 'de'] as const).map((l) => (
        <button key={l} className={lang === l ? 'active' : ''} onClick={() => setLang(l)} type="button">
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export function NotConfigured() {
  const { t } = useI18n()
  return (
    <main className="auth-screen">
      <h1 className="brand">{t('app.name')}</h1>
      <div className="card">
        <h2>{t('setup.title')}</h2>
        <p>{t('setup.body')}</p>
      </div>
    </main>
  )
}

export function Login() {
  const { t, lang } = useI18n()
  const { linkFailed } = useAuth()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(linkFailed ? t('auth.linkFailed') : null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const result =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: appUrl(), data: { display_name: name.trim(), language: lang } },
          })
    setBusy(false)
    if (result.error) setError(result.error.message)
    else if (mode === 'signUp' && !result.data.session) setNotice(t('auth.checkEmail'))
  }

  async function forgot() {
    if (!email) return setError(t('auth.email'))
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })
    if (error) setError(error.message)
    else setNotice(t('auth.resetSent'))
  }

  return (
    <main className="auth-screen">
      <div className="auth-top">
        <LanguageSwitch />
      </div>
      <h1 className="brand">{t('app.name')}</h1>
      <p className="muted center">{t('auth.tagline')}</p>
      <form className="card form" onSubmit={submit}>
        {mode === 'signUp' && (
          <label>
            {t('auth.name')}
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
          </label>
        )}
        <label>
          {t('auth.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={busy}>
          {t(mode === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
        </button>
        {mode === 'signIn' && (
          <button type="button" className="link" onClick={forgot}>
            {t('auth.forgot')}
          </button>
        )}
      </form>
      <button className="link" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        {t(mode === 'signIn' ? 'auth.toSignUp' : 'auth.toSignIn')}
      </button>
    </main>
  )
}

export function PasswordRecovery() {
  const { t } = useI18n()
  const { finishRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else finishRecovery()
  }

  return (
    <main className="auth-screen">
      <h1 className="brand">{t('app.name')}</h1>
      <form className="card form" onSubmit={submit}>
        <label>
          {t('auth.newPassword')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoComplete="new-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary">{t('common.save')}</button>
      </form>
    </main>
  )
}
