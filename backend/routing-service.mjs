import {
  getProviderRoutingConfig,
  getProviderBudgetSnapshot,
  writeProviderUsage,
} from "./db.mjs"

const GENERATION_PROVIDERS = ["copilot", "groq", "deepseek", "spark", "gemini", "sentinel"]
const WEB_PROVIDERS = ["searchcans", "serpapi", "duckduckgo", "sentinel"]

function sanitizeOrder(order, allowed, fallback) {
  const incoming = Array.isArray(order) ? order : []
  const normalized = incoming.filter((item, idx) => allowed.includes(item) && incoming.indexOf(item) === idx)
  if (normalized.length === 0) return [...fallback]

  for (const candidate of fallback) {
    if (!normalized.includes(candidate)) normalized.push(candidate)
  }
  return normalized
}

function toBoolMap(value, allowed, defaultValue = true) {
  const map = {}
  for (const name of allowed) {
    const raw = value && Object.prototype.hasOwnProperty.call(value, name) ? value[name] : defaultValue
    map[name] = Boolean(raw)
  }
  return map
}

export async function getResolvedRouting(moduleName = "global") {
  const cfg = await getProviderRoutingConfig(moduleName)

  const generationOrder = sanitizeOrder(
    cfg.providerOrder,
    GENERATION_PROVIDERS,
    ["copilot", "groq", "deepseek", "spark", "gemini", "sentinel"]
  )
  const webOrder = sanitizeOrder(
    cfg.webProviderOrder,
    WEB_PROVIDERS,
    ["searchcans", "serpapi", "duckduckgo", "sentinel"]
  )

  const enabledProviders = toBoolMap(cfg.enabledProviders, GENERATION_PROVIDERS, true)
  const enabledWebProviders = toBoolMap(cfg.enabledWebProviders, WEB_PROVIDERS, true)

  const budget = await getProviderBudgetSnapshot({ moduleName: cfg.moduleName || moduleName })
  const dailyBudgetUsd = Number(cfg.dailyBudgetUsd || 0)
  const monthlyBudgetUsd = Number(cfg.monthlyBudgetUsd || 0)

  return {
    ...cfg,
    moduleName: cfg.moduleName || moduleName,
    generationOrder,
    webOrder,
    enabledProviders,
    enabledWebProviders,
    budget,
    budgetExceeded: {
      daily: dailyBudgetUsd > 0 && budget.dailyCostUsd >= dailyBudgetUsd,
      monthly: monthlyBudgetUsd > 0 && budget.monthlyCostUsd >= monthlyBudgetUsd,
    },
  }
}

export function filterActiveGenerationProviders(order, enabledProviders) {
  return order.filter((provider) => provider !== "sentinel" && enabledProviders[provider] !== false)
}

export function filterActiveWebProviders(order, enabledWebProviders) {
  return order.filter((provider) => provider !== "sentinel" && enabledWebProviders[provider] !== false)
}

export async function logProviderUsage(entry) {
  await writeProviderUsage({
    provider: entry.provider,
    moduleName: entry.moduleName || "global",
    kind: entry.kind || "generation",
    model: entry.model || null,
    requestCount: entry.requestCount || 1,
    inputTokens: entry.inputTokens ?? null,
    outputTokens: entry.outputTokens ?? null,
    totalTokens: entry.totalTokens ?? null,
    estimatedCostUsd: entry.estimatedCostUsd || 0,
    status: entry.status || "ok",
    error: entry.error || null,
  })
}
