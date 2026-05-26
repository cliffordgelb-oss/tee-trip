import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'

export default function Login() {
  const { signInWithGoogle, signInWithApple } = useAuth()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function run(provider, fn) {
    setBusy(provider)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e?.message || 'Sign-in failed. The OAuth provider may not be configured yet.')
      setBusy(null)
    }
  }

  return (
    <div className="shell">
      <div className="card stack" style={{ maxWidth: 380, margin: '4rem auto 0' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: 0 }}>Tee Trip</h1>
        <p className="muted small" style={{ marginTop: 0 }}>
          Run your golf trip. Live scoring, leaderboards, group chat.
        </p>

        <button
          className="btn"
          style={{ width: '100%', background: '#fff', color: '#1a1a1a', border: '1px solid var(--line)' }}
          disabled={!!busy}
          onClick={() => run('google', signInWithGoogle)}
        >
          {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <button
          className="btn"
          style={{ width: '100%', background: '#000', color: '#fff' }}
          disabled={!!busy}
          onClick={() => run('apple', signInWithApple)}
        >
          {busy === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
        </button>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '.875rem', margin: 0 }}>{error}</p>
        )}

        <p className="muted small" style={{ marginTop: '1.5rem' }}>
          New here? Just sign in — your account is created on first use.
        </p>
      </div>
    </div>
  )
}
