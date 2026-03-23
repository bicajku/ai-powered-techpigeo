/**
 * Sentinel SAAS - Register Form Component
 */

import React, { useState } from "react"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"

interface RegisterFormProps {
  onSuccess?: () => void
  onSwitchToLogin?: () => void
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const { register } = useSentinelAuth()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setIsSubmitting(true)
    const result = await register(email, password, fullName)

    if (result.success) {
      onSuccess?.()
    } else {
      setError(result.error ?? "Registration failed")
    }

    setIsSubmitting(false)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-900 text-white text-2xl mb-4">
          🛡
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
        <p className="text-gray-500 text-sm mt-1">Join Sentinel SAAS</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="reg-name" className="block text-sm font-medium text-gray-700 mb-1">
            Full name
          </label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="reg-email"
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
          <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="reg-confirm" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm password
          </label>
          <input
            id="reg-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
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
          disabled={isSubmitting || !email || !password || !fullName}
          className="w-full py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-600 mt-6">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-indigo-600 hover:underline font-medium"
        >
          Sign in
        </button>
      </p>

      <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <strong>Enterprise subscription?</strong> Contact{" "}
        <a href="mailto:sales@techpigeon.com.pk" className="underline">
          sales@techpigeon.com.pk
        </a>{" "}
        for NGO SAAS module access.
      </div>
    </div>
  )
}
