'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

interface SignupModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function SignupModal({ isOpen, onClose }: SignupModalProps) {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!isOpen) return null

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-md bg-white rounded-lg p-8 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-2xl font-bold mb-4">Check your inbox</h2>
          <p className="text-gray-700 mb-2">
            We've sent a confirmation link to <strong>{email}</strong>.
          </p>
          <p className="text-gray-700 mb-6">
            Click the link to unlock your full Identity Report. You'll be
            brought straight back here.
          </p>
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-lg p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label="Close"
        >
          ×
        </button>

        <h2 className="text-2xl font-bold mb-6">Create your account</h2>

        <form onSubmit={handleSignup} className="space-y-4">
          <input
            className="w-full border p-3 rounded"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            className="w-full border p-3 rounded"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            className="w-full border p-3 rounded disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
