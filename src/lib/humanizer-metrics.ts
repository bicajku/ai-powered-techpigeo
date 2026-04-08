import { getEnvConfig } from "@/lib/env-config"

export interface HumanizerMeterScores {
  aiLikelihood: number
  similarityRisk: number
}

export interface HumanizerCandidateScore extends HumanizerMeterScores {
  preservationScore: number
  variationScore: number
  readabilityScore: number
  overallScore: number
  notes: string[]
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)))
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
}

function calculateTokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left))
  const rightTokens = new Set(tokenize(right))

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0
  }

  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1
    }
  })

  return (overlap / Math.max(leftTokens.size, rightTokens.size)) * 100
}

function calculateReadabilityBalance(text: string): number {
  const normalized = text.trim()
  if (!normalized) {
    return 0
  }

  const words = normalized.split(/\s+/).filter(Boolean)
  const sentences = normalized.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean)
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : words.length

  if (avgSentenceLength < 8) return 55
  if (avgSentenceLength < 14) return 82
  if (avgSentenceLength < 20) return 92
  if (avgSentenceLength < 26) return 78
  return 60
}

export function scoreHumanizerCandidate(originalText: string, candidateText: string): HumanizerCandidateScore {
  const candidateMeters = estimateHumanizerMeters(candidateText)
  const overlap = calculateTokenOverlap(originalText, candidateText)
  const originalWords = originalText.trim().split(/\s+/).filter(Boolean)
  const candidateWords = candidateText.trim().split(/\s+/).filter(Boolean)
  const lengthDelta = originalWords.length > 0
    ? Math.abs(candidateWords.length - originalWords.length) / originalWords.length
    : 0

  let preservationScore = 55
  preservationScore += Math.min(35, overlap * 0.35)
  preservationScore -= Math.min(20, lengthDelta * 100)

  const variationScore = Math.max(
    0,
    Math.min(
      100,
      Math.round((100 - candidateMeters.aiLikelihood) * 0.6 + (100 - candidateMeters.similarityRisk) * 0.4)
    )
  )

  const readabilityScore = calculateReadabilityBalance(candidateText)
  const overallScore = Math.max(
    1,
    Math.min(
      99,
      Math.round(
        preservationScore * 0.42 +
        variationScore * 0.4 +
        readabilityScore * 0.18
      )
    )
  )

  const notes: string[] = []
  if (candidateMeters.aiLikelihood <= 35) notes.push("Lower detector-pattern estimate")
  if (candidateMeters.similarityRisk <= 35) notes.push("Lower surface-similarity estimate")
  if (preservationScore >= 75) notes.push("Meaning preservation stayed strong")
  if (readabilityScore >= 85) notes.push("Sentence flow stayed balanced")

  return {
    ...candidateMeters,
    preservationScore: clampScore(preservationScore),
    variationScore: clampScore(variationScore),
    readabilityScore: clampScore(readabilityScore),
    overallScore,
    notes: notes.slice(0, 3),
  }
}

export function selectBestHumanizerCandidate<T extends { humanizedText: string }>(
  originalText: string,
  candidates: T[]
): { best: T; score: HumanizerCandidateScore; ranked: Array<{ candidate: T; score: HumanizerCandidateScore }> } {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreHumanizerCandidate(originalText, candidate.humanizedText),
    }))
    .sort((left, right) => right.score.overallScore - left.score.overallScore)

  return {
    best: ranked[0].candidate,
    score: ranked[0].score,
    ranked,
  }
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

export async function rankHumanizerCandidatesOnServer<T extends { id?: string; humanizedText: string; strategy?: string; changes?: Array<{ original: string; humanized: string }> }>(
  originalText: string,
  candidates: T[]
): Promise<{ ranked: Array<{ candidate: T; score: HumanizerCandidateScore }>; bestId: string | null } | null> {
  if (!originalText.trim() || candidates.length === 0 || !canUseServerScoring()) {
    return null
  }

  const config = getEnvConfig()
  const endpoint = `${config.backendApiBaseUrl || ""}/api/humanizer/score`

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
      body: JSON.stringify({
        originalText,
        candidates: candidates.map((candidate, index) => ({
          id: candidate.id || `candidate-${index + 1}`,
          humanizedText: candidate.humanizedText,
          strategy: candidate.strategy,
          changes: candidate.changes || [],
        })),
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json() as {
      ranked?: Array<{
        id: string
        humanizedText: string
        strategy?: string
        changes?: Array<{ original: string; humanized: string }>
        scores: HumanizerCandidateScore
      }>
      bestId?: string | null
    }

    if (!Array.isArray(data.ranked) || data.ranked.length === 0) {
      return null
    }

    const ranked = data.ranked.map((entry) => {
      const candidate = candidates.find((item, index) => (item.id || `candidate-${index + 1}`) === entry.id)
      if (!candidate) {
        return null
      }

      return {
        candidate,
        score: {
          ...entry.scores,
          aiLikelihood: clampScore(entry.scores.aiLikelihood),
          similarityRisk: clampScore(entry.scores.similarityRisk),
          preservationScore: clampScore(entry.scores.preservationScore),
          variationScore: clampScore(entry.scores.variationScore),
          readabilityScore: clampScore(entry.scores.readabilityScore),
          overallScore: clampScore(entry.scores.overallScore),
          notes: Array.isArray(entry.scores.notes) ? entry.scores.notes : [],
        },
      }
    }).filter((entry): entry is { candidate: T; score: HumanizerCandidateScore } => Boolean(entry))

    if (ranked.length === 0) {
      return null
    }

    return {
      ranked,
      bestId: data.bestId || null,
    }
  } catch {
    return null
  }
}
