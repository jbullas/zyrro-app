'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function SignupPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/auth/callback' },
    })
    if (error) {
      setMessage(error.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="page-body">
      <form onSubmit={handleSignup} className="page-form">

        <div>
          <h1 className="page-title">Create your account</h1>
        </div>

        {sent ? (
          <p className="form-helper">Check your inbox for your sign in link.</p>
        ) : (
          <>
            <input
              className="form-input"
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <p className="form-helper">
              We&apos;ll send you a magic link to sign in. No password needed.
            </p>

            {message && <p className="form-error">{message}</p>}

            <button type="submit" className="btn-primary">
              Send me a link
            </button>
          </>
        )}

        <p className="form-helper">
          Already have an account?{' '}
          <a href="/login">Log in</a>
        </p>

      </form>
    </div>
  )
}
