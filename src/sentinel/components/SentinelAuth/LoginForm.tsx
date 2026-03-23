/**
 * Sentinel SAAS - Login Form Component
 */

import React, { useState } from "react"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"

interface LoginFormProps {
  onSuccess?: () => void
  onSwitchToRegister?: () => void
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const { login } = useSentinelAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await login(email, password)

    if (result.success) {
      onSuccess?.()
    } else {
      setError(result.error ?? "Login failed")
    }

    setIsSubmitting(false)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-900 text-white text-2xl mb-4">
          🛡
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Sentinel Portal</h1>
        <p className="text-gray-500 text-sm mt-1">Sign in to your Sentinel account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="sentinel-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="sentinel-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="sentinel-password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="sentinel-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !email || !password}
          className="w-full py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {onSwitchToRegister && (
        <p className="text-center text-sm text-gray-600 mt-6">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-indigo-600 hover:underline font-medium"
          >
            Create one
          </button>
        </p>
      )}

      <p className="text-center text-xs text-gray-400 mt-4">
        Powered by Sentinel SAAS &bull; TechPigeon
      </p>
    </div>
  )
}
