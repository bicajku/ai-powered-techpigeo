/**
 * Sentinel SAAS - Main Layout Wrapper
 *
 * Self-contained entry point for the entire Sentinel SAAS module.
 * Wraps everything with SentinelProvider and error boundaries.
 * ZERO dependency on App.tsx — can be imported anywhere.
 *
 * Usage:
 *   import { SentinelLayout } from "@/sentinel/pages/SentinelLayout"
 *   <SentinelLayout />
 */

import React, { Component, type ReactNode } from "react"
import { SentinelProvider, useSentinel } from "../context/SentinelContext"
import { useSentinelAuth } from "../hooks/useSentinelAuth"
import { SENTINEL_CONFIG } from "../config"
import { AuthPage } from "./AuthPage"
import { AdminPortal } from "./AdminPortal"
import { NGOSAASPage } from "./NGOSAASPage"

// ─────────────────────────── Error Boundary ──────────────────────

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class SentinelErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Sentinel module error:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center p-8 max-w-md">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Sentinel Module Error</h2>
              <p className="text-gray-600 text-sm mb-4">
                {this.state.error?.message ?? "An unexpected error occurred."}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-indigo-700 text-white rounded-lg text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}

// ─────────────────────────── Inner Layout ────────────────────────

type SentinelView = "auth" | "admin" | "ngo-saas" | "home"

function SentinelInner() {
  const { user, isLoading } = useSentinel()
  const { isAuthenticated, isCommander, isOrgAdmin } = useSentinelAuth()
  const [view, setView] = React.useState<SentinelView>("auth")

  React.useEffect(() => {
    if (!isAuthenticated) {
      setView("auth")
    } else if (isCommander || isOrgAdmin) {
      setView("admin")
    } else {
      setView("home")
    }
  }, [isAuthenticated, isCommander, isOrgAdmin])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🛡</div>
          <p className="text-gray-500 text-sm">Loading Sentinel…</p>
        </div>
      </div>
    )
  }

  if (view === "auth") {
    return <AuthPage onAuthenticated={() => setView(isCommander ? "admin" : "home")} />
  }

  if (view === "admin") {
    return <AdminPortal />
  }

  if (view === "ngo-saas") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("home")}
              className="text-indigo-300 hover:text-white text-sm"
            >
              ← Back
            </button>
            <span className="text-white/30">|</span>
            <span className="font-bold">NGO SAAS Module</span>
          </div>
          <span className="text-indigo-300 text-sm">{user?.email}</span>
        </header>
        <NGOSAASPage />
      </div>
    )
  }

  // Default home dashboard for regular users
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡</span>
          <div>
            <h1 className="font-bold leading-tight">Sentinel SAAS</h1>
            <p className="text-indigo-300 text-xs">{user?.email}</p>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="grid gap-4 sm:grid-cols-2 mt-6">
          <div
            className="bg-white rounded-xl border p-6 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setView("ngo-saas")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setView("ngo-saas")}
          >
            <div className="text-3xl mb-3">🌐</div>
            <h3 className="font-semibold text-gray-900">NGO SAAS Module</h3>
            <p className="text-sm text-gray-500 mt-1">
              Manage projects, upload documents, generate reports
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─────────────────────────── Public Export ───────────────────────

/**
 * Root entry point for the entire Sentinel SAAS feature set.
 *
 * Renders nothing if VITE_SENTINEL_ENABLED is not "true".
 * Wrap with an error boundary for safe integration.
 */
export function SentinelLayout() {
  if (!SENTINEL_CONFIG.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <div className="text-5xl mb-3">🛡</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Sentinel SAAS</h2>
          <p className="text-gray-500 text-sm">
            Sentinel features are currently disabled.
            <br />
            Set <code className="bg-gray-200 px-1 rounded text-xs">VITE_SENTINEL_ENABLED=true</code> to enable.
          </p>
        </div>
      </div>
    )
  }

  return (
    <SentinelErrorBoundary>
      <SentinelProvider>
        <SentinelInner />
      </SentinelProvider>
    </SentinelErrorBoundary>
  )
}
