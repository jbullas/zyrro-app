'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(error.message)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="page-body">
      <form onSubmit={handleLogin} className="page-form">

        <div>
          <h1 className="page-title">Log in</h1>
          <p className="page-subtitle">Enter your details to continue your journey</p>
        </div>

        <input
          className="form-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          className="form-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {message && <p className="form-error">{message}</p>}

        <button type="submit" className="btn-transactional">
          Log in
        </button>

        <p className="form-helper">
          Don't have an account?{' '}
          <a href="/signup">Sign up</a>
        </p>

      </form>
    </div>
  )
}