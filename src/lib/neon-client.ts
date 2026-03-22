import { neon } from "@neondatabase/serverless"

let sqlClient: ReturnType<typeof neon> | null = null

const NEON_DB_URL_KEY = "sentinel-neon-db-url"

function getStoredDbUrl(): string | null {
  try {
    return localStorage.getItem(NEON_DB_URL_KEY)
  } catch {
    return null
  }
}

export function setNeonDbUrl(url: string): void {
  try {
    localStorage.setItem(NEON_DB_URL_KEY, url)
    sqlClient = neon(url)
  } catch {
    console.warn("Failed to store Neon DB URL")
  }
}

export function isNeonConfigured(): boolean {
  return !!getStoredDbUrl()
}

export function getNeonClient(): ReturnType<typeof neon> {
  if (sqlClient) return sqlClient

  const url = getStoredDbUrl()
  if (!url) {
    throw new Error("Neon database URL not configured. Go to Admin → Settings to add it.")
  }

  sqlClient = neon(url)
  return sqlClient
}

export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const sql = getNeonClient()
    const result = await sql`SELECT 1 as ping` as Record<string, unknown>[]
    return { ok: result.length > 0 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" }
  }
}
