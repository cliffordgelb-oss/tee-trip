import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let claimedForUserId = null

    function claimEmailInvites(userId) {
      // Fire-and-forget: idempotent, ignores errors so a failed claim
      // doesn't block app load.
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
    return () => {
      mounted = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  const signInWithOAuth = useCallback(async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) throw error
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
