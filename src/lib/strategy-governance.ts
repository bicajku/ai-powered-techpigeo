import { SubscriptionPlan } from "@/types"

export interface StrategyPlanConfig {
  plan: SubscriptionPlan
  maxSavedStrategies: number
  monthlyBudgetCents: number
  enableQaLoop: boolean
  maxWorkflowRetries: number
}

export interface ExportPlanConfig {
  plan: SubscriptionPlan
  monthlyExports: number
  allowWordExport: boolean
}

export interface BudgetLimits {
  basicMonthlyBudgetCents: number
  basicMaxSavedStrategies: number
  basicMonthlyExports: number
  proMonthlyBudgetCents: number
  proMaxSavedStrategies: number
  proMonthlyExports: number
}

const DEFAULT_PLAN_CONFIG: Record<SubscriptionPlan, StrategyPlanConfig> = {
  basic: {
    plan: "basic",
    maxSavedStrategies: 20,
    monthlyBudgetCents: 500,
    enableQaLoop: false,
    maxWorkflowRetries: 2,
  },
  pro: {
    plan: "pro",
    maxSavedStrategies: 500,
    monthlyBudgetCents: 5000,
    enableQaLoop: true,
    maxWorkflowRetries: 3,
  },
  team: {
    plan: "team",
    maxSavedStrategies: 2000,
    monthlyBudgetCents: 25000,
    enableQaLoop: true,
    maxWorkflowRetries: 5,
  },
  enterprise: {
    plan: "enterprise",
    maxSavedStrategies: Infinity,
    monthlyBudgetCents: 99000,
    enableQaLoop: true,
    maxWorkflowRetries: 5,
  },
}

const DEFAULT_EXPORT_PLAN_CONFIG: Record<SubscriptionPlan, ExportPlanConfig> = {
  basic: {
    plan: "basic",
    monthlyExports: 5,
    allowWordExport: false,
  },
  pro: {
    plan: "pro",
    monthlyExports: 100,
    allowWordExport: true,
  },
  team: {
    plan: "team",
    monthlyExports: Infinity,
    allowWordExport: true,
  },
  enterprise: {
    plan: "enterprise",
    monthlyExports: Infinity,
    allowWordExport: true,
  },
}

let cachedBudgetLimits: BudgetLimits | null = null

export async function loadBudgetLimits() {
  try {
    cachedBudgetLimits = await spark.kv.get<BudgetLimits>("admin-budget-limits") || null
  } catch (error) {
    console.error("Failed to load admin budget limits:", error)
  }
}

export function getStrategyPlanConfig(plan: SubscriptionPlan): StrategyPlanConfig {
  if (cachedBudgetLimits) {
    if (plan === "basic") {
      return {
        plan: "basic",
        maxSavedStrategies: cachedBudgetLimits.basicMaxSavedStrategies,
        monthlyBudgetCents: cachedBudgetLimits.basicMonthlyBudgetCents,
        enableQaLoop: false,
        maxWorkflowRetries: 1,
      }
    } else {
      // Pro and Team use pro budget limits from admin (team gets higher defaults)
      return {
        plan,
        maxSavedStrategies: plan === "team" ? cachedBudgetLimits.proMaxSavedStrategies * 4 : cachedBudgetLimits.proMaxSavedStrategies,
        monthlyBudgetCents: plan === "team" ? cachedBudgetLimits.proMonthlyBudgetCents * 5 : cachedBudgetLimits.proMonthlyBudgetCents,
        enableQaLoop: true,
        maxWorkflowRetries: plan === "team" ? 5 : 3,
      }
    }
  }
  
  return DEFAULT_PLAN_CONFIG[plan]
}

export function getExportPlanConfig(plan: SubscriptionPlan): ExportPlanConfig {
  if (cachedBudgetLimits) {
    if (plan === "basic") {
      return {
        plan: "basic",
        monthlyExports: cachedBudgetLimits.basicMonthlyExports,
        allowWordExport: false,
      }
    } else {
      return {
        plan,
        monthlyExports: plan === "team" ? Infinity : cachedBudgetLimits.proMonthlyExports,
        allowWordExport: true,
      }
    }
  }
  
  return DEFAULT_EXPORT_PLAN_CONFIG[plan]
}

export function estimatePromptTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function estimateGenerationCostCents(
  inputTokens: number,
  outputTokens: number,
  plan: SubscriptionPlan
): number {
  const inRatePer1k = plan === "pro" ? 0.006 : 0.003
  const outRatePer1k = plan === "pro" ? 0.018 : 0.009

  const estimated = (inputTokens / 1000) * inRatePer1k + (outputTokens / 1000) * outRatePer1k
  return Math.max(1, Math.ceil(estimated * 100))
}

export function getCurrentMonthKey(prefix = "strategy-spend"): string {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  return `${prefix}-${month}`
}
