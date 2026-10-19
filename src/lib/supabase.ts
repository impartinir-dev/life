import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Set at build time from the GitHub repository variables (see README). The publishable/anon key
// is designed to be public; the database access rules are what protect the data.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase: SupabaseClient = createClient(url || 'http://localhost', key || 'missing', {
  auth: {
    // PKCE returns ?code=… in the query string, which doesn't collide with the #/ hash router.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** The address the app is served from, used for email confirmation and password-reset links. */
export function appUrl(): string {
  return window.location.origin + window.location.pathname
}
