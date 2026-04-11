/**
 * embed-client.ts — Provider-agnostic text embedding
 *
 * Calls POST /api/proxy/embed on the backend which uses:
 *   1. GitHub Models text-embedding-3-small (1536-dim)
 *
 * Produces 1536-dim vectors, matching the production sentinel_brain vector schema.
 */

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

/**
 * Embed a single text string into a 1536-dimensional vector.
 * Uses GitHub Models token on the backend.
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${getBackendBaseUrl()}/api/proxy/embed`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ text }),
    credentials: "include",
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body?.error || `Embed proxy error (${res.status})`)
  }
  const data = await res.json() as { ok: boolean; embeddings: number[] }
  if (!data.ok || !Array.isArray(data.embeddings)) {
    throw new Error("Invalid embed response from backend")
  }
  return data.embeddings
}

/**
 * Embed multiple texts in one round-trip.
 * Returns an array of 1536-dim vectors in the same order as input.
 */
export async function embedTextBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const res = await fetch(`${getBackendBaseUrl()}/api/proxy/embed`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ texts }),
    credentials: "include",
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body?.error || `Embed proxy error (${res.status})`)
  }
  const data = await res.json() as { ok: boolean; embeddings: number[][] | number[]; batch: boolean }
  if (!data.ok) throw new Error("Invalid embed response from backend")
  // If only one text was sent the backend returns a flat array
  return data.batch ? (data.embeddings as number[][]) : [[...(data.embeddings as number[])]]
}
