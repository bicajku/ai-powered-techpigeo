import { UserProfile, NGOAccessLevel } from "@/types"
import { ensureUserSubscription, getDefaultSubscription } from "@/lib/subscription"
import { getSafeKVClient } from "@/lib/spark-shim"
import { createOrganizationMember } from "@/lib/org-members"
import { syncMemberToNGOTeam, removeMemberFromNGOTeam } from "@/lib/ngo-team"

/**
 * Enterprise Subscription & Team Access Management
 * Manages enterprise plan tiers, team member roles, and granular access control
 */

export type EnterpriseRole = "owner" | "admin" | "contributor" | "viewer"

export interface EnterpriseTeamMember {
  id: string
  email: string
  fullName: string
  role: EnterpriseRole
  ngoAccessLevel?: NGOAccessLevel
  moduleAccess?: Array<"strategy" | "ideas" | "review" | "humanizer">
  individualProLicense?: boolean
  addedAt: number
  lastActiveAt: number
}

export interface EnterpriseCreditUsageEntry {
  id: string
  organizationId: string
  actorUserId: string
  actorEmail: string
  chargedToUserId: string
  module: "review" | "humanizer"
  credits: number
  reason: string
  createdAt: number
}

export interface EnterpriseSubscription {
  organizationId: string
  plan: "starter" | "professional" | "enterprise"
  tier: "BASIC" | "PRO" | "TEAMS" | "ENTERPRISE"
  ownerId: string
  teamMembers: EnterpriseTeamMember[]
  features: {
    maxTeamMembers: number
    canAccessNGOSaaS: boolean
    canCustomizeBranding: boolean
    canManageRBAC: boolean
    canAuditLogs: boolean
    advancedAnalytics: boolean
  }
  billingCycle: "monthly" | "annual"
  renewalDate: number
  isActive: boolean
  createdAt: number
  updatedAt: number
}

const ENTERPRISE_SUBSCRIPTIONS_KEY = "enterprise-subscriptions"
const USERS_STORAGE_KEY = "platform-users"
const USER_CREDENTIALS_KEY = "user-credentials"
const ENTERPRISE_CREDIT_USAGE_KEY = "enterprise-credit-usage"

interface StoredCredential {
  email: string
  passwordHash: string
  userId: string
}

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

async function postBackend(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> | null }> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    try {
      const csrfMatch = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("__csrf="))
      if (csrfMatch) {
        headers["X-CSRF-Token"] = csrfMatch.slice("__csrf=".length)
      }
    } catch {
      // Cookie access unavailable
    }

    const res = await fetch(`${getBackendBaseUrl()}${path}`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0 }
  }
}

async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const salted = `sentinel:${text}:v2`
  const data = encoder.encode(salted)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

function planFromTier(tier: EnterpriseSubscription["tier"]): "basic" | "pro" | "team" | "enterprise" {
  if (tier === "ENTERPRISE") return "enterprise"
  if (tier === "TEAMS") return "team"
  if (tier === "PRO") return "pro"
  return "basic"
}

function planRank(plan: "basic" | "pro" | "team" | "enterprise"): number {
  if (plan === "enterprise") return 4
  if (plan === "team") return 3
  if (plan === "pro") return 2
  return 1
}

function maxPlan(
  left: "basic" | "pro" | "team" | "enterprise",
  right: "basic" | "pro" | "team" | "enterprise"
): "basic" | "pro" | "team" | "enterprise" {
  return planRank(left) >= planRank(right) ? left : right
}

function findStoredUserRecord(
  users: Record<string, UserProfile>,
  userId: string,
  email?: string
): { key: string; user: UserProfile } | null {
  if (users[userId]) {
    return { key: userId, user: users[userId] }
  }

  const byId = Object.entries(users).find(([, candidate]) => candidate.id === userId)
  if (byId) {
    return { key: byId[0], user: byId[1] }
  }

  if (!email) return null

  const normalizedEmail = email.toLowerCase()
  const byEmail = Object.entries(users).find(([, candidate]) => candidate.email.toLowerCase() === normalizedEmail)
  if (byEmail) {
    return { key: byEmail[0], user: byEmail[1] }
  }

  return null
}

async function syncMemberSubscription(
  userId: string,
  subscription: EnterpriseSubscription,
  ngoAccessLevel?: NGOAccessLevel,
  role?: EnterpriseRole,
  moduleAccess?: Array<"strategy" | "ideas" | "review" | "humanizer">,
  individualProLicense?: boolean
): Promise<void> {
  const kv = getSafeKVClient()
  const users = (await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
  const member = subscription.teamMembers.find((teamMember) => teamMember.id === userId)
  const storedRecord = findStoredUserRecord(users, userId, member?.email)

  const existingUser = storedRecord?.user || (member
    ? {
        id: userId,
        email: member.email,
        fullName: member.fullName,
        role: "client",
        createdAt: member.addedAt,
        lastLoginAt: member.lastActiveAt,
      }
    : null)

  if (!existingUser) return

  const safeUser = ensureUserSubscription(existingUser)
  const existingSub = safeUser.subscription || getDefaultSubscription()
  const targetPlan = planFromTier(subscription.tier)
  const nextPlan = maxPlan(existingSub.plan, targetPlan)

  const storageKey = storedRecord?.key || userId
  users[storageKey] = {
    ...safeUser,
    id: userId,
    subscription: {
      ...existingSub,
      plan: nextPlan,
      status: "active",
      hasNgoModuleAccess: subscription.features.canAccessNGOSaaS && !!ngoAccessLevel,
      ngoAccessLevel: subscription.features.canAccessNGOSaaS ? ngoAccessLevel : undefined,
      ngoTeamAdminId: subscription.features.canAccessNGOSaaS && ngoAccessLevel ? subscription.ownerId : undefined,
      enterpriseOrganizationId: subscription.organizationId,
      enterpriseRole: role,
      enterpriseModuleAccess: moduleAccess,
      individualProLicense: Boolean(individualProLicense),
      updatedAt: Date.now(),
    },
  }

  await kv.set(USERS_STORAGE_KEY, users)
}

/**
 * Get enterprise subscription for an organization
 */
export async function getEnterpriseSubscription(
  organizationId: string
): Promise<EnterpriseSubscription | null> {
  try {
    if (typeof spark !== "undefined" && spark.kv?.get) {
      const result = await spark.kv.get<EnterpriseSubscription>(`${ENTERPRISE_SUBSCRIPTIONS_KEY}-${organizationId}`)
      return result ?? null
    }
  } catch (e) {
    console.warn("[Enterprise] spark.kv.get failed:", e)
  }
  try {
    const raw = localStorage.getItem(`${ENTERPRISE_SUBSCRIPTIONS_KEY}-${organizationId}`)
    return raw ? (JSON.parse(raw) as EnterpriseSubscription) : null
  } catch (e) {
    console.warn("[Enterprise] localStorage.getItem failed:", e)
    return null
  }
}

/**
 * Save enterprise subscription
 */
export async function saveEnterpriseSubscription(sub: EnterpriseSubscription): Promise<void> {
  try {
    if (typeof spark !== "undefined" && spark.kv?.set) {
      await spark.kv.set(`${ENTERPRISE_SUBSCRIPTIONS_KEY}-${sub.organizationId}`, sub)
    }
  } catch (e) {
    console.warn("[Enterprise] spark.kv.set failed:", e)
  }
  try {
    localStorage.setItem(`${ENTERPRISE_SUBSCRIPTIONS_KEY}-${sub.organizationId}`, JSON.stringify(sub))
  } catch (e) {
    console.warn("[Enterprise] localStorage.setItem failed:", e)
  }
}

/**
 * Check if user has enterprise access
 */
export function hasEnterpriseAccess(user: UserProfile, organizationId?: string): boolean {
  void organizationId
  if (user.role === "admin") return true
  const sub = user.subscription
  if (!sub) return false
  return sub.plan === "enterprise" && sub.status === "active"
}

/**
 * Check if user can manage enterprise (owner or admin role)
 */
export function canManageEnterprise(user: UserProfile, role?: EnterpriseRole): boolean {
  if (user.role === "admin") return true
  return role === "owner" || role === "admin"
}

/**
 * Check if user can modify content (owner, admin, or contributor)
 */
export function canModifyContent(role: EnterpriseRole): boolean {
  return role === "owner" || role === "admin" || role === "contributor"
}

/**
 * Check if user can grant/revoke access
 */
export function canGrantAccess(role: EnterpriseRole): boolean {
  return role === "owner" || role === "admin"
}

/**
 * Add team member to enterprise
 */
export async function addEnterpriseTeamMember(
  organizationId: string,
  email: string,
  fullName: string,
  role: EnterpriseRole,
  password?: string,
  ngoAccessLevel?: NGOAccessLevel
): Promise<{ success: boolean; member?: EnterpriseTeamMember; error?: string; warning?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    if (sub.teamMembers.length >= sub.features.maxTeamMembers) {
      return { success: false, error: `Team member limit (${sub.features.maxTeamMembers}) reached` }
    }

    const normalizedEmail = email.toLowerCase().trim()
    if (sub.teamMembers.some((m) => m.email === normalizedEmail)) {
      return { success: false, error: "User is already a team member" }
    }

    const kv = getSafeKVClient()
    const users = (await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const credentials = (await kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY)) || {}

    const existingByCredential = credentials[normalizedEmail]
    const existingByEmail = Object.values(users).find((u) => u.email.toLowerCase() === normalizedEmail)

    let userId = existingByCredential?.userId || existingByEmail?.id
    let warning: string | undefined

    if (!userId) {
      if (!password || password.trim().length < 8) {
        return { success: false, error: "Password (min 8 chars) is required for new members" }
      }

      const backendCreate = await createOrganizationMember({
        email: normalizedEmail,
        fullName,
        password: password.trim(),
        role,
      })

      if (!backendCreate.success) {
        return {
          success: false,
          error: backendCreate.error || "Failed to create backend account for member",
        }
      }

      const backendUser = backendCreate.member as Partial<UserProfile> | undefined
      userId = typeof backendUser?.id === "string" ? backendUser.id : `ent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const passwordHash = await simpleHash(password.trim())
      const targetPlan = planFromTier(sub.tier)

      users[userId] = {
        id: userId,
        email: normalizedEmail,
        fullName,
        role: "client",
        subscription: {
          ...getDefaultSubscription(),
          plan: targetPlan,
          status: "active",
          hasNgoModuleAccess: sub.features.canAccessNGOSaaS && !!ngoAccessLevel,
          ngoAccessLevel: sub.features.canAccessNGOSaaS ? ngoAccessLevel : undefined,
          ngoTeamAdminId: sub.features.canAccessNGOSaaS && ngoAccessLevel ? sub.ownerId : undefined,
          enterpriseOrganizationId: sub.organizationId,
          enterpriseRole: role,
          enterpriseModuleAccess: ["strategy", "ideas"],
          individualProLicense: false,
          updatedAt: Date.now(),
        },
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }

      credentials[normalizedEmail] = {
        email: normalizedEmail,
        passwordHash,
        userId,
      }

      await kv.set(USERS_STORAGE_KEY, users)
      await kv.set(USER_CREDENTIALS_KEY, credentials)
    } else {
      const existing = users[userId]
      if (existing) {
        await syncMemberSubscription(userId, sub, ngoAccessLevel)
      }

      if (password && password.trim().length >= 8) {
        const registerResult = await postBackend("/api/auth/register", {
          email: normalizedEmail,
          password: password.trim(),
          fullName,
        })

        if (!registerResult.ok && registerResult.status !== 409) {
          return {
            success: false,
            error: (registerResult.data?.error as string) || "Failed to create backend account for member",
          }
        }
      }

      if (!existingByCredential) {
        if (password && password.trim().length >= 8) {
          const passwordHash = await simpleHash(password.trim())
          credentials[normalizedEmail] = {
            email: normalizedEmail,
            passwordHash,
            userId,
          }
          await kv.set(USER_CREDENTIALS_KEY, credentials)
        } else {
          warning = "Member added, but no local password was set. Use Admin password reset or re-add with password."
        }
      }
    }

    const member: EnterpriseTeamMember = {
      id: userId,
      email: normalizedEmail,
      fullName,
      role,
      ngoAccessLevel,
      moduleAccess: ["strategy", "ideas"],
      individualProLicense: false,
      addedAt: Date.now(),
      lastActiveAt: Date.now(),
    }

    await syncMemberSubscription(
      userId,
      sub,
      ngoAccessLevel,
      role,
      member.moduleAccess,
      member.individualProLicense
    )

    sub.teamMembers.push(member)
    sub.updatedAt = Date.now()
    await saveEnterpriseSubscription(sub)

    // If the new member was granted NGO access, sync them to the NGO team list
    if (ngoAccessLevel) {
      await syncMemberToNGOTeam(sub.ownerId, {
        id: member.id,
        email: member.email,
        fullName: member.fullName,
        accessLevel: ngoAccessLevel,
      })
    }

    return { success: true, member, warning }
  } catch (error) {
    console.error("Failed to add team member:", error)
    return { success: false, error: "Failed to add team member" }
  }
}

/**
 * Update team member role
 */
export async function updateTeamMemberRole(
  organizationId: string,
  memberId: string,
  newRole: EnterpriseRole
): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    const memberIndex = sub.teamMembers.findIndex((m) => m.id === memberId)
    if (memberIndex === -1) return { success: false, error: "Team member not found" }

    sub.teamMembers[memberIndex].role = newRole
    sub.updatedAt = Date.now()
    await saveEnterpriseSubscription(sub)
    await syncMemberSubscription(
      sub.teamMembers[memberIndex].id,
      sub,
      sub.teamMembers[memberIndex].ngoAccessLevel,
      sub.teamMembers[memberIndex].role,
      sub.teamMembers[memberIndex].moduleAccess,
      sub.teamMembers[memberIndex].individualProLicense
    )

    return { success: true }
  } catch (error) {
    console.error("Failed to update team member role:", error)
    return { success: false, error: "Failed to update team member role" }
  }
}

/**
 * Remove team member
 */
export async function removeEnterpriseTeamMember(
  organizationId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    const removedMember = sub.teamMembers.find((m) => m.id === memberId)
    const initialLength = sub.teamMembers.length
    sub.teamMembers = sub.teamMembers.filter((m) => m.id !== memberId)

    if (sub.teamMembers.length === initialLength) {
      return { success: false, error: "Team member not found" }
    }

    sub.updatedAt = Date.now()
    await saveEnterpriseSubscription(sub)

    // If the removed member had NGO access, remove them from the NGO team list
    if (removedMember?.ngoAccessLevel) {
      await removeMemberFromNGOTeam(sub.ownerId, memberId)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to remove team member:", error)
    return { success: false, error: "Failed to remove team member" }
  }
}

/**
 * Grant NGO-SAAS access to team member
 */
export async function grantNGOAccess(
  organizationId: string,
  memberId: string,
  accessLevel: NGOAccessLevel
): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    if (!sub.features.canAccessNGOSaaS) {
      return { success: false, error: "NGO-SAAS not available on this plan" }
    }

    const member = sub.teamMembers.find((m) => m.id === memberId)
    if (!member) return { success: false, error: "Team member not found" }

    member.ngoAccessLevel = accessLevel
    sub.updatedAt = Date.now()
    await saveEnterpriseSubscription(sub)
    await syncMemberSubscription(
      member.id,
      sub,
      accessLevel,
      member.role,
      member.moduleAccess,
      member.individualProLicense
    )

    // Sync to NGO team list so the member appears in the NGO-SAAS Team tab
    await syncMemberToNGOTeam(sub.ownerId, {
      id: member.id,
      email: member.email,
      fullName: member.fullName,
      accessLevel,
    })

    return { success: true }
  } catch (error) {
    console.error("Failed to grant NGO access:", error)
    return { success: false, error: "Failed to grant NGO access" }
  }
}

/**
 * Revoke NGO-SAAS access
 */
export async function revokeNGOAccess(
  organizationId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    const member = sub.teamMembers.find((m) => m.id === memberId)
    if (!member) return { success: false, error: "Team member not found" }

    member.ngoAccessLevel = undefined
    sub.updatedAt = Date.now()
    await saveEnterpriseSubscription(sub)
    await syncMemberSubscription(
      member.id,
      sub,
      undefined,
      member.role,
      member.moduleAccess,
      member.individualProLicense
    )

    // Remove from NGO team list so the member disappears from NGO-SAAS Team tab
    await removeMemberFromNGOTeam(sub.ownerId, memberId)

    return { success: true }
  } catch (error) {
    console.error("Failed to revoke NGO access:", error)
    return { success: false, error: "Failed to revoke NGO access" }
  }
}

/**
 * Get feature set for enterprise tier
 */
export function getEnterpriseFeatures(tier: "BASIC" | "PRO" | "TEAMS" | "ENTERPRISE") {
  switch (tier) {
    case "BASIC":
      return {
        maxTeamMembers: 1,
        canAccessNGOSaaS: false,
        canCustomizeBranding: false,
        canManageRBAC: false,
        canAuditLogs: false,
        advancedAnalytics: false,
      }
    case "PRO":
      return {
        maxTeamMembers: 5,
        canAccessNGOSaaS: false,
        canCustomizeBranding: false,
        canManageRBAC: false,
        canAuditLogs: false,
        advancedAnalytics: false,
      }
    case "TEAMS":
      return {
        maxTeamMembers: 25,
        canAccessNGOSaaS: false,
        canCustomizeBranding: true,
        canManageRBAC: true,
        canAuditLogs: false,
        advancedAnalytics: false,
      }
    case "ENTERPRISE":
      return {
        maxTeamMembers: 500,
        canAccessNGOSaaS: true,
        canCustomizeBranding: true,
        canManageRBAC: true,
        canAuditLogs: true,
        advancedAnalytics: true,
      }
  }
}

export async function reconcileEnterpriseMemberEntitlements(
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    for (const member of sub.teamMembers) {
      await syncMemberSubscription(
        member.id,
        sub,
        member.ngoAccessLevel,
        member.role,
        member.moduleAccess,
        member.individualProLicense
      )
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to reconcile enterprise member entitlements:", error)
    return { success: false, error: "Failed to reconcile enterprise member entitlements" }
  }
}

export async function updateEnterpriseMemberModuleAccess(
  organizationId: string,
  memberId: string,
  moduleAccess: Array<"strategy" | "ideas" | "review" | "humanizer">
): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    const member = sub.teamMembers.find((m) => m.id === memberId)
    if (!member) return { success: false, error: "Team member not found" }

    const nextModules = Array.from(new Set(moduleAccess))
    if (!nextModules.includes("strategy") || !nextModules.includes("ideas")) {
      return { success: false, error: "Strategy and Ideas modules are mandatory" }
    }

    member.moduleAccess = nextModules
    sub.updatedAt = Date.now()
    await saveEnterpriseSubscription(sub)
    await syncMemberSubscription(
      member.id,
      sub,
      member.ngoAccessLevel,
      member.role,
      member.moduleAccess,
      member.individualProLicense
    )
    return { success: true }
  } catch (error) {
    console.error("Failed to update member module access:", error)
    return { success: false, error: "Failed to update module access" }
  }
}

export async function updateEnterpriseMemberIndividualProLicense(
  organizationId: string,
  memberId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getEnterpriseSubscription(organizationId)
    if (!sub) return { success: false, error: "Enterprise subscription not found" }

    const member = sub.teamMembers.find((m) => m.id === memberId)
    if (!member) return { success: false, error: "Team member not found" }

    member.individualProLicense = enabled
    sub.updatedAt = Date.now()
    await saveEnterpriseSubscription(sub)
    await syncMemberSubscription(
      member.id,
      sub,
      member.ngoAccessLevel,
      member.role,
      member.moduleAccess,
      member.individualProLicense
    )
    return { success: true }
  } catch (error) {
    console.error("Failed to update individual Pro license:", error)
    return { success: false, error: "Failed to update individual Pro license" }
  }
}

export async function logEnterpriseCreditUsage(input: {
  organizationId: string
  actorUserId: string
  actorEmail: string
  chargedToUserId: string
  module: "review" | "humanizer"
  credits: number
  reason: string
}): Promise<void> {
  if (input.credits <= 0) return
  const kv = getSafeKVClient()
  const key = `${ENTERPRISE_CREDIT_USAGE_KEY}-${input.organizationId}`
  const entries = (await kv.get<EnterpriseCreditUsageEntry[]>(key)) || []
  entries.unshift({
    id: `ecu_${crypto.randomUUID()}`,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    chargedToUserId: input.chargedToUserId,
    module: input.module,
    credits: input.credits,
    reason: input.reason,
    createdAt: Date.now(),
  })
  await kv.set(key, entries.slice(0, 2000))
}

export async function listEnterpriseCreditUsage(
  organizationId: string,
  userId?: string
): Promise<EnterpriseCreditUsageEntry[]> {
  const kv = getSafeKVClient()
  const key = `${ENTERPRISE_CREDIT_USAGE_KEY}-${organizationId}`
  const entries = (await kv.get<EnterpriseCreditUsageEntry[]>(key)) || []
  if (!userId) return entries
  return entries.filter((entry) => entry.actorUserId === userId || entry.chargedToUserId === userId)
}

export function resolveEnterpriseOwnerId(sub: EnterpriseSubscription, memberUser?: UserProfile): string {
  if (sub.ownerId) return sub.ownerId
  if (memberUser?.subscription?.ngoTeamAdminId) return memberUser.subscription.ngoTeamAdminId
  return ""
}
