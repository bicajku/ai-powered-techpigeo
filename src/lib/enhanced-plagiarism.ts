/**
 * Enhanced Plagiarism Check Integration
 * Combines LLM-based detection with advanced algorithmic analysis
 */

import { sentinelQuery } from "./sentinel-query-pipeline"
import { AdvancedDetectionResult, performAdvancedDetection } from "./advanced-detection"
import { PlagiarismResult } from "@/types"

export async function performEnhancedPlagiarismCheck(
  text: string,
  maxRetries: number = 3
): Promise<{ result: PlagiarismResult; advancedMetrics: AdvancedDetectionResult }> {
  // First, run advanced detection algorithms locally
  const advancedMetrics = performAdvancedDetection(text)
  
  let lastError: Error | null = null

  const parsePlagiarismResponse = (rawResponse: unknown): PlagiarismResult => {
    if (typeof rawResponse === "object" && rawResponse !== null) {
      return rawResponse as PlagiarismResult
    }

    if (typeof rawResponse !== "string") {
      throw new Error(`Unexpected plagiarism response type: ${typeof rawResponse}`)
    }

    let cleanedResponse = rawResponse.trim()
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/```\s*$/, "")
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/```\s*$/, "")
    }

    cleanedResponse = cleanedResponse.trim()

    const firstBrace = cleanedResponse.indexOf("{")
    const lastBrace = cleanedResponse.lastIndexOf("}")

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1)
    }

    cleanedResponse = cleanedResponse
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013/g, "-")
      .replace(/\u2014/g, "--")
      .replace(/\u2026/g, "...")

    const repairAttempts: string[] = []
    const basicCleanup = cleanedResponse
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === "\n" || ch === "\r" || ch === "\t" ? " " : "")
    repairAttempts.push(basicCleanup)

    if (!basicCleanup.endsWith("}")) {
      let truncated = basicCleanup

      // Close unterminated string value first
      const quoteCount = (truncated.match(/(?<!\\)"/g) || []).length
      if (quoteCount % 2 !== 0) {
        truncated += '"'
      }

      // Close any open arrays before braces
      const openBrackets = (truncated.match(/\[/g) || []).length
      const closeBrackets = (truncated.match(/\]/g) || []).length
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        truncated += "]"
      }

      // Close any open braces
      const openBraces = (truncated.match(/{/g) || []).length
      const closeBraces = (truncated.match(/}/g) || []).length
      for (let i = 0; i < openBraces - closeBraces; i++) {
        truncated += "}"
      }

      repairAttempts.push(truncated)

      // Also try removing the last incomplete property entirely and closing cleanly
      const lastCompleteField = basicCleanup.lastIndexOf(',"')
      if (lastCompleteField > 0) {
        let trimmed = basicCleanup.substring(0, lastCompleteField)
        const tOpenBrackets = (trimmed.match(/\[/g) || []).length
        const tCloseBrackets = (trimmed.match(/\]/g) || []).length
        for (let i = 0; i < tOpenBrackets - tCloseBrackets; i++) {
          trimmed += "]"
        }
        const tOpenBraces = (trimmed.match(/{/g) || []).length
        const tCloseBraces = (trimmed.match(/}/g) || []).length
        for (let i = 0; i < tOpenBraces - tCloseBraces; i++) {
          trimmed += "}"
        }
        repairAttempts.push(trimmed)
      }
    }

    for (const attempt of repairAttempts) {
      try {
        return JSON.parse(attempt) as PlagiarismResult
      } catch {
        // Try next repair strategy.
      }
    }

    throw new Error("Failed to parse plagiarism analysis response after repair attempts")
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Then enhance with LLM-based analysis
      const prompt = `You are an elite plagiarism detection and AI content detection system trained on the world's most sophisticated detection models.

Text to analyze (${text.length} characters):
${text}

CRITICAL ANALYSIS REQUIREMENTS:
1. Detect ALL plagiarism using semantic matching, paraphrase detection, and source matching
2. Detect AI-generated content using advanced stylometry, entropy analysis, and pattern recognition
3. Identify specific phrases that are copied, paraphrased, or generated
4. Rate Turnitin readiness based on the most stringent standards
5. Validate all citations and references
6. Identify suspicious patterns that indicate plagiarism or AI use

ADVANCED DETECTION FEATURES:
- Entropy anomalies (${advancedMetrics.entropyScore}%)
- Burstiness patterns (${advancedMetrics.burstinessScore}%)
- Stylometric inconsistencies (${advancedMetrics.stylometricScore}%)
- Repetition patterns (${advancedMetrics.repetitionPatternScore}%)
- Semantic consistency (${advancedMetrics.semanticConsistencyScore}%)

Return ONLY a valid JSON object with NO markdown, NO code blocks, NO text before or after.
Keep all string values concise (1-3 sentences max). Include sufficient evidence for accuracy.
For long documents, include up to 8 highlights and up to 8 aiHighlights when relevant.
You may include up to 8 recommendations, up to 8 validReferences, and up to 8 detectedSources.

{
  "overallScore": <0-100>,
  "plagiarismPercentage": <0-100>,
  "aiContentPercentage": <0-100>,
  "highlights": [{"text": "<passage>", "startIndex": 0, "endIndex": 50, "severity": "high", "source": "", "confidence": 80}],
  "aiHighlights": [{"text": "<passage>", "startIndex": 0, "endIndex": 50, "confidence": 80, "indicators": ["pattern"]}],
  "summary": "<2-3 sentence analysis>",
  "recommendations": ["<short rec>"],
  "turnitinReady": false,
  "validReferences": [{"reference": "<ref>", "isValid": true, "reason": "<why>"}],
  "detectedSources": [{"source": "<source>", "similarity": 0, "confidence": 0}]
}`

      const res = await sentinelQuery(prompt, {
        module: "plagiarism-check",
        contentType: "general",
        enableQualityGate: true,
        userInputForQualityGate: text,
        qualityGateProfile: "strict",
        preferCopilot: true,
        useConsensus: false,
      })
      if (res.status === "needs_clarification") {
        throw new Error(res.response || "Input is unclear for reliable integrity analysis.")
      }
      const response: unknown = typeof res.response === "string" ? res.response : JSON.stringify(res.response)

      let parsedResult: PlagiarismResult

      try {
        parsedResult = parsePlagiarismResponse(response)
      } catch (parseError) {
        const preview = typeof response === "string" ? response.substring(0, 500) : JSON.stringify(response).substring(0, 500)
        console.error(`Enhanced plagiarism JSON parse error (attempt ${attempt}/${maxRetries}):`, parseError)
        console.error("Response preview:", preview)

        throw new Error(`Failed to parse plagiarism analysis response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`)
      }
      
      const normalizedResult: PlagiarismResult = {
        overallScore: Number(parsedResult.overallScore || 0),
        plagiarismPercentage: Number(parsedResult.plagiarismPercentage || 0),
        aiContentPercentage: Number(parsedResult.aiContentPercentage || 0),
        highlights: Array.isArray(parsedResult.highlights) ? parsedResult.highlights : [],
        aiHighlights: Array.isArray(parsedResult.aiHighlights) ? parsedResult.aiHighlights : [],
        summary: typeof parsedResult.summary === "string" ? parsedResult.summary : "Analysis completed.",
        recommendations: Array.isArray(parsedResult.recommendations) ? parsedResult.recommendations : [],
        turnitinReady: Boolean(parsedResult.turnitinReady),
        validReferences: Array.isArray(parsedResult.validReferences) ? parsedResult.validReferences : [],
        detectedSources: Array.isArray(parsedResult.detectedSources) ? parsedResult.detectedSources : [],
      }

      const safeAiProb = Number.isFinite(advancedMetrics.aiProbability) ? advancedMetrics.aiProbability : 0
      const safePlagProb = Number.isFinite(advancedMetrics.plagiarismProbability) ? advancedMetrics.plagiarismProbability : 0

      // Enhance results with advanced metrics
      const enhancedResult: PlagiarismResult = {
        ...normalizedResult,
        // Boost scores if advanced detection confirms issues
        aiContentPercentage: Math.max(
          normalizedResult.aiContentPercentage,
          Math.round(safeAiProb * 0.9)
        ),
        plagiarismPercentage: Math.max(
          normalizedResult.plagiarismPercentage,
          Math.round(safePlagProb * 0.85)
        ),
        // Adjust overall score based on combined analysis
        overallScore: Math.min(
          Math.max(
            100 - (
              Math.round(safeAiProb * 0.35) +
              Math.round(safePlagProb * 0.65)
            ),
            0
          ),
          100
        ),
        // Add advanced recommendations
        recommendations: [
          ...normalizedResult.recommendations,
          ...(advancedMetrics.riskFactors.length > 0 ? advancedMetrics.riskFactors.map(f => `Risk: ${f}`) : [])
        ].slice(0, 12)
      }
      
      return {
        result: enhancedResult,
        advancedMetrics
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.error(`Enhanced plagiarism check failed on attempt ${attempt}/${maxRetries}:`, lastError)
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        continue
      }
    }
  }
  
  throw lastError || new Error("Enhanced plagiarism check failed after all retries")
}
