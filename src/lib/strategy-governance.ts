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

const PLAN_CONFIG: Record<SubscriptionPlan, StrategyPlanConfig> = {
  basic: {
    plan: "basic",
    maxSavedStrategies: 20,
    monthlyBudgetCents: 500,
    enableQaLoop: false,
    maxWorkflowRetries: 1,
  },
  pro: {
    plan: "pro",
    maxSavedStrategies: 500,
    monthlyBudgetCents: 5000,
    enableQaLoop: true,
    maxWorkflowRetries: 3,
  },
}

const EXPORT_PLAN_CONFIG: Record<SubscriptionPlan, ExportPlanConfig> = {
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
}

export function getStrategyPlanConfig(plan: SubscriptionPlan): StrategyPlanConfig {
  return PLAN_CONFIG[plan]
}

export function getExportPlanConfig(plan: SubscriptionPlan): ExportPlanConfig {
  return EXPORT_PLAN_CONFIG[plan]
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
