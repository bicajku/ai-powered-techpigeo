/**
 * Sentinel SAAS - Auth Hook
 *
 * Convenience hook that exposes authentication state and actions
 * from the SentinelContext.
 */

import { useSentinel } from "../context/SentinelContext"
import type { SentinelUser } from "../types/index"

export interface UseSentinelAuthReturn {
  user: SentinelUser | null
  isAuthenticated: boolean
  isCommander: boolean
  isOrgAdmin: boolean
  isTeamAdmin: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  register: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export function useSentinelAuth(): UseSentinelAuthReturn {
  const ctx = useSentinel()

  return {
    user: ctx.user,
    isAuthenticated: !!ctx.user,
    isCommander: ctx.user?.role === "SENTINEL_COMMANDER",
    isOrgAdmin:
      ctx.user?.role === "ORG_ADMIN" || ctx.user?.role === "SENTINEL_COMMANDER",
    isTeamAdmin:
      ctx.user?.role === "TEAM_ADMIN" ||
      ctx.user?.role === "ORG_ADMIN" ||
      ctx.user?.role === "SENTINEL_COMMANDER",
    isLoading: ctx.isLoading,
    login: ctx.login,
    register: ctx.register,
    logout: ctx.logout,
    refresh: ctx.refresh,
  }
}
