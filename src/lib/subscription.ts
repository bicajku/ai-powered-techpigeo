import { SubscriptionInfo, SubscriptionPlan, SubscriptionRequest, TrialInfo, UserProfile } from "@/types"
import { getSafeKVClient } from "@/lib/spark-shim"
import { logEnterpriseCreditUsage } from "@/lib/enterprise-subscription"

const USERS_STORAGE_KEY = "platform-users"
const SUBSCRIPTION_REQUESTS_KEY = "subscription-requests"

type ChargeableModule = "review" | "humanizer"

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
  return modules.includes(module)
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
  if (!rawUser) {
    return { success: false, remainingCredits: 0, error: "User not found" }
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

  const isPaidPlan = payerSub.plan === "pro" || payerSub.plan === "team" || payerSub.plan === "enterprise"
  if (!isPaidPlan) {
    return { success: false, remainingCredits: payerSub.proCredits || 0, error: "Pro, Team, or Enterprise subscription required" }
  }

  if (!(payerSub.status === "active" || payerSub.status === "grace")) {
    return { success: false, remainingCredits: payerSub.proCredits || 0, error: "Subscription is not active" }
  }

  const currentCredits = Math.max(0, payerSub.proCredits || 0)
  if (currentCredits < creditsToConsume) {
    return { success: false, remainingCredits: currentCredits, error: "Insufficient credits" }
  }

  const remainingCredits = currentCredits - creditsToConsume
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

  if (chargeToOrgId) {
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

  // Review access: admin always, paid plans with active sub & credits, or active trial with remaining submissions
  const canAccessReview = isAdmin || isTester || (isPaidPlan && isSubscriptionActive && credits > 0) || isTrialActive

  // Humanize: admin always, paid plans with active sub & credits, or active trial with remaining submissions
  const canUseHumanizer = isAdmin || isTester || (isPaidPlan && isSubscriptionActive && credits > 0) || isTrialActive

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

    if (!user) {
      return { success: false, remainingCredits: 0, error: "User not found" }
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
        // Exhaust the trial
        users[userId] = {
          ...safeUser,
          subscription: {
            ...subscription,
            proCredits: 0,
            trial: { ...trial, exhausted: true, creditsGranted: 0 },
            updatedAt: Date.now(),
          },
        }
        await getSafeKVClient().set(USERS_STORAGE_KEY, users)
        return { success: false, remainingCredits: 0, error: "Trial exhausted. Please upgrade to Pro or Team to continue." }
      }

      const newSubmissionsUsed = trial.submissionsUsed + 1
      const newCreditsUsed = Math.max(0, subscription.proCredits - 1)
      const isNowExhausted = newSubmissionsUsed >= trial.maxSubmissions

      users[userId] = {
        ...safeUser,
        subscription: {
          ...subscription,
          proCredits: isNowExhausted ? 0 : newCreditsUsed,
          trial: {
            ...trial,
            submissionsUsed: newSubmissionsUsed,
            exhausted: isNowExhausted,
            creditsGranted: isNowExhausted ? 0 : trial.creditsGranted,
          },
          updatedAt: Date.now(),
        },
      }
      await getSafeKVClient().set(USERS_STORAGE_KEY, users)
      return {
        success: true,
        remainingCredits: isNowExhausted ? 0 : newCreditsUsed,
        trialSubmissionsUsed: newSubmissionsUsed,
      }
    }

    if (!isPaidPlan) {
      return { success: false, remainingCredits: 0, error: "Pro or Team subscription required" }
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
