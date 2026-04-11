function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
      : null
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
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
    // SSR or cookie unavailable
  }
  return headers
}

export interface PlatformConnector {
  id: number
  name: string
  platform_type: "rest_api" | "graphql" | "webhook" | "oauth2" | "custom"
  base_url: string
  auth_type: "api_key" | "bearer" | "basic" | "oauth2" | "none"
  auth_config: Record<string, string>
  headers: Record<string, string>
  enabled: boolean
  description: string
  sector: string | null
  health_status: "healthy" | "degraded" | "down" | "unknown"
  last_health_check: string | null
  created_by: string | number | null
  created_at: string
}

export async function ensureConnectorsTable(): Promise<void> {
  // Connector schema is managed server-side.
  return
}

export async function addConnector(connector: {
  name: string
  platform_type: PlatformConnector["platform_type"]
  base_url: string
  auth_type: PlatformConnector["auth_type"]
  auth_config?: Record<string, string>
  headers?: Record<string, string>
  description?: string
  sector?: string
  created_by?: number
}): Promise<PlatformConnector> {
  const res = await fetch(`${getBackendBaseUrl()}/api/connectors`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(connector),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Failed to add connector (${res.status})`)
  }
  const data = await res.json() as { ok: boolean; connector: PlatformConnector }
  return data.connector
}

export async function listConnectors(): Promise<PlatformConnector[]> {
  const res = await fetch(`${getBackendBaseUrl()}/api/connectors`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Failed to load connectors (${res.status})`)
  }
  const data = await res.json() as { ok: boolean; connectors: PlatformConnector[] }
  return data.connectors || []
}

export async function updateConnector(
  _id: number,
  _updates: Partial<Pick<PlatformConnector, "name" | "base_url" | "auth_type" | "auth_config" | "headers" | "enabled" | "description" | "sector">>
): Promise<void> {
  const res = await fetch(`${getBackendBaseUrl()}/api/connectors/${_id}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(_updates),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Failed to update connector (${res.status})`)
  }
}

export async function deleteConnector(id: number): Promise<void> {
  const res = await fetch(`${getBackendBaseUrl()}/api/connectors/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Failed to delete connector (${res.status})`)
  }
}

export async function testConnectorHealth(connector: PlatformConnector): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const res = await fetch(`${getBackendBaseUrl()}/api/connectors/${connector.id}/health`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    return { ok: false, latencyMs: 0, error: body.error || `Health check failed (${res.status})` }
  }
  const data = await res.json() as { ok: boolean; latencyMs: number; error?: string }
  return { ok: Boolean(data.ok), latencyMs: Number(data.latencyMs || 0), error: data.error }
}

export async function callConnector(
  _connector: PlatformConnector,
  _endpoint: string,
  _options?: { method?: string; body?: unknown; params?: Record<string, string> }
): Promise<{ data: unknown; status: number }> {
  const res = await fetch(`${getBackendBaseUrl()}/api/connectors/${_connector.id}/call`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({
      endpoint: _endpoint,
      method: _options?.method,
      body: _options?.body,
      params: _options?.params,
    }),
  })
  const payload = await res.json().catch(() => ({})) as { ok?: boolean; status?: number; data?: unknown; error?: string }
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || `Connector request failed (${res.status})`)
  }
  return {
    data: payload.data,
    status: Number(payload.status || 200),
  }
}
