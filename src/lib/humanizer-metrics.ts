import { getEnvConfig } from "@/lib/env-config"

export interface HumanizerMeterScores {
  aiLikelihood: number
  similarityRisk: number
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)))
}

export function estimateHumanizerMeters(input: string): HumanizerMeterScores {
  const normalized = input.trim()
  if (!normalized) {
    return { aiLikelihood: 0, similarityRisk: 0 }
  }

  const words = normalized.split(/\s+/).filter(Boolean)
  const sentences = normalized.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : words.length
  const lexicalDiversity = words.length > 0
    ? new Set(words.map((w) => w.toLowerCase())).size / words.length
    : 0

  const repetitivePhraseHits = (normalized.match(/\b(in conclusion|furthermore|moreover|in addition|therefore)\b/gi) || []).length
  const contractionHits = (normalized.match(/\b\w+'(t|re|ve|ll|d|s)\b/gi) || []).length

  let aiLikelihood = 45
  if (avgSentenceLength > 24) aiLikelihood += 14
  if (avgSentenceLength < 10) aiLikelihood += 8
  if (lexicalDiversity < 0.42) aiLikelihood += 18
  if (lexicalDiversity > 0.62) aiLikelihood -= 8
  aiLikelihood += Math.min(14, repetitivePhraseHits * 3)
  aiLikelihood -= Math.min(8, contractionHits * 1.5)

  const longWordRatio = words.length > 0
    ? words.filter((w) => w.replace(/[^a-zA-Z]/g, "").length >= 9).length / words.length
    : 0

  let similarityRisk = 30
  if (longWordRatio > 0.28) similarityRisk += 14
  if (lexicalDiversity < 0.45) similarityRisk += 18
  if (sentences.length > 0 && avgSentenceLength > 22) similarityRisk += 12

  return {
    aiLikelihood: clampScore(aiLikelihood),
    similarityRisk: clampScore(similarityRisk),
  }
}

function canUseServerScoring(): boolean {
  const config = getEnvConfig()
  return Boolean(
    config.enableServerHumanizerScoring &&
    config.useBackendLlm &&
    config.backendApiBaseUrl
  )
}

export function getHumanizerScoringModeLabel(): "server" | "heuristic" {
  return canUseServerScoring() ? "server" : "heuristic"
}

export async function scoreHumanizerMeters(input: string): Promise<HumanizerMeterScores> {
  const fallback = estimateHumanizerMeters(input)
  if (!input.trim()) {
    return fallback
  }

  if (!canUseServerScoring()) {
    return fallback
  }

  const config = getEnvConfig()
  const endpoint = `${config.backendApiBaseUrl}/api/humanizer/score`

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    // Prefer Sentinel JWT over legacy API key
    const sentinelToken = typeof window !== "undefined"
      ? (localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
      : null
    if (sentinelToken) {
      headers["Authorization"] = `Bearer ${sentinelToken}`
    }

    // CSRF token from cookie
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
      body: JSON.stringify({ text: input }),
    })

    if (!response.ok) {
      return fallback
    }

    const data = await response.json() as {
      aiLikelihood?: number
      similarityRisk?: number
      scores?: { aiLikelihood?: number; similarityRisk?: number }
    }

    const aiLikelihoodRaw =
      typeof data.aiLikelihood === "number"
        ? data.aiLikelihood
        : data.scores?.aiLikelihood

    const similarityRiskRaw =
      typeof data.similarityRisk === "number"
        ? data.similarityRisk
        : data.scores?.similarityRisk

    if (typeof aiLikelihoodRaw !== "number" || typeof similarityRiskRaw !== "number") {
      return fallback
    }

    return {
      aiLikelihood: clampScore(aiLikelihoodRaw),
      similarityRisk: clampScore(similarityRiskRaw),
    }
  } catch {
    return fallback
  }
}
