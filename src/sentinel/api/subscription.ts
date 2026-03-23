/**
 * Sentinel SAAS - Subscription API
 *
 * Manages subscription assignment, upgrade requests, and tier management.
 * The Sentinel Commander is the only user who can create/assign subscriptions.
 */

import { v4 as uuidv4 } from "uuid"
import { dbGetUserById, dbAssignSubscription, dbGetUserSubscription, dbWriteAuditLog, kvGet, kvSet } from "./db"
import { SENTINEL_KV_KEYS, SUBSCRIPTION_DEFINITIONS } from "../config"
import type {
  UserSubscription,
  SentinelSubscription,
  SubscriptionTier,
  SubscriptionStatus,
  SentinelUser,
} from "../types/index"

// ─────────────────────────── Subscription Catalog ────────────────

export async function getSubscriptionCatalog(): Promise<SentinelSubscription[]> {
  const now = Date.now()
  return (Object.entries(SUBSCRIPTION_DEFINITIONS) as [SubscriptionTier, typeof SUBSCRIPTION_DEFINITIONS[SubscriptionTier]][]).map(
    ([tier, def]) => ({
      id: `sub-${tier.toLowerCase()}`,
      tier,
      description: def.description,
      pricingMonthly: def.pricingMonthly,
      pricingYearly: def.pricingYearly,
      features: def.features,
      maxMembers: def.maxMembers,
      includesNGOSAAS: def.includesNGOSAAS,
      requiresApproval: def.requiresApproval,
      status: "ACTIVE" as const,
      createdAt: now,
      updatedAt: now,
    })
  )
}

// ─────────────────────────── Assign Subscription ─────────────────

export async function assignSubscription(params: {
  userId: string
  tier: SubscriptionTier
  assignedBy: string
  organizationId: string
  expiresAt?: number
}): Promise<{ success: boolean; subscription?: UserSubscription; error?: string }> {
  try {
    // Only Sentinel Commander can assign subscriptions
    const performer = await dbGetUserById(params.assignedBy)
    if (!performer || performer.role !== "SENTINEL_COMMANDER") {
      return { success: false, error: "Only Sentinel Commander can assign subscriptions" }
    }

    const targetUser = await dbGetUserById(params.userId)
    if (!targetUser) {
      return { success: false, error: "Target user not found" }
    }

    const def = SUBSCRIPTION_DEFINITIONS[params.tier]

    const subscription: UserSubscription = {
      id: uuidv4(),
      userId: params.userId,
      subscriptionId: `sub-${params.tier.toLowerCase()}`,
      tier: params.tier,
      status: def.requiresApproval ? "PENDING" : "ACTIVE",
      assignedBy: params.assignedBy,
      assignedAt: Date.now(),
      expiresAt: params.expiresAt ?? null,
      organizationId: params.organizationId,
      autoRenew: true,
    }

    await dbAssignSubscription(subscription)

    await dbWriteAuditLog({
      userId: params.assignedBy,
      action: "ASSIGN_SUBSCRIPTION",
      resource: "subscription",
      resourceId: subscription.id,
      metadata: { userId: params.userId, tier: params.tier },
      success: true,
    })

    return { success: true, subscription }
  } catch (err) {
    console.error("assignSubscription error:", err)
    return { success: false, error: "Failed to assign subscription" }
  }
}

// ─────────────────────────── Get User Subscription ───────────────

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  return dbGetUserSubscription(userId)
}

// ─────────────────────────── Update Subscription Status ──────────

export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const performer = await dbGetUserById(updatedBy)
    if (!performer || performer.role !== "SENTINEL_COMMANDER") {
      return { success: false, error: "Only Sentinel Commander can update subscriptions" }
    }

    // Update in KV
    const subs = await kvGet<Record<string, UserSubscription>>(SENTINEL_KV_KEYS.userSubscriptions) ?? {}
    const sub = Object.values(subs).find((s) => s.id === subscriptionId)
    if (!sub) {
      return { success: false, error: "Subscription not found" }
    }

    sub.status = status
    await kvSet(SENTINEL_KV_KEYS.userSubscriptions, subs)

    await dbWriteAuditLog({
      userId: updatedBy,
      action: "UPDATE",
      resource: "subscription",
      resourceId: subscriptionId,
      metadata: { status },
      success: true,
    })

    return { success: true }
  } catch (err) {
    console.error("updateSubscriptionStatus error:", err)
    return { success: false, error: "Failed to update subscription" }
  }
}

// ─────────────────────────── Upgrade Request ─────────────────────

export interface UpgradeRequest {
  id: string
  userId: string
  userEmail: string
  userName: string
  fromTier?: SubscriptionTier
  toTier: SubscriptionTier
  status: "PENDING" | "APPROVED" | "REJECTED"
  message?: string
  reviewedBy?: string
  reviewedAt?: number
  createdAt: number
}

export async function requestSubscriptionUpgrade(params: {
  userId: string
  toTier: SubscriptionTier
  message?: string
}): Promise<{ success: boolean; request?: UpgradeRequest; error?: string }> {
  try {
    const user = await dbGetUserById(params.userId)
    if (!user) {
      return { success: false, error: "User not found" }
    }

    const currentSub = await getUserSubscription(params.userId)

    const request: UpgradeRequest = {
      id: uuidv4(),
      userId: params.userId,
      userEmail: user.email,
      userName: user.fullName,
      fromTier: currentSub?.tier,
      toTier: params.toTier,
      status: "PENDING",
      message: params.message,
      createdAt: Date.now(),
    }

    const requests = await kvGet<Record<string, UpgradeRequest>>("sentinel-upgrade-requests") ?? {}
    requests[request.id] = request
    await kvSet("sentinel-upgrade-requests", requests)

    return { success: true, request }
  } catch (err) {
    console.error("requestSubscriptionUpgrade error:", err)
    return { success: false, error: "Failed to submit upgrade request" }
  }
}

export async function getUpgradeRequests(): Promise<UpgradeRequest[]> {
  const requests = await kvGet<Record<string, UpgradeRequest>>("sentinel-upgrade-requests") ?? {}
  return Object.values(requests).sort((a, b) => b.createdAt - a.createdAt)
}

export async function reviewUpgradeRequest(
  requestId: string,
  action: "APPROVED" | "REJECTED",
  reviewerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const reviewer = await dbGetUserById(reviewerId)
    if (!reviewer || reviewer.role !== "SENTINEL_COMMANDER") {
      return { success: false, error: "Only Sentinel Commander can review upgrade requests" }
    }

    const requests = await kvGet<Record<string, UpgradeRequest>>("sentinel-upgrade-requests") ?? {}
    const request = requests[requestId]
    if (!request) {
      return { success: false, error: "Request not found" }
    }

    request.status = action
    request.reviewedBy = reviewerId
    request.reviewedAt = Date.now()
    await kvSet("sentinel-upgrade-requests", requests)

    // If approved, assign the subscription
    if (action === "APPROVED") {
      const user = await dbGetUserById(request.userId)
      if (user?.organizationId) {
        await assignSubscription({
          userId: request.userId,
          tier: request.toTier,
          assignedBy: reviewerId,
          organizationId: user.organizationId,
        })
      }
    }

    return { success: true }
  } catch (err) {
    console.error("reviewUpgradeRequest error:", err)
    return { success: false, error: "Failed to review request" }
  }
}

// ─────────────────────────── List All User Subscriptions ─────────

export async function listAllSubscriptions(): Promise<(UserSubscription & { user?: SentinelUser })[]> {
  const subs = await kvGet<Record<string, UserSubscription>>(SENTINEL_KV_KEYS.userSubscriptions) ?? {}
  return Object.values(subs).sort((a, b) => b.assignedAt - a.assignedAt)
}
