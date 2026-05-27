import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from './supabase.js'

const AuthCtx = createContext(null)

// Custom URL scheme registered in ios/App/App/Info.plist. Supabase
// redirects the user here after the OAuth round-trip; iOS catches the
// scheme and notifies us via CapApp.addListener('appUrlOpen', ...).
const NATIVE_REDIRECT = 'app.teetrip://login-callback'

// Where to send the user after a successful sign-in (web only — the
// Capacitor runtime handles its own routing via the deep-link listener).
function webRedirectTarget() {
  return `${window.location.origin}/dashboard`
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let claimedForUserId = null

    function claimEmailInvites(userId) {
      if (!userId || claimedForUserId === userId) return
      claimedForUserId = userId
      supabase.rpc('rpc_claim_my_email_invites')
        .then(({ error }) => {
          if (error) console.warn('[auth] email-invite claim failed:', error.message)
        })
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const next = data.session ?? null
      setSession(next)
      setLoading(false)
      if (next?.user?.id) claimEmailInvites(next.user.id)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next ?? null)
      if (event === 'SIGNED_IN' && next?.user?.id) {
        claimEmailInvites(next.user.id)
      }
    })

    // ── Native deep-link OAuth callback (Capacitor only) ────────
    // When iOS opens our custom scheme URL, parse the auth payload and
    // hand it to Supabase. PKCE flow puts `code=...` on the URL; we
    // exchange it for a session. Then close the in-app browser.
    let appListenerHandle = null
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url || !url.startsWith('app.teetrip://')) return
        try {
          const parsed = new URL(url)
          const code = parsed.searchParams.get('code')
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code)
            if (error) console.warn('[auth] exchangeCodeForSession failed:', error.message)
          } else {
            // Implicit / hash-style fallback — older Supabase auth flows
            // ship tokens in the URL hash. setSession with parsed tokens.
            const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
            const params = new URLSearchParams(hash)
            const access_token = params.get('access_token')
            const refresh_token = params.get('refresh_token')
            if (access_token && refresh_token) {
              const { error } = await supabase.auth.setSession({ access_token, refresh_token })
              if (error) console.warn('[auth] setSession failed:', error.message)
            }
          }
        } catch (e) {
          console.warn('[auth] deep-link parse error:', e)
        } finally {
          try { await Browser.close() } catch { /* already closed */ }
        }
      }).then(handle => { appListenerHandle = handle })
    }

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe?.()
      appListenerHandle?.remove?.()
    }
  }, [])

  const signInWithOAuth = useCallback(async (provider) => {
    // Web: standard browser-redirect flow — Supabase JS handles the
    // round-trip via detectSessionInUrl when we land back on /dashboard.
    if (!Capacitor.isNativePlatform()) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: webRedirectTarget() },
      })
      if (error) throw error
      return
    }

    // Native: get the OAuth URL from Supabase, open it in an in-app
    // browser, and wait for the appUrlOpen callback to complete the
    // session (handled by the effect above). `skipBrowserRedirect`
    // returns the URL without navigating the WebView.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: NATIVE_REDIRECT,
        skipBrowserRedirect: true,
      },
    })
    if (error) throw error
    if (data?.url) {
      await Browser.open({ url: data.url, presentationStyle: 'popover' })
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle: () => signInWithOAuth('google'),
    signInWithApple: () => signInWithOAuth('apple'),
    signOut,
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
