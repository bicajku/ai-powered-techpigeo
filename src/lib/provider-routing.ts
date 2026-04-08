import { getEnvConfig } from "@/lib/env-config"

export interface ProviderRoutingConfig {
  moduleName: string
  providerOrder: string[]
  webProviderOrder: string[]
  enabledProviders: Record<string, boolean>
  enabledWebProviders: Record<string, boolean>
  dailyBudgetUsd: number
  monthlyBudgetUsd: number
  providerDailyCaps: Record<string, number>
  timeoutMs: number
  updatedBy?: string | null
  updatedAt?: number
}

export interface ProviderUsageSummary {
  windowDays: number
  totals: {
    events: number
    requests: number
    tokens: number
    cost: number
    errors: number
  }
  byProvider: Array<{
    provider: string
    kind: string
    events: number
    requests: number
    tokens: number
    cost: number
  }>
  byModule: Array<{
    moduleName: string
    events: number
    requests: number
    tokens: number
    cost: number
  }>
  dailyCosts: Array<{
    day: string
    cost: number
    requests: number
  }>
}

function getBaseUrl() {
  const config = getEnvConfig()
  return config.backendApiBaseUrl ? config.backendApiBaseUrl.replace(/\/$/, "") : ""
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  const token = typeof localStorage !== "undefined" ? localStorage.getItem("sentinel-auth-token") : null
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const csrfMatch = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("__csrf="))
    if (csrfMatch) {
      headers["X-CSRF-Token"] = csrfMatch.slice("__csrf=".length)
    }
  } catch {
    // ignore cookie parsing issues
  }

  return headers
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(text || `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchProviderRouting(moduleName?: string): Promise<ProviderRoutingConfig[]> {
  const base = getBaseUrl()
  const query = moduleName ? `?module=${encodeURIComponent(moduleName)}` : ""
  const headers = getAuthHeaders()
  const fetchAdmin = () =>
    fetch(`${base}/api/sentinel/admin/provider-routing${query}`, {
      method: "GET",
      headers,
      credentials: "include",
    })

  const fetchPublic = () =>
    fetch(`${base}/api/providers/routing${query}`, {
      method: "GET",
      headers,
      credentials: "include",
    })

  // Non-admin module lookups should avoid admin-first probing to reduce noisy 403 logs.
  let response = moduleName ? await fetchPublic() : await fetchAdmin()

  if (response.status === 403 || response.status === 404) {
    response = moduleName ? await fetchAdmin() : await fetchPublic()
  }

  const data = await parseJsonResponse<{ ok: boolean; config?: ProviderRoutingConfig; configs?: ProviderRoutingConfig[] }>(response)
  if (data.config) return [data.config]
  return Array.isArray(data.configs) ? data.configs : []
}

export async function saveProviderRouting(config: ProviderRoutingConfig): Promise<ProviderRoutingConfig> {
  const base = getBaseUrl()
  const response = await fetch(`${base}/api/sentinel/admin/provider-routing`, {
    method: "PUT",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(config),
  })
  const data = await parseJsonResponse<{ ok: boolean; config: ProviderRoutingConfig }>(response)
  return data.config
}

export async function fetchProviderUsage(days = 30, moduleName = "global"): Promise<{
  summary: ProviderUsageSummary
  budget: { dailyCostUsd: number; monthlyCostUsd: number }
}> {
  const base = getBaseUrl()
  const response = await fetch(
    `${base}/api/sentinel/admin/provider-usage?days=${encodeURIComponent(String(days))}&module=${encodeURIComponent(moduleName)}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
      credentials: "include",
    }
  )
  const data = await parseJsonResponse<{
    ok: boolean
    summary: ProviderUsageSummary
    budget: { dailyCostUsd: number; monthlyCostUsd: number }
  }>(response)
  return {
    summary: data.summary,
    budget: data.budget,
  }
}
