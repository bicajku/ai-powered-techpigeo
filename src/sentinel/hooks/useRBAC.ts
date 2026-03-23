/**
 * Sentinel SAAS - RBAC Hook
 *
 * Provides reactive permission checks within React components.
 */

import { useMemo } from "react"
import { useSentinel } from "../context/SentinelContext"
import { SENTINEL_MODULES } from "../config"

export interface UseRBACReturn {
  /** Whether the current user can access a given module */
  canAccess: (moduleName: string) => boolean
  /** Whether the current user has NGO SAAS access */
  hasNGOAccess: boolean
  /** Whether the current user has admin-level access */
  isAdmin: boolean
  /** Whether the current user is Sentinel Commander */
  isCommander: boolean
  /** Full list of accessible module names */
  accessibleModules: string[]
}

export function useRBAC(): UseRBACReturn {
  const { user, accessibleModules } = useSentinel()

  const isCommander = user?.role === "SENTINEL_COMMANDER"
  const isAdmin =
    isCommander ||
    user?.role === "ORG_ADMIN" ||
    user?.role === "TEAM_ADMIN"

  const canAccess = useMemo(
    () =>
      (moduleName: string): boolean => {
        if (isCommander) return true
        return accessibleModules.includes(moduleName)
      },
    [isCommander, accessibleModules]
  )

  const hasNGOAccess = isCommander || accessibleModules.includes(SENTINEL_MODULES.NGO_SAAS)

  return {
    canAccess,
    hasNGOAccess,
    isAdmin,
    isCommander,
    accessibleModules,
  }
}
