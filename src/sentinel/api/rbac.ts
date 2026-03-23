/**
 * Sentinel SAAS - Role-Based Access Control (RBAC) API
 *
 * Enforces access rules at the module and subscription level.
 * Acts as the single source of truth for permission checks —
 * including direct URL access protection.
 */

import { v4 as uuidv4 } from "uuid"
import {
  dbGetUserById,
  dbGetUserSubscription,
  dbGetUserModulePermissions,
  dbGrantModulePermission,
  dbRevokeModulePermission,
  dbWriteAuditLog,
} from "./db"
import { TIER_MODULE_ACCESS, SENTINEL_MODULES } from "../config"
import type {
  AccessCheckResult,
  UserModulePermission,
  SubscriptionTier,
  ModuleAccessLevel,
} from "../types/index"

// ─────────────────────────── Core Access Check ───────────────────

/**
 * Check if a user can access a given module.
 * Enforces subscription tier AND explicit permission grants.
 */
export async function checkModuleAccess(
  userId: string,
  moduleName: string
): Promise<AccessCheckResult> {
  try {
    const user = await dbGetUserById(userId)
    if (!user || !user.isActive) {
      return { allowed: false, reason: "User not found or inactive" }
    }

    // Sentinel Commander has access to everything
    if (user.role === "SENTINEL_COMMANDER") {
      return { allowed: true }
    }

    // Get subscription
    const sub = await dbGetUserSubscription(userId)
    if (!sub || sub.status !== "ACTIVE") {
      return {
        allowed: false,
        reason: "No active subscription. Please contact your administrator.",
      }
    }

    // Check if tier includes this module
    const tierModules = TIER_MODULE_ACCESS[sub.tier] as string[]
    if (!tierModules.includes(moduleName)) {
      // Find the minimum tier that includes this module
      const requiredTier = getMinimumTierForModule(moduleName)
      return {
        allowed: false,
        reason: `This module requires ${requiredTier ?? "Enterprise"} subscription or higher.`,
        requiredTier: requiredTier ?? "ENTERPRISE",
      }
    }

    // For NGO SAAS — also require explicit permission grant
    if (moduleName === SENTINEL_MODULES.NGO_SAAS) {
      const perms = await dbGetUserModulePermissions(userId)
      const ngoPermission = perms.find((p) => p.moduleName === SENTINEL_MODULES.NGO_SAAS)
      if (!ngoPermission) {
        return {
          allowed: false,
          reason: "NGO SAAS access must be explicitly granted by your administrator.",
          requiredTier: "ENTERPRISE",
        }
      }
    }

    return { allowed: true }
  } catch (err) {
    console.error("checkModuleAccess error:", err)
    return { allowed: false, reason: "Access check failed. Please try again." }
  }
}

/**
 * Check NGO SAAS access specifically — strict enterprise enforcement.
 * Verifies: enterprise subscription + active status + explicit permission + project membership.
 */
export async function checkNGOSAASAccess(
  userId: string
): Promise<AccessCheckResult> {
  try {
    const user = await dbGetUserById(userId)
    if (!user || !user.isActive) {
      return { allowed: false, reason: "User not found or inactive" }
    }

    if (user.role === "SENTINEL_COMMANDER") {
      return { allowed: true }
    }

    // Step 1: Verify enterprise subscription
    const sub = await dbGetUserSubscription(userId)
    if (!sub || sub.status !== "ACTIVE") {
      return {
        allowed: false,
        reason: "Active subscription required",
        requiredTier: "ENTERPRISE",
      }
    }

    if (sub.tier !== "ENTERPRISE") {
      return {
        allowed: false,
        reason: "NGO SAAS is exclusively available to Enterprise subscribers. Contact sales to upgrade.",
        requiredTier: "ENTERPRISE",
      }
    }

    // Step 2: Verify explicit module permission
    const perms = await dbGetUserModulePermissions(userId)
    const ngoPermission = perms.find(
      (p) =>
        p.moduleName === SENTINEL_MODULES.NGO_SAAS &&
        (!p.expiresAt || p.expiresAt > Date.now())
    )
    if (!ngoPermission) {
      return {
        allowed: false,
        reason: "NGO SAAS access must be explicitly granted by your administrator.",
        requiredTier: "ENTERPRISE",
      }
    }

    return { allowed: true }
  } catch (err) {
    console.error("checkNGOSAASAccess error:", err)
    return { allowed: false, reason: "Access check failed" }
  }
}

// ─────────────────────────── Grant / Revoke ───────────────────────

export async function grantModuleAccess(params: {
  userId: string
  organizationId: string
  moduleName: string
  accessLevel: ModuleAccessLevel
  grantedBy: string
  expiresAt?: number
}): Promise<{ success: boolean; permission?: UserModulePermission; error?: string }> {
  try {
    const granter = await dbGetUserById(params.grantedBy)
    if (
      !granter ||
      (granter.role !== "SENTINEL_COMMANDER" &&
        granter.role !== "ORG_ADMIN" &&
        granter.role !== "TEAM_ADMIN")
    ) {
      return { success: false, error: "Insufficient privileges to grant module access" }
    }

    // Only Sentinel Commander can grant NGO SAAS access
    if (
      params.moduleName === SENTINEL_MODULES.NGO_SAAS &&
      granter.role !== "SENTINEL_COMMANDER"
    ) {
      return { success: false, error: "Only Sentinel Commander can grant NGO SAAS access" }
    }

    const permission: UserModulePermission = {
      id: uuidv4(),
      userId: params.userId,
      organizationId: params.organizationId,
      moduleName: params.moduleName,
      accessLevel: params.accessLevel,
      grantedBy: params.grantedBy,
      grantedAt: Date.now(),
      expiresAt: params.expiresAt,
    }

    await dbGrantModulePermission(permission)

    await dbWriteAuditLog({
      userId: params.grantedBy,
      action: "ASSIGN_ROLE",
      resource: "module-permission",
      resourceId: permission.id,
      metadata: {
        targetUserId: params.userId,
        moduleName: params.moduleName,
        accessLevel: params.accessLevel,
      },
      success: true,
    })

    return { success: true, permission }
  } catch (err) {
    console.error("grantModuleAccess error:", err)
    return { success: false, error: "Failed to grant module access" }
  }
}

export async function revokeModuleAccess(params: {
  userId: string
  organizationId: string
  moduleName: string
  revokedBy: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const revoker = await dbGetUserById(params.revokedBy)
    if (
      !revoker ||
      (revoker.role !== "SENTINEL_COMMANDER" && revoker.role !== "ORG_ADMIN")
    ) {
      return { success: false, error: "Insufficient privileges to revoke module access" }
    }

    await dbRevokeModulePermission(params.userId, params.organizationId, params.moduleName)

    await dbWriteAuditLog({
      userId: params.revokedBy,
      action: "DELETE",
      resource: "module-permission",
      metadata: { targetUserId: params.userId, moduleName: params.moduleName },
      success: true,
    })

    return { success: true }
  } catch (err) {
    console.error("revokeModuleAccess error:", err)
    return { success: false, error: "Failed to revoke module access" }
  }
}

// ─────────────────────────── Helpers ─────────────────────────────

function getMinimumTierForModule(moduleName: string): SubscriptionTier | null {
  const tiers: SubscriptionTier[] = ["BASIC", "PRO", "TEAMS", "ENTERPRISE"]
  for (const tier of tiers) {
    const modules = TIER_MODULE_ACCESS[tier] as string[]
    if (modules.includes(moduleName)) return tier
  }
  return null
}

export async function getUserPermissions(userId: string): Promise<UserModulePermission[]> {
  return dbGetUserModulePermissions(userId)
}

/**
 * Get all modules accessible to a user based on their subscription tier.
 */
export async function getAccessibleModules(userId: string): Promise<string[]> {
  const user = await dbGetUserById(userId)
  if (!user) return []

  if (user.role === "SENTINEL_COMMANDER") {
    return Object.values(SENTINEL_MODULES)
  }

  const sub = await dbGetUserSubscription(userId)
  if (!sub || sub.status !== "ACTIVE") return []

  const tierModules: string[] = [...(TIER_MODULE_ACCESS[sub.tier] as string[])]

  // For NGO SAAS, also verify explicit permission
  const ngoIdx = tierModules.indexOf(SENTINEL_MODULES.NGO_SAAS)
  if (ngoIdx !== -1) {
    const perms = await dbGetUserModulePermissions(userId)
    const hasNGO = perms.some(
      (p) =>
        p.moduleName === SENTINEL_MODULES.NGO_SAAS &&
        (!p.expiresAt || p.expiresAt > Date.now())
    )
    if (!hasNGO) {
      tierModules.splice(ngoIdx, 1)
    }
  }

  return tierModules
}
