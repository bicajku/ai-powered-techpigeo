/**
 * Sentinel SAAS - Global React Context
 *
 * Provides authentication state, subscription info, and permissions
 * to all components in the Sentinel module without prop drilling.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { sentinelAuth } from "../api/auth"
import { getUserSubscription } from "../api/subscription"
import { getAccessibleModules } from "../api/rbac"
import { SENTINEL_CONFIG } from "../config"
import type {
  SentinelUser,
  SentinelSession,
  UserSubscription,
} from "../types/index"

// ─────────────────────────── Context Types ───────────────────────

export interface SentinelContextValue {
  /** Current authenticated user (null if not logged in) */
  user: SentinelUser | null
  /** Current session token */
  session: SentinelSession | null
  /** Active subscription for the current user */
  subscription: UserSubscription | null
  /** List of module names accessible to the current user */
  accessibleModules: string[]
  /** Whether the initial auth check is still running */
  isLoading: boolean
  /** Whether the Sentinel module is globally enabled */
  isEnabled: boolean
  /** Login and set session */
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  /** Register and set session */
  register: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ success: boolean; error?: string }>
  /** Logout and clear session */
  logout: () => Promise<void>
  /** Force-refresh the auth state */
  refresh: () => Promise<void>
}

// ─────────────────────────── Context & Provider ──────────────────

const SentinelContext = createContext<SentinelContextValue | null>(null)

export function SentinelProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SentinelUser | null>(null)
  const [session, setSession] = useState<SentinelSession | null>(null)
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [accessibleModules, setAccessibleModules] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadUserData = useCallback(async (sess: SentinelSession) => {
    const [sub, modules] = await Promise.all([
      getUserSubscription(sess.user.id).catch(() => null),
      getAccessibleModules(sess.user.id).catch(() => [] as string[]),
    ])
    setSubscription(sub)
    setAccessibleModules(modules)
  }, [])

  const initialize = useCallback(async () => {
    setIsLoading(true)
    try {
      // Initialize Sentinel Commander if needed (idempotent)
      await sentinelAuth.initializeCommander().catch(() => null)

      const sess = await sentinelAuth.getSession()
      if (sess) {
        setUser(sess.user)
        setSession(sess)
        await loadUserData(sess)
      }
    } catch (err) {
      console.warn("Sentinel context init error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [loadUserData])

  useEffect(() => {
    void initialize()
  }, [initialize])

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const result = await sentinelAuth.login(email, password)
      if (result.success && result.session) {
        setUser(result.session.user)
        setSession(result.session)
        await loadUserData(result.session)
      }
      return { success: result.success, error: result.error }
    },
    [loadUserData]
  )

  const register = useCallback(
    async (
      email: string,
      password: string,
      fullName: string
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await sentinelAuth.register(email, password, fullName)
      if (result.success && result.session) {
        setUser(result.session.user)
        setSession(result.session)
        await loadUserData(result.session)
      }
      return { success: result.success, error: result.error }
    },
    [loadUserData]
  )

  const logout = useCallback(async () => {
    if (user) {
      await sentinelAuth.logout(user.id).catch(() => null)
    }
    setUser(null)
    setSession(null)
    setSubscription(null)
    setAccessibleModules([])
  }, [user])

  const refresh = useCallback(async () => {
    await initialize()
  }, [initialize])

  const value: SentinelContextValue = {
    user,
    session,
    subscription,
    accessibleModules,
    isLoading,
    isEnabled: SENTINEL_CONFIG.enabled,
    login,
    register,
    logout,
    refresh,
  }

  return (
    <SentinelContext.Provider value={value}>
      {children}
    </SentinelContext.Provider>
  )
}

// ─────────────────────────── Hook ────────────────────────────────

export function useSentinel(): SentinelContextValue {
  const ctx = useContext(SentinelContext)
  if (!ctx) {
    throw new Error("useSentinel must be used inside <SentinelProvider>")
  }
  return ctx
}
