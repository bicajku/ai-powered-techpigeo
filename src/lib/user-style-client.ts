/**
 * User Style Profile Client
 * Frontend API for interacting with the user style profiling service
 */

const STYLE_API_BASE = "/api/sentinel/user-style"

function getStyleHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  try {
    const token = typeof localStorage !== "undefined"
      ? (localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
      : null
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // ignore localStorage access errors
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

  return headers
}

export interface GenerationInsightRequest {
  conceptMode: string
  tonePreference: string
  audienceLevel: string
  sectionsEdited?: string[]
  qualityScore?: number
  costCents?: number
  wasSaved?: boolean
}

export interface StyleFeedbackRequest {
  qualityRating: number
  toneFit?: number
  audienceMatch?: number
  originality?: number
  comment?: string
}

export interface UserStyleProfile {
  userId: string
  preferredIndustries: Array<{ industry: string; count: number }>
  dominantTone: string
  audienceLevel: string
  frequentEdits: Array<{ section: string; count: number }>
  avgQualityScore: number
}

/**
 * Track a generation for user profiling
 */
export async function trackGenerationInsight(
  request: GenerationInsightRequest
): Promise<boolean> {
  try {
    const response = await fetch(`${STYLE_API_BASE}/track-generation`, {
      method: "POST",
      headers: getStyleHeaders(),
      credentials: "include", // Include JWT from cookies
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      console.warn("Failed to track generation insight:", response.statusText)
      return false
    }

    return true
  } catch (error) {
    console.error("Error tracking generation insight:", error)
    return false
  }
}

/**
 * Fetch user's computed style profile
 */
export async function getUserStyleProfile(): Promise<
  UserStyleProfile | null
> {
  try {
    const response = await fetch(`${STYLE_API_BASE}/profile`, {
      method: "GET",
      credentials: "include",
    })

    if (!response.ok) {
      console.warn("Failed to fetch user style profile:", response.statusText)
      return null
    }

    const data = await response.json()
    return data.profile || null
  } catch (error) {
    console.error("Error fetching user style profile:", error)
    return null
  }
}

/**
 * Record explicit user feedback on a strategy
 */
export async function recordStyleFeedback(
  request: StyleFeedbackRequest
): Promise<boolean> {
  try {
    const response = await fetch(`${STYLE_API_BASE}/feedback`, {
      method: "POST",
      headers: getStyleHeaders(),
      credentials: "include",
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      console.warn("Failed to record style feedback:", response.statusText)
      return false
    }

    return true
  } catch (error) {
    console.error("Error recording style feedback:", error)
    return false
  }
}
