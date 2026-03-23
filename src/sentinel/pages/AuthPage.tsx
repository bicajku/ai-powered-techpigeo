/**
 * Sentinel SAAS - Auth Page
 *
 * Login / Registration page for the Sentinel portal.
 * Does NOT depend on App.tsx.
 */

import React, { useState } from "react"
import { LoginForm } from "../components/SentinelAuth/LoginForm"
import { RegisterForm } from "../components/SentinelAuth/RegisterForm"
import { useSentinelAuth } from "../hooks/useSentinelAuth"

interface AuthPageProps {
  onAuthenticated?: () => void
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const { isAuthenticated } = useSentinelAuth()
  const [mode, setMode] = useState<"login" | "register">("login")

  if (isAuthenticated) {
    return null // Parent should redirect once authenticated
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {mode === "login" ? (
            <LoginForm
              onSuccess={onAuthenticated}
              onSwitchToRegister={() => setMode("register")}
            />
          ) : (
            <RegisterForm
              onSuccess={onAuthenticated}
              onSwitchToLogin={() => setMode("login")}
            />
          )}
        </div>
      </div>
    </div>
  )
}
