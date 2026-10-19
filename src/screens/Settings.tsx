import { clear } from 'idb-keyval'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useHousehold } from '../auth/AuthProvider'
import { Icon } from '../components/Icon'
import { Avatar, Header } from '../components/Layout'
import { useToast } from '../components/Toast'
import { useEngine } from '../data/DataProvider'
import type { Language } from '../data/types'
import { useI18n } from '../i18n'
import { appUrl, supabase } from '../lib/supabase'

const COLORS = ['#4f7cff', '#e5484d', '#30a46c', '#f76b15', '#8e4ec6', '#d6409f', '#12a594', '#ad7f58']

interface Invite {
  id: string
  email: string
}

export function SettingsScreen() {
  const { t, lang } = useI18n()
  const { profile, household, members, updateProfile, renameHousehold } = useHousehold()
  const engine = useEngine()
  const toast = useToast()
  const [name, setName] = useState(profile.display_name)
  const [householdName, setHouseholdName] = useState(household.name)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invites, setInvites] = useState<Invite[]>([])

  const fail = (e: unknown) => toast(t('common.error', { message: (e as Error).message ?? String(e) }))
  const saved = () => toast(t('settings.saved'))

  const loadInvites = useCallback(async () => {
    const { data } = await supabase
      .from('household_invites')
      .select('id, email')
      .eq('household_id', household.id)
      .is('accepted_at', null)
      .order('created_at')
    setInvites(data ?? [])
  }, [household.id])

  useEffect(() => {
    void loadInvites()
  }, [loadInvites])

  function saveProfile(patch: Parameters<typeof updateProfile>[0]) {
    updateProfile(patch).then(saved, fail)
  }

  async function invite(e: FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    const { error } = await supabase.from('household_invites').insert({ household_id: household.id, email })
    if (error) return fail(error)
    setInviteEmail('')
    await loadInvites()
    await share(email)
  }

  async function share(email: string) {
    const text = t('settings.inviteMessage', { household: household.name, url: appUrl(), email })
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {
        // cancelled, or not allowed here: fall back to copying
      }
    }
    await navigator.clipboard?.writeText(text)
    toast(t('settings.inviteCopied'))
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase.from('household_invites').delete().eq('id', id)
    if (error) fail(error)
    else await loadInvites()
  }

  async function exportData() {
    const data = await engine.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `life-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function signOut() {
    await supabase.auth.signOut()
    // Don't leave the household's data behind on this device.
    await clear()
    Object.keys(localStorage)
      .filter((k) => k.startsWith('life:me:'))
      .forEach((k) => localStorage.removeItem(k))
  }

  return (
    <>
      <Header title={t('settings.title')} />
      <main className="content settings">
        <section className="card form">
          <h2>{t('settings.profile')}</h2>
          <label>
            {t('settings.name')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== profile.display_name && saveProfile({ display_name: name.trim() })}
            />
          </label>
          <div className="field">
            <span>{t('settings.color')}</span>
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${profile.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => saveProfile({ color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t('settings.language')}</span>
            <div className="segmented">
              {(
                [
                  ['en', 'English'],
                  ['de', 'Deutsch'],
                ] as [Language, string][]
              ).map(([code, label]) => (
                <button key={code} className={lang === code ? 'active' : ''} onClick={() => saveProfile({ language: code })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card form">
          <h2>{t('settings.household')}</h2>
          <label>
            {t('settings.householdName')}
            <input
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              onBlur={() =>
                householdName.trim() && householdName.trim() !== household.name && renameHousehold(householdName.trim()).then(saved, fail)
              }
            />
          </label>
          <div className="field">
            <span>{t('settings.members')}</span>
            <ul className="members">
              {members.map((m) => (
                <li key={m.id}>
                  <Avatar name={m.display_name} color={m.color} />
                  {m.display_name}
                  {m.id === profile.id && <span className="muted"> ({t('settings.you')})</span>}
                </li>
              ))}
              {invites.map((inv) => (
                <li key={inv.id}>
                  <span className="avatar pending">?</span>
                  <span className="grow">
                    {inv.email}
                    <br />
                    <span className="muted small">{t('settings.invitePending')}</span>
                  </span>
                  <button className="icon-button" onClick={() => share(inv.email)} aria-label={t('settings.inviteShare')}>
                    <Icon name="share" size={18} />
                  </button>
                  <button className="icon-button subtle" onClick={() => cancelInvite(inv.id)} aria-label={t('common.delete')}>
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <form onSubmit={invite} className="field">
            <span>{t('settings.invite')}</span>
            <div className="row">
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder={t('settings.inviteEmail')} required />
              <button className="primary">{t('settings.inviteButton')}</button>
            </div>
          </form>
        </section>

        <section className="card form">
          <h2>{t('settings.install')}</h2>
          <p className="muted">{t('settings.installHint')}</p>
        </section>

        <section className="card form">
          <h2>{t('settings.data')}</h2>
          <button onClick={() => exportData().catch(fail)}>{t('settings.export')}</button>
          <button className="danger" onClick={signOut}>
            {t('settings.signOut')}
          </button>
        </section>
        <p className="muted small center">v{__APP_VERSION__}</p>
      </main>
    </>
  )
}
