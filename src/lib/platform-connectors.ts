import { getNeonClient, isNeonConfigured } from "./neon-client"

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
  created_by: number | null
  created_at: string
}

export async function ensureConnectorsTable(): Promise<void> {
  if (!isNeonConfigured()) return
  const sql = getNeonClient()
  await sql`
    CREATE TABLE IF NOT EXISTS platform_connectors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      platform_type TEXT NOT NULL DEFAULT 'rest_api',
      base_url TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'none',
      auth_config JSONB NOT NULL DEFAULT '{}',
      headers JSONB NOT NULL DEFAULT '{}',
      enabled BOOLEAN NOT NULL DEFAULT true,
      description TEXT NOT NULL DEFAULT '',
      sector TEXT,
      health_status TEXT NOT NULL DEFAULT 'unknown',
      last_health_check TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
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
  const sql = getNeonClient()
  const rows = await sql`
    INSERT INTO platform_connectors (name, platform_type, base_url, auth_type, auth_config, headers, description, sector, created_by)
    VALUES (
      ${connector.name},
      ${connector.platform_type},
      ${connector.base_url},
      ${connector.auth_type},
      ${JSON.stringify(connector.auth_config ?? {})}::jsonb,
      ${JSON.stringify(connector.headers ?? {})}::jsonb,
      ${connector.description ?? ""},
      ${connector.sector ?? null},
      ${connector.created_by ?? null}
    )
    RETURNING *
  `
  return parseConnectorRow(rows[0] as Record<string, unknown>)
}

export async function listConnectors(): Promise<PlatformConnector[]> {
  const sql = getNeonClient()
  const rows = await sql`SELECT * FROM platform_connectors ORDER BY created_at DESC`
  return (rows as Record<string, unknown>[]).map(parseConnectorRow)
}

export async function updateConnector(
  id: number,
  updates: Partial<Pick<PlatformConnector, "name" | "base_url" | "auth_type" | "auth_config" | "headers" | "enabled" | "description" | "sector">>
): Promise<void> {
  const sql = getNeonClient()
  const setClauses: string[] = []

  if (updates.name !== undefined) setClauses.push("name")
  if (updates.base_url !== undefined) setClauses.push("base_url")
  if (updates.auth_type !== undefined) setClauses.push("auth_type")
  if (updates.enabled !== undefined) setClauses.push("enabled")
  if (updates.description !== undefined) setClauses.push("description")
  if (updates.sector !== undefined) setClauses.push("sector")

  // Use individual update queries for simplicity with neon's tagged template
  if (updates.name !== undefined) await sql`UPDATE platform_connectors SET name = ${updates.name} WHERE id = ${id}`
  if (updates.base_url !== undefined) await sql`UPDATE platform_connectors SET base_url = ${updates.base_url} WHERE id = ${id}`
  if (updates.auth_type !== undefined) await sql`UPDATE platform_connectors SET auth_type = ${updates.auth_type} WHERE id = ${id}`
  if (updates.enabled !== undefined) await sql`UPDATE platform_connectors SET enabled = ${updates.enabled} WHERE id = ${id}`
  if (updates.description !== undefined) await sql`UPDATE platform_connectors SET description = ${updates.description} WHERE id = ${id}`
  if (updates.sector !== undefined) await sql`UPDATE platform_connectors SET sector = ${updates.sector} WHERE id = ${id}`
  if (updates.auth_config !== undefined) await sql`UPDATE platform_connectors SET auth_config = ${JSON.stringify(updates.auth_config)}::jsonb WHERE id = ${id}`
  if (updates.headers !== undefined) await sql`UPDATE platform_connectors SET headers = ${JSON.stringify(updates.headers)}::jsonb WHERE id = ${id}`
}

export async function deleteConnector(id: number): Promise<void> {
  const sql = getNeonClient()
  await sql`DELETE FROM platform_connectors WHERE id = ${id}`
}

export async function testConnectorHealth(connector: PlatformConnector): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now()
  try {
    const headers: Record<string, string> = { ...connector.headers }

    if (connector.auth_type === "bearer" && connector.auth_config.token) {
      headers["Authorization"] = `Bearer ${connector.auth_config.token}`
    } else if (connector.auth_type === "api_key" && connector.auth_config.key) {
      const headerName = connector.auth_config.header_name || "X-API-Key"
      headers[headerName] = connector.auth_config.key
    } else if (connector.auth_type === "basic" && connector.auth_config.username) {
      const encoded = btoa(`${connector.auth_config.username}:${connector.auth_config.password || ""}`)
      headers["Authorization"] = `Basic ${encoded}`
    }

    const res = await fetch(connector.base_url, {
      method: "HEAD",
      headers,
      signal: AbortSignal.timeout(10000),
    })

    const latencyMs = Math.round(performance.now() - start)

    if (isNeonConfigured()) {
      const sql = getNeonClient()
      const status = res.ok ? "healthy" : "degraded"
      await sql`UPDATE platform_connectors SET health_status = ${status}, last_health_check = now() WHERE id = ${connector.id}`
    }

    return { ok: res.ok, latencyMs }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start)

    if (isNeonConfigured()) {
      const sql = getNeonClient()
      await sql`UPDATE platform_connectors SET health_status = 'down', last_health_check = now() WHERE id = ${connector.id}`
    }

    return { ok: false, latencyMs, error: err instanceof Error ? err.message : "Health check failed" }
  }
}

export async function callConnector(
  connector: PlatformConnector,
  endpoint: string,
  options?: { method?: string; body?: unknown; params?: Record<string, string> }
): Promise<{ data: unknown; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...connector.headers,
  }

  if (connector.auth_type === "bearer" && connector.auth_config.token) {
    headers["Authorization"] = `Bearer ${connector.auth_config.token}`
  } else if (connector.auth_type === "api_key" && connector.auth_config.key) {
    const headerName = connector.auth_config.header_name || "X-API-Key"
    headers[headerName] = connector.auth_config.key
  } else if (connector.auth_type === "basic" && connector.auth_config.username) {
    const encoded = btoa(`${connector.auth_config.username}:${connector.auth_config.password || ""}`)
    headers["Authorization"] = `Basic ${encoded}`
  }

  let url = `${connector.base_url.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`
  if (options?.params) {
    const qs = new URLSearchParams(options.params).toString()
    url += `?${qs}`
  }

  const res = await fetch(url, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30000),
  })

  const data = await res.json()
  return { data, status: res.status }
}

function parseConnectorRow(row: Record<string, unknown>): PlatformConnector {
  return {
    id: Number(row.id),
    name: String(row.name),
    platform_type: String(row.platform_type) as PlatformConnector["platform_type"],
    base_url: String(row.base_url),
    auth_type: String(row.auth_type) as PlatformConnector["auth_type"],
    auth_config: (row.auth_config ?? {}) as Record<string, string>,
    headers: (row.headers ?? {}) as Record<string, string>,
    enabled: Boolean(row.enabled),
    description: String(row.description ?? ""),
    sector: row.sector ? String(row.sector) : null,
    health_status: String(row.health_status ?? "unknown") as PlatformConnector["health_status"],
    last_health_check: row.last_health_check ? String(row.last_health_check) : null,
    created_by: row.created_by ? Number(row.created_by) : null,
    created_at: String(row.created_at),
  }
}
