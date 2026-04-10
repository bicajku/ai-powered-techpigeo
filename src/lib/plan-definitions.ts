/**
 * Plan Definitions - Single source of truth for pricing and features
 * Must be kept in sync with backend/db.mjs and BudgetConfigManager.tsx
 */

import { Lightbulb, Lightning, Crown, Sparkle } from "@phosphor-icons/react"

export interface PlanDefinition {
  id: "basic" | "pro" | "team" | "enterprise"
  name: string
  price: string
  pricePerMonth: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>
  color: string
  border: string
  popular?: boolean
  features: string[]
  monthlyExports: number
  reviewCredits: number
  description: string
}

export const PLAN_DEFINITIONS: Record<string, PlanDefinition> = {
  basic: {
    id: "basic",
    name: "Basic",
    price: "Free",
    pricePerMonth: 0,
    icon: Lightbulb,
    color: "text-muted-foreground",
    border: "border-border/40",
    features: [
      "AI Strategy Generation",
      "Idea Cooking & Canvas",
      "Pitch Deck Generation",
      "5 exports/month",
      "7-day trial access to all features",
    ],
    monthlyExports: 5,
    reviewCredits: 0,
    description: "Perfect for exploring AI-powered strategy tools",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$20/mo",
    pricePerMonth: 20,
    icon: Lightning,
    color: "text-primary",
    border: "border-primary/50",
    popular: true,
    features: [
      "Everything in Basic",
      "Document Review & Plagiarism Detection",
      "AI Humanizer Module",
      "100 exports/month",
      "25 review credits/month",
      "Priority processing",
    ],
    monthlyExports: 100,
    reviewCredits: 25,
    description: "For professionals needing comprehensive content tools",
  },
  team: {
    id: "team",
    name: "Team",
    price: "$50/mo",
    pricePerMonth: 50,
    icon: Crown,
    color: "text-accent",
    border: "border-accent/50",
    features: [
      "Everything in Pro",
      "100 review credits/month",
      "Unlimited exports",
      "Priority AI processing",
      "Team collaboration features",
      "Advanced analytics",
    ],
    monthlyExports: 99999, // Unlimited
    reviewCredits: 100,
    description: "For teams scaling content generation and analysis",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    pricePerMonth: 0,
    icon: Sparkle,
    color: "text-accent",
    border: "border-accent/50",
    features: [
      "Everything in Team",
      "Custom quotas and limits",
      "Dedicated support",
      "SSO & advanced security",
      "Custom integrations",
      "SLA guarantees",
    ],
    monthlyExports: 99999,
    reviewCredits: 99999,
    description: "For enterprise customers with custom needs",
  },
}

export const PLAN_LIST = Object.values(PLAN_DEFINITIONS)

/**
 * Example prompts for Strategy and Idea Generation modules
 * Grouped by plan type to show what's possible
 */

export const EXAMPLE_PROMPTS_BY_PLAN = {
  basic: [
    {
      text: "Growth strategy for an EdTech platform offering coding bootcamps",
      description: "Strategy generation with basic Canvas & Pitch Deck",
    },
  ],
  pro: [
    {
      text: "Launch strategy for an AI-powered SaaS product targeting healthcare",
      description: "Full strategy with market analysis and competitive positioning",
    },
    {
      text: "Business canvas for a sustainable fashion e-commerce startup",
      description: "Complete business model with customer segments and value proposition",
    },
  ],
  team: [
    {
      text: "Go-to-market plan for a fintech mobile app in emerging markets",
      description: "Research-backed GTM with localization and regulatory considerations",
    },
    {
      text: "Growth strategy for an EdTech platform offering coding bootcamps",
      description: "Multi-channel growth strategy with unit economics analysis",
    },
  ],
  all: [
    {
      text: "Launch strategy for an AI-powered SaaS product targeting healthcare",
      description: "Strategy generation with basic Canvas & Pitch Deck",
    },
    {
      text: "Business canvas for a sustainable fashion e-commerce startup",
      description: "Complete business model with customer segments and value proposition",
    },
    {
      text: "Go-to-market plan for a fintech mobile app in emerging markets",
      description: "Research-backed GTM with localization and regulatory considerations",
    },
    {
      text: "Growth strategy for an EdTech platform offering coding bootcamps",
      description: "Multi-channel growth strategy with unit economics analysis",
    },
  ],
}
