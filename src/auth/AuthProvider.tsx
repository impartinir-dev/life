import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Household, Profile } from '../data/types'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'

export type AuthStatus = 'loading' | 'signedOut' | 'recovery' | 'noHousehold' | 'ready'

interface Me {
  profile: Profile
  household: Household | null
  members: Profile[]
}

interface Auth {
  status: AuthStatus
  session: Session | null
  profile: Profile | null
  household: Household | null
  members: Profile[]
  /** True when an email link (confirmation/reset) was opened but couldn't be used in this browser. */
  linkFailed: boolean
  reload: () => Promise<void>
  updateProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>
  renameHousehold: (name: string) => Promise<void>
  finishRecovery: () => void
}

const AuthContext = createContext<Auth | null>(null)
const cacheKey = (userId: string) => `life:me:${userId}`

/** Loads the user's profile, household and housemates; falls back to the last copy when offline. */
async function loadMe(userId: string): Promise<Me | null> {
  const cached = localStorage.getItem(cacheKey(userId))
  const fallback = cached ? (JSON.parse(cached) as Me) : null
  if (!navigator.onLine) return fallback

  const [{ data: profile, error: e1 }, { data: membership, error: e2 }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, language, color').eq('id', userId).single(),
    supabase.from('household_members').select('households(id, name)').eq('user_id', userId).order('joined_at').limit(1),
  ])
  if (e1 || e2 || !profile) return fallback

  const household = (membership?.[0]?.households as unknown as Household | undefined) ?? null
  let members: Profile[] = [profile as Profile]
  if (household) {
    const { data } = await supabase
      .from('household_members')
      .select('profiles(id, display_name, language, color)')
      .eq('household_id', household.id)
    if (data) members = data.map((m) => m.profiles as unknown as Profile).filter(Boolean)
  }
  const me: Me = { profile: profile as Profile, household, members }
  localStorage.setItem(cacheKey(userId), JSON.stringify(me))
  return me
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n()
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [linkFailed, setLinkFailed] = useState(false)

  const apply = useCallback(
    async (s: Session | null) => {
      setSession(s)
      if (!s) {
        setMe(null)
        setStatus('signedOut')
        return
      }
      const loaded = await loadMe(s.user.id)
      setMe(loaded)
      if (loaded) setLang(loaded.profile.language)
      setStatus(loaded?.household ? 'ready' : 'noHousehold')
    },
    [setLang],
  )

  useEffect(() => {
    const hadCode = new URLSearchParams(window.location.search).has('code')
    let recovering = false

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering = true
        setSession(s)
        setStatus('recovery')
        return
      }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        if (recovering) return
        // Supabase advises against awaiting other calls inside this callback.
        setTimeout(() => void apply(s), 0)
      }
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (hadCode) {
        if (!data.session) setLinkFailed(true)
        window.history.replaceState(null, '', window.location.pathname + window.location.hash)
      }
      if (!recovering) void apply(data.session)
    })
    return () => sub.subscription.unsubscribe()
  }, [apply])

  const reload = useCallback(() => apply(session), [apply, session])

  const updateProfile = useCallback(
    async (patch: Partial<Omit<Profile, 'id'>>) => {
      if (!me) return
      const { error } = await supabase.from('profiles').update(patch).eq('id', me.profile.id)
      if (error) throw error
      if (patch.language) setLang(patch.language)
      await reload()
    },
    [me, reload, setLang],
  )

  const renameHousehold = useCallback(
    async (name: string) => {
      if (!me?.household) return
      const { error } = await supabase.from('households').update({ name }).eq('id', me.household.id)
      if (error) throw error
      await reload()
    },
    [me, reload],
  )

  const finishRecovery = useCallback(() => void apply(session), [apply, session])

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        profile: me?.profile ?? null,
        household: me?.household ?? null,
        members: me?.members ?? [],
        linkFailed,
        reload,
        updateProfile,
        renameHousehold,
        finishRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

/** For screens that only render once a household is loaded. */
export function useHousehold() {
  const auth = useAuth()
  if (!auth.profile || !auth.household) throw new Error('useHousehold before household is loaded')
  return { ...auth, profile: auth.profile, household: auth.household }
}
