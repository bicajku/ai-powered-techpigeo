import { SubscriptionInfo, UserProfile } from "@/types"

const USERS_STORAGE_KEY = "platform-users"

export interface FeatureEntitlements {
  isPro: boolean
  isSubscriptionActive: boolean
  canUseHumanizer: boolean
  proCreditsRemaining: number
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

  const isPro = subscription.plan === "pro"
  const isSubscriptionActive = isPro
    ? subscription.status === "active" || subscription.status === "grace"
    : true

  const credits = Math.max(0, subscription.proCredits || 0)

  return {
    isPro,
    isSubscriptionActive,
    canUseHumanizer: isPro && isSubscriptionActive && credits > 0,
    proCreditsRemaining: credits,
  }
}

export async function consumeProCredits(userId: string, creditsToConsume: number): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
  if (creditsToConsume <= 0) {
    return { success: false, remainingCredits: 0, error: "Credit amount must be greater than zero" }
  }

  try {
    const users = (await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const user = users[userId]

    if (!user) {
      return { success: false, remainingCredits: 0, error: "User not found" }
    }

    const safeUser = ensureUserSubscription(user)
    const subscription = safeUser.subscription || getDefaultSubscription()

    if (subscription.plan !== "pro") {
      return { success: false, remainingCredits: subscription.proCredits || 0, error: "Pro subscription required" }
    }

    if (!(subscription.status === "active" || subscription.status === "grace")) {
      return { success: false, remainingCredits: subscription.proCredits || 0, error: "Subscription is not active" }
    }

    const currentCredits = Math.max(0, subscription.proCredits || 0)

    if (currentCredits < creditsToConsume) {
      return { success: false, remainingCredits: currentCredits, error: "Insufficient Pro credits" }
    }

    const remainingCredits = currentCredits - creditsToConsume

    users[userId] = {
      ...safeUser,
      subscription: {
        ...subscription,
        proCredits: remainingCredits,
        updatedAt: Date.now(),
      },
    }

    await spark.kv.set(USERS_STORAGE_KEY, users)

    return { success: true, remainingCredits }
  } catch (error) {
    console.error("Failed to consume Pro credits:", error)
    return { success: false, remainingCredits: 0, error: "Failed to consume credits" }
  }
}
