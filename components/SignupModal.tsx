'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

interface SignupModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function SignupModal({ isOpen, onClose, onSuccess }: SignupModalProps) {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signUp({ email, password })

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    onSuccess()
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

        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
      </div>
    </div>
  )
}
