import { getEnvConfig } from "@/lib/env-config"
import { PlagiarismResult } from "@/types"
import { ReviewComputationMeta, ReviewFilters } from "@/lib/review-engine"

function canUseServerReviewScoring(): boolean {
  const config = getEnvConfig()
  return Boolean(config.backendApiBaseUrl !== null)
}

export async function scoreReviewMetaOnServer(
  text: string,
  rawResult: PlagiarismResult,
  filters: ReviewFilters,
): Promise<ReviewComputationMeta | null> {
  if (!text.trim() || !canUseServerReviewScoring()) {
    return null
  }

  const config = getEnvConfig()
  const endpoint = `${config.backendApiBaseUrl || ""}/api/review/score`

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    const sentinelToken = typeof window !== "undefined"
      ? (localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
      : null
    if (sentinelToken) {
      headers["Authorization"] = `Bearer ${sentinelToken}`
    }

    if (typeof document !== "undefined") {
      const csrfMatch = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("__csrf="))
      if (csrfMatch) {
        headers["X-CSRF-Token"] = csrfMatch.slice("__csrf=".length)
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ text, rawResult, filters }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json() as { meta?: ReviewComputationMeta }
    return data.meta || null
  } catch {
    return null
  }
}
