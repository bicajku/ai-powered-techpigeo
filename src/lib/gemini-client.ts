/**
 * Gemini Client — C4 security fix
 *
 * Routes all Gemini API calls through the backend proxy instead of
 * calling Google APIs directly from the browser with client-side keys.
 *
 * Backend proxy routes:
 *   POST /api/proxy/gemini/generate — text generation
 *   POST /api/proxy/gemini/embed   — embeddings
 *   GET  /api/proxy/gemini/test    — connectivity test
 *
 * Falls back to direct Gemini API if backend proxy is not available
 * (backward compatibility during migration).
 */
import { GoogleGenerativeAI } from "@google/generative-ai"
import * as secretStore from "@/lib/secret-store"

let geminiInstance: GoogleGenerativeAI | null = null

const GEMINI_KEY_STORAGE = "sentinel-gemini-api-key"

function allowDirectGeminiFallback(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_ENABLE_DIRECT_GEMINI_FALLBACK === "true") {
    return true
  }
  if (typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV)) {
    return true
  }
  return false
}

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
  // Try sentinel JWT token first
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

export async function setGeminiApiKey(key: string): Promise<void> {
  // M8 fix: Store in encrypted secret-store only, never plaintext localStorage.
  // The backend proxy uses its own server-side GEMINI_API_KEY.
  if (typeof secretStore.storeSecret === "function") {
    await secretStore.storeSecret(GEMINI_KEY_STORAGE, key)
  }
  geminiInstance = new GoogleGenerativeAI(key)
}

export function isGeminiConfigured(): boolean {
  // Assume configured via backend environment variables
  return true
}

/** Direct Gemini fallback (only used when backend proxy unavailable) */
async function getGemini(): Promise<GoogleGenerativeAI> {
  if (geminiInstance) return geminiInstance

  // M8 fix: Only read from encrypted secret-store, never plaintext localStorage
  const key =
    typeof secretStore.retrieveSecret === "function"
      ? await secretStore.retrieveSecret(GEMINI_KEY_STORAGE)
      : null
  if (!key) {
    throw new Error("Gemini API key not configured. Go to Admin → Settings to add it.")
  }

  geminiInstance = new GoogleGenerativeAI(key)
  return geminiInstance
}

export async function geminiGenerate(
  prompt: string,
  options?: { model?: string; parseJson?: boolean }
): Promise<string> {
  let proxyError: string | null = null

  // Try backend proxy first
  try {
    const resp = await fetch(`${getBackendUrl()}/api/proxy/gemini/generate`, {
      method: "POST",
      headers: getProxyHeaders(),
      body: JSON.stringify({ prompt, model: options?.model }),
      signal: AbortSignal.timeout(30000),
      credentials: "include", // M1: Send CSRF cookie
    })
    if (resp.ok) {
      const data = await resp.json()
      if (data.ok && data.text) return data.text
    }
    proxyError = `Gemini proxy request failed with status ${resp.status}`
  } catch (err) {
    proxyError = err instanceof Error ? err.message : "Gemini proxy request failed"
  }

  if (!allowDirectGeminiFallback()) {
    throw new Error(proxyError || "Gemini proxy unavailable")
  }

  // Fallback: direct Gemini API (backward compatibility)
  const ai = await getGemini()
  const model = ai.getGenerativeModel({ model: options?.model ?? "gemini-2.5-flash" })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

export async function geminiEmbed(text: string): Promise<number[]> {
  let proxyError: string | null = null

  // Try backend proxy first
  try {
    const resp = await fetch(`${getBackendUrl()}/api/proxy/gemini/embed`, {
      method: "POST",
      headers: getProxyHeaders(),
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
      credentials: "include", // M1: Send CSRF cookie
    })
    if (resp.ok) {
      const data = await resp.json()
      if (data.ok && data.embeddings) return data.embeddings
    }
    proxyError = `Gemini embedding proxy failed with status ${resp.status}`
  } catch (err) {
    proxyError = err instanceof Error ? err.message : "Gemini embedding proxy unavailable"
  }

  if (!allowDirectGeminiFallback()) {
    throw new Error(proxyError || "Gemini embedding proxy unavailable")
  }

  // Fallback: direct Gemini API
  const ai = await getGemini()
  const model = ai.getGenerativeModel({ model: "text-embedding-004" })
  const result = await model.embedContent(text)
  return result.embedding.values
}

export async function geminiEmbedBatch(texts: string[]): Promise<number[][]> {
  let proxyError: string | null = null

  // Try backend proxy first (batch mode)
  try {
    const resp = await fetch(`${getBackendUrl()}/api/proxy/gemini/embed`, {
      method: "POST",
      headers: getProxyHeaders(),
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(30000),
      credentials: "include", // M1: Send CSRF cookie
    })
    if (resp.ok) {
      const data = await resp.json()
      if (data.ok && data.embeddings && data.batch) return data.embeddings
    }
    proxyError = `Gemini batch embedding proxy failed with status ${resp.status}`
  } catch (err) {
    proxyError = err instanceof Error ? err.message : "Gemini batch embedding proxy unavailable"
  }

  if (!allowDirectGeminiFallback()) {
    throw new Error(proxyError || "Gemini batch embedding proxy unavailable")
  }

  // Fallback: direct sequential embedding
  const embeddings: number[][] = []
  for (const text of texts) {
    const emb = await geminiEmbed(text)
    embeddings.push(emb)
  }
  return embeddings
}

export async function testGeminiConnection(): Promise<{ ok: boolean; error?: string }> {
  let proxyError: string | null = null

  // Try backend proxy test first
  try {
    const resp = await fetch(`${getBackendUrl()}/api/proxy/gemini/test`, {
      headers: getProxyHeaders(),
      signal: AbortSignal.timeout(10000),
      credentials: "include", // M1: Send CSRF cookie
    })
    if (resp.ok) {
      return await resp.json()
    }
    proxyError = `Gemini test proxy failed with status ${resp.status}`
  } catch (err) {
    proxyError = err instanceof Error ? err.message : "Gemini test proxy unavailable"
  }

  if (!allowDirectGeminiFallback()) {
    return { ok: false, error: proxyError || "Gemini proxy unavailable" }
  }

  // Fallback: direct test
  try {
    const response = await geminiGenerate("Respond with exactly: OK")
    return { ok: response.toLowerCase().includes("ok") }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gemini connection failed" }
  }
}
