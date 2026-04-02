/**
 * Neon Database Client — C5 security fix
 *
 * Routes all database queries through the backend proxy instead of
 * connecting directly from the browser to Neon.
 *
 * Backend proxy routes:
 *   POST /api/proxy/db/query — parameterized SQL execution
 *   GET  /api/proxy/db/test  — connectivity test
 *
 * Falls back to direct Neon connection if backend proxy is not
 * available (backward compatibility during migration).
 */
import { neon } from "@neondatabase/serverless"
import * as secretStore from "@/lib/secret-store"

let sqlClient: ReturnType<typeof neon> | null = null

const NEON_DB_URL_KEY = "sentinel-neon-db-url"

/** Get the backend API base URL */
function getBackendUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL;
  }
  return "";
}

/** Get auth headers for backend proxy calls */
function getProxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token =
    typeof localStorage !== "undefined"
      ? (localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
      : null
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  // M1 fix: Attach CSRF token from cookie
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

// ── Public API (unchanged signatures for backward compatibility) ──

export async function setNeonDbUrl(url: string): Promise<void> {
  // Store in encrypted secret-store only (M6 fix: no plaintext localStorage)
  // The backend proxy uses its own server-side NEON_DATABASE_URL
  if (typeof secretStore.storeSecret === "function") {
    await secretStore.storeSecret(NEON_DB_URL_KEY, url)
  }
  sqlClient = neon(url)
}

export function isNeonConfigured(): boolean {
  // In the secure backend-proxy architecture, the database is configured 
  // via environment variables on the backend (Heroku Config Vars).
  // The frontend can assume it's configured and rely on backend API errors
  // if it's not.
  return true
}

/**
 * Get a Neon SQL client that routes through the backend proxy.
 *
 * Returns a function with the same call signature as the neon() tagged
 * template function, but routes queries through the backend proxy.
 * Falls back to direct connection if proxy is unavailable.
 */
export async function getNeonClient(): Promise<ReturnType<typeof neon>> {
  // Create a proxy function that routes queries through the backend
  const proxyFn = async function proxiedQuery(
    strings: TemplateStringsArray | string,
    ...values: unknown[]
  ): Promise<Record<string, unknown>[]> {
    // Build parameterized query from tagged template literal
    let query: string
    let params: unknown[]

    if (typeof strings === "string") {
      // Called as a regular function with a query string
      query = strings
      params = values
    } else {
      // Called as a tagged template literal: sql`SELECT * FROM t WHERE id = ${id}`
      query = ""
      params = []
      for (let i = 0; i < strings.length; i++) {
        query += strings[i]
        if (i < values.length) {
          params.push(values[i])
          query += `$${params.length}`
        }
      }
    }

    // Try backend proxy first
    try {
      const resp = await fetch(`${getBackendUrl()}/api/proxy/db/query`, {
        method: "POST",
        headers: getProxyHeaders(),
        body: JSON.stringify({ query, params }),
        signal: AbortSignal.timeout(15000),
        credentials: "include", // M1: Send CSRF cookie
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.ok) return data.rows || []
      }

      if (resp.status === 401 || resp.status === 403) {
        throw new Error("Authentication required for database proxy")
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required for database proxy") {
        throw error
      }
      // Backend unavailable, fall through to direct connection
    }

    // Fallback: direct Neon connection (backward compatibility)
    if (!sqlClient) {
      // M6 fix: Only read from encrypted secret-store, never plaintext localStorage
      const url =
        typeof secretStore.retrieveSecret === "function"
          ? await secretStore.retrieveSecret(NEON_DB_URL_KEY)
          : null
      if (!url) {
        throw new Error("Neon database URL not configured. Go to Admin → Settings to add it.")
      }
      sqlClient = neon(url)
    }

    // For tagged template usage, we need to call the original neon client
    if (typeof strings !== "string") {
      return sqlClient(strings, ...values) as Promise<Record<string, unknown>[]>
    }
    // For string query, use unsafe
    return sqlClient.call(null, strings as unknown as TemplateStringsArray, ...values) as Promise<
      Record<string, unknown>[]
    >
  }

  // Return the proxy function typed as a neon client
  return proxyFn as unknown as ReturnType<typeof neon>
}

export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  // Try backend proxy test first
  try {
    const resp = await fetch(`${getBackendUrl()}/api/proxy/db/test`, {
      headers: getProxyHeaders(),
      signal: AbortSignal.timeout(5000),
      credentials: "include", // M1: Send CSRF cookie
    })
    if (resp.ok) {
      return await resp.json()
    }
  } catch {
    // Backend unavailable, fall through
  }

  // Fallback: direct connection test
  try {
    const sql = await getNeonClient()
    const result = (await sql`SELECT 1 as ping`) as Record<string, unknown>[]
    return { ok: result.length > 0 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" }
  }
}
