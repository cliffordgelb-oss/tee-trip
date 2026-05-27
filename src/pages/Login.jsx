import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { Shell, Card, Button } from '../components/ui.jsx'

export default function Login() {
  const { signInWithGoogle, signInWithApple } = useAuth()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function run(provider, fn) {
    setBusy(provider)
    setError(null)
    try { await fn() }
    catch (e) {
      setError(e?.message || 'Sign-in failed. The OAuth provider may not be configured yet.')
      setBusy(null)
    }
  }

  return (
    <Shell>
      <div style={{ maxWidth: 380, margin: '4rem auto 0' }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 16 }}>
            <img src="/logo-icon.svg" width="84" height="84" alt="" style={{ borderRadius: 18 }} />
            <h1 style={{ fontSize: 'var(--tt-text-2xl)', marginTop: 14, marginBottom: 0 }}>Tee Trip</h1>
            <p className="tt-small tt-muted" style={{ margin: '6px 0 0', maxWidth: 280 }}>
              Run your golf trip. Live scoring, leaderboards, group chat.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <Button
              variant="google"
              disabled={!!busy}
              onClick={() => run('google', signInWithGoogle)}
              style={{ width: '100%' }}
            >
              {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </Button>
            <Button
              variant="apple"
              disabled={!!busy}
              onClick={() => run('apple', signInWithApple)}
              style={{ width: '100%' }}
            >
              {busy === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
            </Button>
          </div>

          {error && (
            <p style={{ color: 'var(--tt-pencil)', fontSize: 'var(--tt-text-sm)', margin: '12px 0 0' }}>
              {error}
            </p>
          )}

          <p className="tt-small tt-muted" style={{ marginTop: 18, marginBottom: 0 }}>
            New here? Just sign in — your account is created on first use.
          </p>
        </Card>
        <p className="tt-xs tt-muted" style={{ textAlign: 'center', marginTop: 14 }}>
          Plan the trip. Run the tournament.
        </p>
      </div>
    </Shell>
  )
}
