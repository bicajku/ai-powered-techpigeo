import { getEnvConfig } from "@/lib/env-config"

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

export interface WebSearchResponse {
  ok: boolean
  provider: string
  results: WebSearchResult[]
}

export async function searchWeb(query: string, limit = 4): Promise<WebSearchResponse> {
  const config = getEnvConfig()
  const baseUrl = config.backendApiBaseUrl ? config.backendApiBaseUrl.replace(/\/$/, "") : ""

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  const token = typeof localStorage !== "undefined"
    ? (localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
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
    // Ignore cookie access issues
  }

  const response = await fetch(`${baseUrl}/api/web/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, limit, module: "rag_chat" }),
    credentials: "include",
  })

  if (!response.ok) {
    const message = await response.text().catch(() => "Web search request failed")
    throw new Error(message || "Web search request failed")
  }

  return (await response.json()) as WebSearchResponse
}
