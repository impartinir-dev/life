import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'

interface Invite {
  id: string
  household_name: string
  invited_by_name: string | null
}

/** Shown to a signed-in user who isn't in a household yet: join an invite or start a new one. */
export function Onboarding() {
  const { t } = useI18n()
  const { profile, session, reload } = useAuth()
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState(t('onboarding.defaultName'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadInvites() {
    const { data } = await supabase.rpc('my_invites')
    setInvites((data as Invite[] | null) ?? [])
  }

  useEffect(() => {
    void loadInvites()
  }, [])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) setError(error.message)
    else await reload()
  }

  function create(e: FormEvent) {
    e.preventDefault()
    void run(() => supabase.rpc('create_household', { household_name: name.trim() }))
  }

  return (
    <main className="auth-screen">
      <h1 className="brand">{t('onboarding.title', { name: profile?.display_name ?? '' })}</h1>

      {invites.length > 0 && (
        <section className="card">
          <h2>{t('onboarding.invited')}</h2>
          {invites.map((inv) => (
            <div key={inv.id} className="row-between">
              <span>{t('onboarding.invitedBy', { name: inv.invited_by_name ?? '?', household: inv.household_name })}</span>
              <button className="primary" disabled={busy} onClick={() => run(() => supabase.rpc('accept_invite', { invite_id: inv.id }))}>
                {t('onboarding.join')}
              </button>
            </div>
          ))}
        </section>
      )}

      <form className="card form" onSubmit={create}>
        <h2>{t('onboarding.create')}</h2>
        <label>
          {t('onboarding.householdName')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </label>
        <button className={invites.length ? '' : 'primary'} disabled={busy}>
          {t('onboarding.createButton')}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {invites.length === 0 && (
        <p className="muted center">
          {t('onboarding.noInvite', { email: session?.user.email ?? '' })}{' '}
          <button className="link" onClick={loadInvites}>
            {t('onboarding.reload')}
          </button>
        </p>
      )}
    </main>
  )
}
