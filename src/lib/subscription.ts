import { SubscriptionInfo, SubscriptionPlan, SubscriptionRequest, TrialInfo, UserProfile } from "@/types"
import { getSafeKVClient } from "@/lib/spark-shim"
import { logEnterpriseCreditUsage } from "@/lib/enterprise-subscription"

const USERS_STORAGE_KEY = "platform-users"
const SUBSCRIPTION_REQUESTS_KEY = "subscription-requests"

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname.toLowerCase()
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
}

async function postBackend(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> | null }> {
  try {
    const token = typeof localStorage !== "undefined"
      ? localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
      : null

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

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

type ChargeableModule = "review" | "humanizer" | "idea-canvas" | "idea-pitch"

// INVARIANT[idea-credit-costs]: Business Canvas = 2 credits, Pitch Deck = 4 credits.
// These values are user-facing pricing locked by product. See /memories/repo/policies.md.
export const IDEA_CANVAS_CREDIT_COST = 2
export const IDEA_PITCH_CREDIT_COST = 4

interface CreditHistoryEntry {
  id: string
  userId: string
  module: ChargeableModule
  amount: number
  chargedToUserId: string
  chargedToEmail: string
  reason: string
  createdAt: number
}

const CREDIT_HISTORY_KEY = "credit-usage-history"

function hasModuleAccess(user: UserProfile, module: ChargeableModule): boolean {
  if (user.role === "admin" || user.role === "tester") return true
  const sub = user.subscription || getDefaultSubscription()
  if (sub.plan !== "enterprise") return true

  if (sub.individualProLicense) return true

  const modules = sub.enterpriseModuleAccess || ["strategy", "ideas"]
  // Idea-generation sub-modules are gated by the broader "ideas" module access.
  const required: "review" | "humanizer" | "ideas" =
    module === "idea-canvas" || module === "idea-pitch" ? "ideas" : module
  return modules.includes(required)
}

async function resolveCreditPayer(
  users: Record<string, UserProfile>,
  user: UserProfile,
): Promise<{ payer: UserProfile; actor: UserProfile; chargeToOrgId?: string }> {
  const actor = ensureUserSubscription(user)
  const sub = actor.subscription || getDefaultSubscription()

  if (actor.role === "admin") {
    return { payer: actor, actor }
  }

  if (sub.plan === "enterprise" && !sub.individualProLicense) {
    const ownerId = sub.ngoTeamAdminId
    if (ownerId && users[ownerId]) {
      return {
        payer: ensureUserSubscription(users[ownerId]),
        actor,
        chargeToOrgId: sub.enterpriseOrganizationId,
      }
    }
  }

  return { payer: actor, actor }
}

async function appendCreditHistory(entry: Omit<CreditHistoryEntry, "id" | "createdAt">): Promise<void> {
  const kv = getSafeKVClient()
  const entries = (await kv.get<CreditHistoryEntry[]>(`${CREDIT_HISTORY_KEY}-${entry.userId}`)) || []
  entries.unshift({
    id: `credit_${crypto.randomUUID()}`,
    createdAt: Date.now(),
    ...entry,
  })
  await kv.set(`${CREDIT_HISTORY_KEY}-${entry.userId}`, entries.slice(0, 2000))
}

async function chargeCredits(
  userId: string,
  creditsToConsume: number,
  module: ChargeableModule,
  reason: string,
): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
  if (creditsToConsume <= 0) {
    return { success: false, remainingCredits: 0, error: "Credit amount must be greater than zero" }
  }

  const kv = getSafeKVClient()
  const users = (await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
  const rawUser = users[userId]

  // Backend-first path: when the local KV mirror is missing (common for users
  // that authenticated against the backend without a stored client-side profile),
  // delegate the deduction to the backend which is the source of truth.
  if (!rawUser) {
    try {
      const res = await postBackend("/api/usage/consume-credits", {
        userId,
        amount: creditsToConsume,
        module,
        reason,
      })
      if (res.ok && res.data && typeof res.data.remainingCredits === "number") {
        return { success: true, remainingCredits: Number(res.data.remainingCredits) }
      }
      if (res.status === 402 || res.status === 403) {
        return {
          success: false,
          remainingCredits: Number(res.data?.remainingCredits ?? 0),
          error: (res.data?.error as string) || "Credit deduction rejected",
        }
      }
    } catch {
      // fallthrough
    }
    return { success: false, remainingCredits: 0, error: "Unable to deduct credits. Please try again." }
  }

  const user = ensureUserSubscription(rawUser)
  if (!hasModuleAccess(user, module)) {
    return {
      success: false,
      remainingCredits: user.subscription?.proCredits || 0,
      error: "This module is locked. Purchase individual Pro license to unlock it.",
    }
  }

  const { payer, actor, chargeToOrgId } = await resolveCreditPayer(users, user)
  const payerSub = payer.subscription || getDefaultSubscription()

  if (payer.role === "admin" || payer.role === "tester") {
    return { success: true, remainingCredits: payerSub.proCredits || 0 }
  }

  // Subscription must be active (or in grace) regardless of plan tier.
  if (!(payerSub.status === "active" || payerSub.status === "grace")) {
    return { success: false, remainingCredits: payerSub.proCredits || 0, error: "Subscription is not active" }
  }

  const currentCredits = Math.max(0, payerSub.proCredits || 0)
  if (currentCredits < creditsToConsume) {
    return { success: false, remainingCredits: currentCredits, error: "Insufficient credits. Upgrade or request a top-up to continue." }
  }

  // Persist the deduction to the backend so polling /api/auth/verify reflects the
  // new balance across devices/refreshes. Backend is the source of truth.
  let backendRemaining: number | null = null
  try {
    const res = await postBackend("/api/usage/consume-credits", {
      userId: payer.id,
      amount: creditsToConsume,
      module,
      reason,
    })
    if (res.ok && res.data && typeof res.data.remainingCredits === "number") {
      backendRemaining = Number(res.data.remainingCredits)
    } else if (res.status === 402 || res.status === 403) {
      // Backend rejected (insufficient/locked). Surface the error.
      return {
        success: false,
        remainingCredits: Number(res.data?.remainingCredits ?? currentCredits),
        error: (res.data?.error as string) || "Credit deduction rejected",
      }
    }
  } catch {
    // Backend unreachable — fall back to local-only deduction below.
  }

  const remainingCredits = backendRemaining ?? (currentCredits - creditsToConsume)
  users[payer.id] = {
    ...payer,
    subscription: {
      ...payerSub,
      proCredits: remainingCredits,
      updatedAt: Date.now(),
    },
  }
  await kv.set(USERS_STORAGE_KEY, users)

  await appendCreditHistory({
    userId: actor.id,
    module,
    amount: creditsToConsume,
    chargedToUserId: payer.id,
    chargedToEmail: payer.email,
    reason,
  })

  if (chargeToOrgId && (module === "review" || module === "humanizer")) {
    await logEnterpriseCreditUsage({
      organizationId: chargeToOrgId,
      actorUserId: actor.id,
      actorEmail: actor.email,
      chargedToUserId: payer.id,
      module,
      credits: creditsToConsume,
      reason,
    }).catch(() => null)
  }

  return { success: true, remainingCredits }
}

export async function getCreditUsageHistory(userId: string): Promise<CreditHistoryEntry[]> {
  const kv = getSafeKVClient()
  return (await kv.get<CreditHistoryEntry[]>(`${CREDIT_HISTORY_KEY}-${userId}`)) || []
}

export const PLAN_CONFIG = {
  basic: {
    name: "Basic",
    price: 0,
    priceLabel: "Free",
    creditsPerMonth: 0,
    maxExportsPerMonth: 3,
    features: [
      "AI Strategy Generation",
      "Idea Cooking & Canvas",
      "Pitch Deck Generation",
      "Dashboard & Timeline",
      "Save Strategies & Ideas",
      "3 exports/month",
    ],
  },
  pro: {
    name: "Pro",
    price: 20,
    priceLabel: "$20/month",
    creditsPerMonth: 50,
    maxExportsPerMonth: 30,
    features: [
      "Everything in Basic",
      "Document Review & Plagiarism Checker",
      "AI Humanize Module",
      "50 review credits/month",
      "Advanced review filters",
      "30 exports/month",
      "PDF/PPTX exports for all features",
    ],
  },
  team: {
    name: "Team / Enterprise",
    price: 50,
    priceLabel: "$50/month",
    creditsPerMonth: 200,
    maxExportsPerMonth: Infinity,
    features: [
      "Everything in Pro",
      "200 review credits/month",
      "Unlimited exports",
      "Priority AI processing",
      "Team collaboration",
      "Admin dashboard for team leads",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: 50,
    priceLabel: "$50/month",
    creditsPerMonth: 500,
    maxExportsPerMonth: Infinity,
    features: [
      "Everything in Team",
      "NGO-SAAS Module (exclusive)",
      "Enterprise Project Workspace",
      "Document & CSV Data Workspace",
      "AI Reporting Engine",
      "PDF / Word / Excel export with custom branding",
      "Organization branding settings",
      "500 review credits/month",
      "Dedicated support",
    ],
  },
} as const

export const TRIAL_CREDITS = 10
export const TRIAL_MAX_SUBMISSIONS = 3

export interface FeatureEntitlements {
  isPro: boolean
  isTeam: boolean
  isEnterprise: boolean
  isPaidPlan: boolean
  isSubscriptionActive: boolean
  canAccessReview: boolean
  canUseHumanizer: boolean
  canAccessNGOSaaS: boolean
  proCreditsRemaining: number
  isTrialActive: boolean
  trialSubmissionsRemaining: number
}

export function getDefaultSubscription(): SubscriptionInfo {
  return {
    plan: "basic",
    status: "active",
    proCredits: 0,
    updatedAt: Date.now(),
  }
}

export function ensureUserSubscription(user: UserProfile): UserProfile {
  if (user.subscription) {
    return user
  }

  return {
    ...user,
    subscription: getDefaultSubscription(),
  }
}

export function getFeatureEntitlements(user: UserProfile): FeatureEntitlements {
  const safeUser = ensureUserSubscription(user)
  const subscription = safeUser.subscription || getDefaultSubscription()
  const isAdmin = user.role === "admin"
  const isTester = user.role === "tester"

  const isPro = subscription.plan === "pro"
  const isTeam = subscription.plan === "team"
  const isEnterprise = subscription.plan === "enterprise"
  const isPaidPlan = isPro || isTeam || isEnterprise
  const isSubscriptionActive = isPaidPlan
    ? subscription.status === "active" || subscription.status === "grace"
    : true

  const credits = Math.max(0, subscription.proCredits || 0)

  const trial = subscription.trial
  const isTrialActive = !!(trial?.requested && !trial.exhausted && trial.submissionsUsed < trial.maxSubmissions)
  const trialSubmissionsRemaining = isTrialActive
    ? Math.max(0, (trial?.maxSubmissions || 0) - (trial?.submissionsUsed || 0))
    : 0

  // Review access: admin/tester always; OR active subscription with credits > 0 (any plan); OR active trial
  const canAccessReview = isAdmin || isTester || (isSubscriptionActive && credits > 0) || isTrialActive

  // Humanizer access: same rule — credits gate the feature regardless of plan tier
  const canUseHumanizer = isAdmin || isTester || (isSubscriptionActive && credits > 0) || isTrialActive

  // NGO SaaS: strictly admin OR enterprise + explicitly created by NGO admin (ngoTeamAdminId/ngoAccessLevel set)
  const canAccessNGOSaaS =
    isAdmin ||
    (isEnterprise && isSubscriptionActive && !!(subscription.ngoTeamAdminId && subscription.ngoAccessLevel))

  return {
    isPro,
    isTeam,
    isEnterprise,
    isPaidPlan,
    isSubscriptionActive,
    canAccessReview,
    canUseHumanizer,
    canAccessNGOSaaS,
    proCreditsRemaining: credits,
    isTrialActive,
    trialSubmissionsRemaining,
  }
}

export async function consumeReviewCredit(userId: string): Promise<{ success: boolean; remainingCredits: number; trialSubmissionsUsed?: number; error?: string }> {
  try {
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    // Backend-only user (no local KV mirror) — go straight through chargeCredits
    // which has its own backend-first fallback path.
    if (!user) {
      return await chargeCredits(userId, 1, "review", "Review check")
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()

    // Admin always allowed
    if (safeUser.role === "admin" || safeUser.role === "tester") {
      return { success: true, remainingCredits: subscription.proCredits || 0 }
    }

    const isPaidPlan = subscription.plan === "pro" || subscription.plan === "team"
    const trial = subscription.trial

    // If on trial (basic plan with active trial)
    if (!isPaidPlan && trial?.requested && !trial.exhausted) {
      if (trial.submissionsUsed >= trial.maxSubmissions) {
        // Trial submission limit already reached — mark exhausted but preserve
        // proCredits so the backend welcome-bonus credits remain usable.
        users[userId] = {
          ...safeUser,
          subscription: {
            ...subscription,
            trial: { ...trial, exhausted: true },
            updatedAt: Date.now(),
          },
        }
        await getSafeKVClient().set(USERS_STORAGE_KEY, users)
        // Fall through to the credit-based path below rather than hard-blocking.
      } else {
        const newSubmissionsUsed = trial.submissionsUsed + 1
        const isNowExhausted = newSubmissionsUsed >= trial.maxSubmissions

        // Update trial submission counter only — keep proCredits intact so
        // welcome-bonus credits (backend) remain accessible after exhaustion.
        users[userId] = {
          ...safeUser,
          subscription: {
            ...subscription,
            trial: {
              ...trial,
              submissionsUsed: newSubmissionsUsed,
              exhausted: isNowExhausted,
            },
            updatedAt: Date.now(),
          },
        }
        await getSafeKVClient().set(USERS_STORAGE_KEY, users)

        // Also deduct from the backend subscription so the two credit stores
        // stay in sync. This call is best-effort; a failure is non-blocking.
        chargeCredits(userId, 1, "review", "Review check (trial)").catch((err) =>
          console.warn("[consumeReviewCredit] Trial backend credit sync failed (non-blocking):", err)
        )

        return {
          success: true,
          remainingCredits: subscription.proCredits || 0,
          trialSubmissionsUsed: newSubmissionsUsed,
        }
      }
    }

    if (!isPaidPlan) {
      // Basic users can consume credits granted via welcome bonus / admin top-up.
      // Block only when no credits remain.
      if ((subscription.proCredits || 0) <= 0) {
        return { success: false, remainingCredits: 0, error: "No credits remaining. Upgrade or request a top-up to continue." }
      }
    }

    return await chargeCredits(userId, 1, "review", "Review check")
  } catch (error) {
    console.error("Failed to consume review credit:", error)
    return { success: false, remainingCredits: 0, error: "Failed to consume credit" }
  }
}

// Keep for backward compatibility (Humanizer uses this)
export async function consumeProCredits(userId: string, creditsToConsume: number): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
  try {
    return await chargeCredits(userId, creditsToConsume, "humanizer", "Humanizer processing")
  } catch (error) {
    console.error("Failed to consume Pro credits:", error)
    return { success: false, remainingCredits: 0, error: "Failed to consume credits" }
  }
}

export async function consumeIdeaCanvasCredits(userId: string): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
  try {
    return await chargeCredits(userId, IDEA_CANVAS_CREDIT_COST, "idea-canvas", "Business Canvas generation")
  } catch (error) {
    console.error("Failed to consume Idea Canvas credits:", error)
    return { success: false, remainingCredits: 0, error: "Failed to consume credits" }
  }
}

export async function consumeIdeaPitchCredits(userId: string): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
  try {
    return await chargeCredits(userId, IDEA_PITCH_CREDIT_COST, "idea-pitch", "Pitch Deck generation")
  } catch (error) {
    console.error("Failed to consume Idea Pitch credits:", error)
    return { success: false, remainingCredits: 0, error: "Failed to consume credits" }
  }
}

export async function requestTrial(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    if (!user) {
      return { success: false, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()

    if (subscription.plan !== "basic") {
      return { success: false, error: "Trial is only available for Basic plan users" }
    }

    if (subscription.trial?.requested) {
      return { success: false, error: "Trial has already been requested." }
    }

    // Check if a pending request already exists
    const requests = (await getSafeKVClient().get<SubscriptionRequest[]>(SUBSCRIPTION_REQUESTS_KEY)) || []
    const existingRequest = requests.find(
      (r) => r.userId === userId && r.type === "trial" && r.status === "pending"
    )
    if (existingRequest) {
      return { success: false, error: "A trial request is already pending admin approval." }
    }

    const request: SubscriptionRequest = {
      id: `trial-${userId}-${Date.now()}`,
      userId,
      userEmail: user.email,
      userName: user.fullName,
      type: "trial",
      currentPlan: subscription.plan,
      status: "pending",
      createdAt: Date.now(),
    }

    requests.push(request)
    await getSafeKVClient().set(SUBSCRIPTION_REQUESTS_KEY, requests)
    return { success: true }
  } catch (error) {
    console.error("Failed to request trial:", error)
    return { success: false, error: "Failed to submit trial request" }
  }
}

export async function requestUpgrade(
  userId: string,
  targetPlan: "pro" | "team",
  paymentProof?: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    if (!user) {
      return { success: false, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()

    if (subscription.plan === targetPlan) {
      return { success: false, error: `Already on ${targetPlan} plan` }
    }

    // Check for existing pending request
    const requests = (await getSafeKVClient().get<SubscriptionRequest[]>(SUBSCRIPTION_REQUESTS_KEY)) || []
    const existingRequest = requests.find(
      (r) => r.userId === userId && r.type === "upgrade" && r.status === "pending"
    )
    if (existingRequest) {
      return { success: false, error: "An upgrade request is already pending admin approval." }
    }

    const request: SubscriptionRequest = {
      id: `upgrade-${userId}-${Date.now()}`,
      userId,
      userEmail: user.email,
      userName: user.fullName,
      type: "upgrade",
      targetPlan,
      currentPlan: subscription.plan,
      paymentProof,
      message,
      status: "pending",
      createdAt: Date.now(),
    }

    requests.push(request)
    await getSafeKVClient().set(SUBSCRIPTION_REQUESTS_KEY, requests)
    return { success: true }
  } catch (error) {
    console.error("Failed to submit upgrade request:", error)
    return { success: false, error: "Failed to submit upgrade request" }
  }
}

// Keep for backward compatibility (used internally by admin approval)
export async function upgradeToPlan(userId: string, plan: "pro" | "team" | "enterprise"): Promise<{ success: boolean; credits: number; error?: string }> {
  try {
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    if (!user) {
      return { success: false, credits: 0, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const initialCredits = PLAN_CONFIG[plan].creditsPerMonth

    users[userId] = {
      ...safeUser,
      subscription: {
        plan,
        status: "active",
        proCredits: Math.max(0, initialCredits),
        updatedAt: Date.now(),
        trial: safeUser.subscription?.trial,
      },
    }

    await getSafeKVClient().set(USERS_STORAGE_KEY, users)
    return { success: true, credits: initialCredits }
  } catch (error) {
    console.error(`Failed to upgrade user to ${plan}:`, error)
    return { success: false, credits: 0, error: `Failed to upgrade to ${plan}` }
  }
}

// Keep for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function upgradeToPro(userId: string, _initialCredits = 25): Promise<{ success: boolean; credits: number; error?: string }> {
  return upgradeToPlan(userId, "pro")
}

export async function addProCredits(userId: string, creditsToAdd: number): Promise<{ success: boolean; credits: number; error?: string }> {
  if (creditsToAdd <= 0) {
    return { success: false, credits: 0, error: "Credits to add must be greater than zero" }
  }

  try {
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    if (!user) {
      return { success: false, credits: 0, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()

    const isPaidPlan = subscription.plan === "pro" || subscription.plan === "team" || subscription.plan === "enterprise"
    if (!isPaidPlan) {
      return { success: false, credits: subscription.proCredits || 0, error: "Upgrade to Pro, Team, or Enterprise first" }
    }

    const newCredits = Math.max(0, (subscription.proCredits || 0) + creditsToAdd)
    users[userId] = {
      ...safeUser,
      subscription: {
        ...subscription,
        proCredits: newCredits,
        updatedAt: Date.now(),
      },
    }

    await getSafeKVClient().set(USERS_STORAGE_KEY, users)
    return { success: true, credits: newCredits }
  } catch (error) {
    console.error("Failed to add Pro credits:", error)
    return { success: false, credits: 0, error: "Failed to add credits" }
  }
}

// ============ Admin Functions ============

export async function getSubscriptionRequests(): Promise<SubscriptionRequest[]> {
  try {
    return (await getSafeKVClient().get<SubscriptionRequest[]>(SUBSCRIPTION_REQUESTS_KEY)) || []
  } catch (error) {
    console.error("Failed to get subscription requests:", error)
    return []
  }
}

export async function approveTrialRequest(requestId: string, adminEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const requests = (await getSafeKVClient().get<SubscriptionRequest[]>(SUBSCRIPTION_REQUESTS_KEY)) || []
    const idx = requests.findIndex((r) => r.id === requestId && r.type === "trial" && r.status === "pending")
    if (idx === -1) {
      return { success: false, error: "Request not found or already resolved" }
    }

    const request = requests[idx]
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[request.userId]

    if (!user) {
      return { success: false, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()

    const trialInfo: TrialInfo = {
      requested: true,
      requestedAt: Date.now(),
      creditsGranted: TRIAL_CREDITS,
      submissionsUsed: 0,
      maxSubmissions: TRIAL_MAX_SUBMISSIONS,
      exhausted: false,
    }

    users[request.userId] = {
      ...safeUser,
      subscription: {
        ...subscription,
        proCredits: TRIAL_CREDITS,
        trial: trialInfo,
        updatedAt: Date.now(),
      },
    }

    requests[idx] = {
      ...request,
      status: "approved",
      resolvedAt: Date.now(),
      resolvedBy: adminEmail,
    }

    await getSafeKVClient().set(USERS_STORAGE_KEY, users)
    await getSafeKVClient().set(SUBSCRIPTION_REQUESTS_KEY, requests)
    return { success: true }
  } catch (error) {
    console.error("Failed to approve trial request:", error)
    return { success: false, error: "Failed to approve trial" }
  }
}

export async function approveUpgradeRequest(requestId: string, adminEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const requests = (await getSafeKVClient().get<SubscriptionRequest[]>(SUBSCRIPTION_REQUESTS_KEY)) || []
    const idx = requests.findIndex((r) => r.id === requestId && r.type === "upgrade" && r.status === "pending")
    if (idx === -1) {
      return { success: false, error: "Request not found or already resolved" }
    }

    const request = requests[idx]
    const targetPlan = request.targetPlan as "pro" | "team" | "enterprise"

    const upgradeResult = await upgradeToPlan(request.userId, targetPlan)
    if (!upgradeResult.success) {
      return { success: false, error: upgradeResult.error }
    }

    requests[idx] = {
      ...request,
      status: "approved",
      resolvedAt: Date.now(),
      resolvedBy: adminEmail,
    }

    await getSafeKVClient().set(SUBSCRIPTION_REQUESTS_KEY, requests)
    return { success: true }
  } catch (error) {
    console.error("Failed to approve upgrade request:", error)
    return { success: false, error: "Failed to approve upgrade" }
  }
}

export async function rejectRequest(requestId: string, adminEmail: string, adminNote?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const requests = (await getSafeKVClient().get<SubscriptionRequest[]>(SUBSCRIPTION_REQUESTS_KEY)) || []
    const idx = requests.findIndex((r) => r.id === requestId && r.status === "pending")
    if (idx === -1) {
      return { success: false, error: "Request not found or already resolved" }
    }

    requests[idx] = {
      ...requests[idx],
      status: "rejected",
      adminNote,
      resolvedAt: Date.now(),
      resolvedBy: adminEmail,
    }

    await getSafeKVClient().set(SUBSCRIPTION_REQUESTS_KEY, requests)
    return { success: true }
  } catch (error) {
    console.error("Failed to reject request:", error)
    return { success: false, error: "Failed to reject request" }
  }
}

export async function adminAddCredits(userId: string, creditsToAdd: number): Promise<{ success: boolean; credits: number; error?: string }> {
  if (creditsToAdd <= 0) {
    return { success: false, credits: 0, error: "Credits must be greater than zero" }
  }

  const backendRes = await postBackend("/api/sentinel/admin/subscriptions/add-credits", {
    userId,
    credits: creditsToAdd,
  })

  if (backendRes.status !== 0) {
    if (backendRes.ok && backendRes.data?.ok) {
      return { success: true, credits: Number(backendRes.data.credits || 0) }
    }
    return {
      success: false,
      credits: 0,
      error: (backendRes.data?.error as string) || "Failed to add credits",
    }
  }

  if (!isLocalDevHost()) {
    return { success: false, credits: 0, error: "Backend unavailable" }
  }

  try {
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    if (!user) {
      return { success: false, credits: 0, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()
    const newCredits = Math.max(0, (subscription.proCredits || 0) + creditsToAdd)

    users[userId] = {
      ...safeUser,
      subscription: {
        ...subscription,
        proCredits: newCredits,
        updatedAt: Date.now(),
      },
    }

    await getSafeKVClient().set(USERS_STORAGE_KEY, users)
    return { success: true, credits: newCredits }
  } catch (error) {
    console.error("Failed to add credits:", error)
    return { success: false, credits: 0, error: "Failed to add credits" }
  }
}

export async function adminSetPlan(userId: string, plan: SubscriptionPlan): Promise<{ success: boolean; error?: string }> {
  const backendRes = await postBackend("/api/sentinel/admin/subscriptions/set-plan", {
    userId,
    plan,
  })

  if (backendRes.status !== 0) {
    if (backendRes.ok && backendRes.data?.ok) {
      return { success: true }
    }
    return { success: false, error: (backendRes.data?.error as string) || "Failed to set plan" }
  }

  if (!isLocalDevHost()) {
    return { success: false, error: "Backend unavailable" }
  }

  try {
    const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    if (!user) {
      return { success: false, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()
    const credits = plan === "basic" ? 0 : (PLAN_CONFIG[plan]?.creditsPerMonth ?? PLAN_CONFIG.pro.creditsPerMonth)

    users[userId] = {
      ...safeUser,
      subscription: {
        ...subscription,
        plan,
        status: "active",
        proCredits: Math.max(subscription.proCredits || 0, credits),
        updatedAt: Date.now(),
      },
    }

    await getSafeKVClient().set(USERS_STORAGE_KEY, users)
    return { success: true }
  } catch (error) {
    console.error("Failed to set plan:", error)
    return { success: false, error: "Failed to set plan" }
  }
}
