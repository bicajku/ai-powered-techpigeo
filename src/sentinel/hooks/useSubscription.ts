/**
 * Sentinel SAAS - Subscription Hook
 */

import { useSentinel } from "../context/SentinelContext"
import { SUBSCRIPTION_DEFINITIONS } from "../config"
import type { SubscriptionTier, UserSubscription } from "../types/index"

export interface UseSubscriptionReturn {
  subscription: UserSubscription | null
  tier: SubscriptionTier | null
  isActive: boolean
  isBasic: boolean
  isPro: boolean
  isTeams: boolean
  isEnterprise: boolean
  hasNGOSAAS: boolean
  label: string
  color: string
  requestUpgrade: (toTier: SubscriptionTier, message?: string) => void
}

export function useSubscription(): UseSubscriptionReturn {
  const { subscription } = useSentinel()
  const tier = subscription?.tier ?? null
  const isActive = subscription?.status === "ACTIVE"

  const def = tier ? SUBSCRIPTION_DEFINITIONS[tier] : null

  return {
    subscription,
    tier,
    isActive,
    isBasic: tier === "BASIC" && isActive,
    isPro: tier === "PRO" && isActive,
    isTeams: tier === "TEAMS" && isActive,
    isEnterprise: tier === "ENTERPRISE" && isActive,
    hasNGOSAAS: tier === "ENTERPRISE" && isActive,
    label: def?.label ?? "No Subscription",
    color: def?.color ?? "#6b7280",
    requestUpgrade: (toTier: SubscriptionTier, message?: string) => {
      // Navigates to upgrade request form — handled by parent component
      console.info("Upgrade requested:", toTier, message)
    },
  }
}
