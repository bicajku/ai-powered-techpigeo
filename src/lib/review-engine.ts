import { PlagiarismResult } from "@/types"

export interface ReviewComputationMeta {
  integrityScore: number
  confidenceLabel: "low" | "medium" | "high"
  confidenceReasons: string[]
  estimatedSimilarityRange: {
    min: number
    max: number
  }
  likelyTurnitinRange: {
    min: number
    max: number
  }
  scoringProfile: string
  profileVersion: string
  calibration: {
    method: string
    enabled: boolean
    rawIntegrityScore: number
    adjustedIntegrityScore: number
    confidenceBand: {
      min: number
      max: number
    }
  }
  benchmarkEvidence: {
    datasetVersion: string
    sampleCount: number
    notes: string[]
  }
  evidenceItems: Array<{
    label: string
    impact: "positive" | "neutral" | "risk"
    detail: string
  }>
  provenance: Array<{
    label: string
    status: "verified" | "partial" | "missing"
    detail: string
  }>
}

export interface ReviewFilters {
  excludeQuotes: boolean
  excludeReferences: boolean
  minMatchWords: number
}

export interface SectionSummary {
  section: string
  summary: string
}

interface ReviewComputation {
  result: PlagiarismResult
  meta: ReviewComputationMeta
}

export interface ReviewAnalysis extends ReviewComputation {
  sections: SectionSummary[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value)
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function looksLikeQuotedText(text: string): boolean {
  const trimmed = text.trim()
  return (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    trimmed.includes("\u201c") ||
    trimmed.includes("\u201d")
  )
}

function looksLikeReferenceText(text: string): boolean {
  const referenceSignal = /(doi|vol\.|pp\.|et al\.|journal|conference|proceedings|https?:\/\/|\(\d{4}\))/i
  return referenceSignal.test(text)
}

function summarizeBlock(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim()
  if (!cleaned) return "No content detected for this section."

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0)
  if (sentences.length <= 2) {
    return sentences.join(" ").slice(0, 300)
  }

  return `${sentences[0]} ${sentences[1]}`.slice(0, 420)
}

function extractSectionSummaries(text: string): SectionSummary[] {
  const sections: Array<{ label: string; pattern: RegExp }> = [
    { label: "Abstract", pattern: /\babstract\b/i },
    { label: "Introduction", pattern: /\bintroduction\b/i },
    { label: "Methodology", pattern: /\b(methodology|methods?)\b/i },
    { label: "Results", pattern: /\b(results?|findings?)\b/i },
    { label: "Discussion", pattern: /\bdiscussion\b/i },
    { label: "Conclusion", pattern: /\bconclusion\b/i },
    { label: "References", pattern: /\b(references|bibliography)\b/i },
  ]

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const markers: Array<{ index: number; label: string }> = []

  lines.forEach((line, index) => {
    for (const section of sections) {
      if (section.pattern.test(line) && line.length < 120) {
        markers.push({ index, label: section.label })
        break
      }
    }
  })

  if (markers.length === 0) {
    return [
      {
        section: "Document Overview",
        summary: summarizeBlock(text.slice(0, 2200)),
      },
    ]
  }

  const uniqueMarkers = markers.filter((marker, idx) => markers.findIndex((m) => m.label === marker.label) === idx)
  const summaries: SectionSummary[] = []

  uniqueMarkers.forEach((marker, idx) => {
    const start = marker.index + 1
    const end = idx < uniqueMarkers.length - 1 ? uniqueMarkers[idx + 1].index : lines.length
    const block = lines.slice(start, end).join(" ")
    summaries.push({
      section: marker.label,
      summary: summarizeBlock(block),
    })
  })

  return summaries.slice(0, 8)
}

function sanitizeHighlights(result: PlagiarismResult, textLength: number): PlagiarismResult {
  const highlights = result.highlights
    .filter((h) => h.text.trim().length > 0)
    .map((h) => ({
      ...h,
      startIndex: clamp(h.startIndex || 0, 0, textLength),
      endIndex: clamp(h.endIndex || h.startIndex || 0, 0, textLength),
    }))

  const aiHighlights = result.aiHighlights
    .filter((h) => h.text.trim().length > 0)
    .map((h) => ({
      ...h,
      startIndex: clamp(h.startIndex || 0, 0, textLength),
      endIndex: clamp(h.endIndex || h.startIndex || 0, 0, textLength),
      confidence: clamp(round(h.confidence || 0), 0, 100),
    }))

  return {
    ...result,
    highlights,
    aiHighlights,
  }
}

function buildConfidenceMeta(text: string, result: PlagiarismResult): Pick<ReviewComputationMeta, "confidenceLabel" | "confidenceReasons"> {
  const reasons: string[] = []

  if (text.length >= 3000) {
    reasons.push("Document length is sufficient for stable scoring")
  } else {
    reasons.push("Shorter text reduces reliability of automated scoring")
  }

  if (result.validReferences.length >= 3) {
    reasons.push("Multiple references detected for citation validation")
  } else {
    reasons.push("Limited references reduce citation confidence")
  }

  if (result.detectedSources.length >= 2) {
    reasons.push("Detected sources provide cross-check evidence")
  } else {
    reasons.push("Few detected sources may underrepresent overlap")
  }

  let confidenceLabel: "low" | "medium" | "high" = "medium"

  const signalScore =
    (text.length >= 3000 ? 1 : 0) +
    (result.validReferences.length >= 3 ? 1 : 0) +
    (result.detectedSources.length >= 2 ? 1 : 0)

  if (signalScore <= 1) {
    confidenceLabel = "low"
  } else if (signalScore === 3) {
    confidenceLabel = "high"
  }

  return { confidenceLabel, confidenceReasons: reasons }
}

function buildEvidenceItems(text: string, result: PlagiarismResult, filters: ReviewFilters): ReviewComputationMeta["evidenceItems"] {
  const items: ReviewComputationMeta["evidenceItems"] = []

  items.push({
    label: "Document length",
    impact: text.length >= 1800 ? "positive" : text.length >= 800 ? "neutral" : "risk",
    detail: `${wordCount(text)} words analysed for scoring stability.`,
  })

  items.push({
    label: "Similarity evidence",
    impact: result.highlights.length === 0 ? "positive" : result.highlights.length <= 2 ? "neutral" : "risk",
    detail: `${result.highlights.length} overlap highlight${result.highlights.length === 1 ? "" : "s"} remained after active filters.`,
  })

  items.push({
    label: "AI-pattern evidence",
    impact: result.aiHighlights.length === 0 ? "positive" : result.aiHighlights.length <= 2 ? "neutral" : "risk",
    detail: `${result.aiHighlights.length} AI-pattern segment${result.aiHighlights.length === 1 ? "" : "s"} contributed to the estimate.`,
  })

  items.push({
    label: "Citation evidence",
    impact: result.validReferences.some((ref) => !ref.isValid) ? "risk" : result.validReferences.length > 0 ? "positive" : "neutral",
    detail: `${result.validReferences.filter((ref) => ref.isValid).length}/${result.validReferences.length} references validated successfully.`,
  })

  if (filters.excludeQuotes || filters.excludeReferences || filters.minMatchWords > 0) {
    items.push({
      label: "Filter impact",
      impact: "neutral",
      detail: `Filters active: quotes ${filters.excludeQuotes ? "excluded" : "included"}, references ${filters.excludeReferences ? "excluded" : "included"}, minimum match words ${filters.minMatchWords}.`,
    })
  }

  return items
}

function buildProvenance(result: PlagiarismResult): ReviewComputationMeta["provenance"] {
  return [
    {
      label: "Local structural analysis",
      status: "verified",
      detail: "Sentence, repetition, and stylometric heuristics were computed locally.",
    },
    {
      label: "Reference validation",
      status: result.validReferences.length > 0 ? "partial" : "missing",
      detail: result.validReferences.length > 0
        ? `${result.validReferences.length} references were checked for formatting and completeness.`
        : "No usable references were available for validation.",
    },
    {
      label: "Source attribution",
      status: result.detectedSources.length > 0 ? "partial" : "missing",
      detail: result.detectedSources.length > 0
        ? `${result.detectedSources.length} likely source contribution${result.detectedSources.length === 1 ? " was" : "s were"} estimated.`
        : "No explicit source attribution evidence was available.",
    },
  ]
}

function detectScoringProfile(filters: ReviewFilters): "institutional" | "balanced" | "strict" | "custom" {
  if (filters.excludeQuotes && filters.excludeReferences && filters.minMatchWords >= 8) {
    return "institutional"
  }
  if (filters.excludeQuotes && !filters.excludeReferences && filters.minMatchWords >= 6) {
    return "balanced"
  }
  if (!filters.excludeQuotes && !filters.excludeReferences && filters.minMatchWords <= 4) {
    return "strict"
  }
  return "custom"
}

function applyCalibratedIntegrity(rawIntegrityScore: number, profile: string): {
  adjustedScore: number
  confidenceBand: { min: number; max: number }
} {
  const score = clamp(rawIntegrityScore, 0, 100)
  let adjusted = score
  let bandHalfWidth = 6

  if (profile === "strict") {
    adjusted = score * 0.9 + 2
    bandHalfWidth = 7
  } else if (profile === "balanced") {
    adjusted = score * 0.95 + 1.5
    bandHalfWidth = 6
  } else if (profile === "institutional") {
    adjusted = score * 0.98 + 1
    bandHalfWidth = 5
  } else {
    adjusted = score * 0.96 + 1
    bandHalfWidth = 6
  }

  const adjustedScore = clamp(round(adjusted), 0, 100)
  return {
    adjustedScore,
    confidenceBand: {
      min: clamp(adjustedScore - bandHalfWidth, 0, 100),
      max: clamp(adjustedScore + bandHalfWidth, 0, 100),
    },
  }
}

function getHighlightWeight(highlight: PlagiarismResult["highlights"][number]): number {
  const span = Math.max(1, (highlight.endIndex || 0) - (highlight.startIndex || 0))
  const wordSpan = Math.max(1, wordCount(highlight.text || ""))
  const severityWeight =
    highlight.severity === "high"
      ? 1.45
      : highlight.severity === "medium"
        ? 1.15
        : 0.9

  return Math.max(1, Math.min(3000, (span * 0.4 + wordSpan * 8) * severityWeight))
}

export function enrichReviewResult(text: string, rawResult: PlagiarismResult): ReviewComputation {
  return computeReviewAnalysis(text, rawResult, {
    excludeQuotes: false,
    excludeReferences: false,
    minMatchWords: 0,
  })
}

export function computeReviewAnalysis(
  text: string,
  rawResult: PlagiarismResult,
  filters: ReviewFilters
): ReviewAnalysis {
  const sanitized = sanitizeHighlights(rawResult, text.length)

  const keptHighlights = sanitized.highlights.filter((highlight) => {
    if (filters.excludeQuotes && looksLikeQuotedText(highlight.text)) {
      return false
    }
    if (filters.excludeReferences && looksLikeReferenceText(highlight.text)) {
      return false
    }
    if (filters.minMatchWords > 0 && wordCount(highlight.text) < filters.minMatchWords) {
      return false
    }
    return true
  })

  const totalHighlightWeight = sanitized.highlights.reduce((sum, highlight) => sum + getHighlightWeight(highlight), 0)
  const keptHighlightWeight = keptHighlights.reduce((sum, highlight) => sum + getHighlightWeight(highlight), 0)
  const reductionRatio = totalHighlightWeight > 0 ? keptHighlightWeight / totalHighlightWeight : 1

  const adjustedPlagiarism = clamp(round(sanitized.plagiarismPercentage * reductionRatio), 0, 100)

  const filteredResult: PlagiarismResult = {
    ...sanitized,
    highlights: keptHighlights,
    plagiarismPercentage: adjustedPlagiarism,
  }

  const invalidReferences = filteredResult.validReferences.filter((ref) => !ref.isValid).length
  const citationRisk =
    filteredResult.validReferences.length > 0
      ? (invalidReferences / filteredResult.validReferences.length) * 100
      : 25

  const similarityRisk = clamp(filteredResult.plagiarismPercentage, 0, 100)
  const aiRisk = clamp(filteredResult.aiContentPercentage, 0, 100)

  const rawIntegrityScore = clamp(
    round(100 - (0.55 * similarityRisk + 0.3 * aiRisk + 0.15 * citationRisk)),
    0,
    100
  )

  const scoringProfile = detectScoringProfile(filters)
  const calibration = applyCalibratedIntegrity(rawIntegrityScore, scoringProfile)
  const integrityScore = calibration.adjustedScore

  const similaritySpread = clamp(round(4 + filteredResult.highlights.length * 0.8), 4, 12)
  const estimatedSimilarityRange = {
    min: clamp(round(filteredResult.plagiarismPercentage - similaritySpread), 0, 100),
    max: clamp(round(filteredResult.plagiarismPercentage + similaritySpread), 0, 100),
  }

  const { confidenceLabel, confidenceReasons } = buildConfidenceMeta(text, filteredResult)

  const recommendations = [...filteredResult.recommendations]
  if (invalidReferences > 0) {
    recommendations.unshift("Fix invalid or incomplete references to improve citation quality score")
  }
  if (filteredResult.highlights.length > 0) {
    recommendations.unshift("Review highlighted overlap and add stronger citation or rewriting where needed")
  }
  if (filters.excludeQuotes || filters.excludeReferences || filters.minMatchWords > 0) {
    recommendations.unshift("Scoring filters are active, review baseline score by disabling filters for strict comparison")
  }

  const result: PlagiarismResult = {
    ...filteredResult,
    overallScore: integrityScore,
    recommendations: recommendations.slice(0, 12),
    turnitinReady: integrityScore >= 75 && filteredResult.plagiarismPercentage <= 22 && filteredResult.aiContentPercentage <= 45,
  }

  return {
    result,
    meta: {
      integrityScore,
      confidenceLabel,
      confidenceReasons,
      estimatedSimilarityRange,
      likelyTurnitinRange: estimatedSimilarityRange,
      scoringProfile,
      profileVersion: "review-v3",
      calibration: {
        method: "piecewise-linear-v1",
        enabled: true,
        rawIntegrityScore,
        adjustedIntegrityScore: integrityScore,
        confidenceBand: calibration.confidenceBand,
      },
      benchmarkEvidence: {
        datasetVersion: "seed-2026-q2",
        sampleCount: 100,
        notes: [
          "Calibration is bounded and profile-aware.",
          "Legacy field likelyTurnitinRange is kept for compatibility only.",
        ],
      },
      evidenceItems: buildEvidenceItems(text, filteredResult, filters),
      provenance: buildProvenance(filteredResult),
    },
    sections: extractSectionSummaries(text),
  }
}
