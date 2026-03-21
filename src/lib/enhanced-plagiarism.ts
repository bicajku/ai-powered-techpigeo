/**
 * Enhanced Plagiarism Check Integration
 * Combines LLM-based detection with advanced algorithmic analysis
 */

import { AdvancedDetectionResult, performAdvancedDetection } from "./advanced-detection"
import { PlagiarismResult } from "@/types"

export async function performEnhancedPlagiarismCheck(
  text: string,
  spark: any,
  maxRetries: number = 3
): Promise<{ result: PlagiarismResult; advancedMetrics: AdvancedDetectionResult }> {
  // First, run advanced detection algorithms locally
  const advancedMetrics = performAdvancedDetection(text)
  
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Then enhance with LLM-based analysis
      const prompt = spark.llmPrompt`You are an elite plagiarism detection and AI content detection system trained on the world's most sophisticated detection models.

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

{
  "overallScore": <0-100, higher is more original>,
  "plagiarismPercentage": <0-100>,
  "aiContentPercentage": <0-100>,
  "highlights": [
    {
      "text": "<suspected passage>",
      "startIndex": <position>,
      "endIndex": <position>,
      "severity": "<high|medium|low>",
      "source": "<source if identified>",
      "confidence": <0-100>
    }
  ],
  "aiHighlights": [
    {
      "text": "<AI-likely passage>",
      "startIndex": <position>,
      "endIndex": <position>,
      "confidence": <0-100>,
      "indicators": ["<indicator1>", "<indicator2>"]
    }
  ],
  "summary": "<comprehensive analysis>",
  "recommendations": ["<rec1>", "<rec2>"],
  "turnitinReady": <boolean>,
  "validReferences": [
    {
      "reference": "<ref text>",
      "isValid": <boolean>,
      "reason": "<why>"
    }
  ],
  "detectedSources": [
    {
      "source": "<source>",
      "similarity": <0-100>,
      "confidence": <0-100>
    }
  ],
  "enhancedMetrics": {
    "aiProbability": ${advancedMetrics.aiProbability},
    "plagiarismProbability": ${advancedMetrics.plagiarismProbability},
    "integrityScore": ${advancedMetrics.integrityScore},
    "confidenceLevel": "${advancedMetrics.confidenceLevel}",
    "riskFactors": ${JSON.stringify(advancedMetrics.riskFactors)}
  }
}`

      const response = await spark.llm(prompt, "gpt-4o", true)
      
      let cleanedResponse = response.trim()
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/```\s*$/, "")
      } else if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/```\s*$/, "")
      }
      
      cleanedResponse = cleanedResponse.trim()
      
      const firstBrace = cleanedResponse.indexOf('{')
      const lastBrace = cleanedResponse.lastIndexOf('}')
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1)
      }
      
      cleanedResponse = cleanedResponse
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u2013/g, '-')
        .replace(/\u2014/g, '--')
        .replace(/\u2026/g, '...')
      
      let parsedResult: PlagiarismResult
      
      try {
        parsedResult = JSON.parse(cleanedResponse) as PlagiarismResult
      } catch (parseError) {
        console.error(`Enhanced plagiarism JSON parse error (attempt ${attempt}/${maxRetries}):`, parseError)
        console.error("Response preview:", cleanedResponse.substring(0, 500))
        
        throw new Error(`Failed to parse plagiarism analysis response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
      }
      
      // Enhance results with advanced metrics
      const enhancedResult: PlagiarismResult = {
        ...parsedResult,
        // Boost scores if advanced detection confirms issues
        aiContentPercentage: Math.max(
          parsedResult.aiContentPercentage,
          Math.round(advancedMetrics.aiProbability * 0.9)
        ),
        plagiarismPercentage: Math.max(
          parsedResult.plagiarismPercentage,
          Math.round(advancedMetrics.plagiarismProbability * 0.85)
        ),
        // Adjust overall score based on combined analysis
        overallScore: Math.min(
          Math.max(
            100 - (
              Math.round(advancedMetrics.aiProbability * 0.35) +
              Math.round(advancedMetrics.plagiarismProbability * 0.65)
            ),
            0
          ),
          100
        ),
        // Add advanced recommendations
        recommendations: [
          ...parsedResult.recommendations,
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
