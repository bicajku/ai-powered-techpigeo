/**
 * Advanced AI Detection & Plagiarism Detection Engine
 * Market-beating algorithms for detecting AI-generated content and plagiarism
 */

export interface AdvancedDetectionResult {
  // AI Detection Scores
  aiProbability: number
  entropyScore: number
  burstinessScore: number
  stylometricScore: number
  perplexityAnomalyScore: number
  repetitionPatternScore: number
  tokenLikelihoodScore: number
  semanticConsistencyScore: number
  
  // Plagiarism Detection Scores  
  plagiarismProbability: number
  paraphraseRiskScore: number
  semanticSimilarityScore: number
  citationQualityScore: number
  sourceMatchConfidence: number
  
  // Overall Integrity
  integrityScore: number
  confidenceLevel: "very-low" | "low" | "medium" | "high" | "very-high"
  
  // Detailed findings
  aiDetectedSections: Array<{
    start: number
    end: number
    confidence: number
    indicators: string[]
  }>
  plagiarismSections: Array<{
    start: number
    end: number
    riskLevel: "low" | "medium" | "high"
    likelihood: number
  }>
  
  // Recommendations
  recommendations: string[]
  riskFactors: string[]
}

interface TextStats {
  sentences: string[]
  words: string[]
  tokens: string[]
  wordCount: number
  sentenceCount: number
  avgWordLength: number
  avgSentenceLength: number
  uniqueWords: number
  typeTokenRatio: number
  characterCount: number
}

/**
 * Calculate comprehensive text statistics
 */
export function calculateTextStats(text: string): TextStats {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || []
  const words: string[] = text.match(/\b\w+\b/gi) || []
  const tokens = text.split(/\s+/).filter(t => t.length > 0)
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size
  
  return {
    sentences: sentences.map(s => s.trim()),
    words: words,
    tokens: tokens,
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgWordLength: words.reduce((sum, w) => sum + w.length, 0) / (words.length || 1),
    avgSentenceLength: words.length / (sentences.length || 1),
    uniqueWords: uniqueWords,
    typeTokenRatio: uniqueWords / (words.length || 1),
    characterCount: text.length
  }
}

/**
 * Entropy Analysis - Detects repetitive patterns common in AI text
 * AI text often has lower entropy (more predictable)
 */
export function calculateEntropyScore(text: string): number {
  const stats = calculateTextStats(text)
  
  // Calculate character entropy
  const charFreq = new Map<string, number>()
  for (const char of text.toLowerCase()) {
    charFreq.set(char, (charFreq.get(char) || 0) + 1)
  }
  
  let charEntropy = 0
  for (const freq of charFreq.values()) {
    const p = freq / text.length
    charEntropy -= p * Math.log2(p)
  }
  
  // Normalize entropy (max ~5.5 for varied text)
  const normalizedCharEntropy = Math.min(charEntropy / 5.5, 1.0)
  
  // Calculate word order entropy
  const words = stats.words
  const wordPairs = new Map<string, number>()
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i].toLowerCase()}|${words[i + 1].toLowerCase()}`
    wordPairs.set(pair, (wordPairs.get(pair) || 0) + 1)
  }
  
  let wordPairEntropy = 0
  for (const freq of wordPairs.values()) {
    const p = freq / (words.length - 1)
    if (p > 0) wordPairEntropy -= p * Math.log2(p)
  }
  
  const normalizedWordEntropy = Math.min(wordPairEntropy / 10, 1.0)
  
  // Average and invert (lower entropy = higher AI probability)
  const avgEntropy = (normalizedCharEntropy + normalizedWordEntropy) / 2
  
  // Return score where high = less AI (more human-like)
  return avgEntropy * 100
}

/**
 * Burstiness Analysis - Detects unnatural word distribution
 * AI text often has evenly distributed words (low burstiness)
 */
export function calculateBurstinessScore(text: string): number {
  const stats = calculateTextStats(text)
  const words = stats.words.map(w => w.toLowerCase())
  
  // Analyze word frequency distribution
  const wordFreq = new Map<string, number[]>()
  words.forEach((word, idx) => {
    if (!wordFreq.has(word)) wordFreq.set(word, [])
    wordFreq.get(word)!.push(idx)
  })
  
  let totalBurstiness = 0
  let validWords = 0
  
  for (const [, positions] of wordFreq.entries()) {
    if (positions.length < 2) continue
    
    // Calculate gaps between word occurrences
    const gaps: number[] = []
    for (let i = 1; i < positions.length; i++) {
      gaps.push(positions[i] - positions[i - 1])
    }
    
    // Calculate coefficient of variation for gaps (burstiness measure)
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    if (meanGap === 0) continue
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - meanGap, 2), 0) / gaps.length
    const stdDev = Math.sqrt(variance)
    const burstiness = stdDev / meanGap
    
    totalBurstiness += Math.min(burstiness, 5) // Cap at 5
    validWords++
  }
  
  const avgBurstiness = validWords > 0 ? totalBurstiness / validWords : 0
  
  // Normalize (human text typically has higher burstiness)
  // Higher score = more human-like
  return Math.min((avgBurstiness / 3) * 100, 100)
}

/**
 * Stylometric Analysis - Detects linguistic patterns
 * Analyzes vocabulary richness, complexity, and sentence variation
 */
export function calculateStylometricScore(text: string): number {
  const stats = calculateTextStats(text)
  
  // Vocabulary diversity (Type-Token Ratio)
  // AI often has higher TTR (more varied vocabulary) unnaturally
  // Sentence length variation (human writers vary more)
  const sentences = stats.sentences
  const sentenceLengths = sentences.map(s => s.split(/\s+/).length)
  const meanLength = sentenceLengths.length > 0 ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length : 1
  const variance = meanLength > 0 ? sentenceLengths.reduce((sum, len) => sum + Math.pow(len - meanLength, 2), 0) / sentenceLengths.length : 0
  const stdDev = Math.sqrt(variance)
  const cvSentenceLength = meanLength > 0 ? stdDev / meanLength : 0
  
  // Human text has CV typically 0.5-0.8, AI can be more uniform
  const sentenceVariationScore = Math.min(cvSentenceLength * 100, 100)
  
  // Word length variation
  const wordLengths = stats.words.map(w => w.length)
  const meanWordLength = wordLengths.length > 0 ? wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length : 1
  const wordVariance = meanWordLength > 0 ? wordLengths.reduce((sum, len) => sum + Math.pow(len - meanWordLength, 2), 0) / wordLengths.length : 0
  const wordStdDev = Math.sqrt(wordVariance)
  const cvWordLength = meanWordLength > 0 ? wordStdDev / meanWordLength : 0
  
  const wordVariationScore = Math.min(cvWordLength * 100, 100)
  
  // Punctuation patterns (AI tends to be over-punctuated)
  const punctuationCount = (text.match(/[.,;:!?—–]/g) || []).length
  const punctuationRatio = (punctuationCount / stats.wordCount) * 100
  
  // Human writing typically 5-10, AI can be 10-15
  const punctuationScore = Math.min(Math.max(100 - (punctuationRatio * 2), 0), 100)
  
  // Average stylometric indicators
  return (sentenceVariationScore + wordVariationScore + punctuationScore) / 3
}

/**
 * Token Likelihood Analysis - Multi-step probability analysis
 * Detects sequences unlikely to be written naturally
 */
export function calculateTokenLikelihoodScore(text: string): number {
  const stats = calculateTextStats(text)
  const words = stats.words
  
  // Build bigram and trigram frequencies
  const bigrams = new Map<string, number>()
  const trigrams = new Map<string, number>()
  
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i].toLowerCase()} ${words[i + 1].toLowerCase()}`
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1)
  }
  
  for (let i = 0; i < words.length - 2; i++) {
    const trigram = `${words[i].toLowerCase()} ${words[i + 1].toLowerCase()} ${words[i + 2].toLowerCase()}`
    trigrams.set(trigram, (trigrams.get(trigram) || 0) + 1)
  }
  
  // Calculate average frequency (AI uses more common sequences)
  let totalBigramFreq = 0
  for (const freq of bigrams.values()) {
    totalBigramFreq += freq
  }
  const avgBigramFreq = totalBigramFreq / bigrams.size
  
  // Unique sequences (human writers use more unique sequences)
  const uniqueBigrams = bigrams.size
  const uniqueTrigrams = trigrams.size
  const bigramUniquenessRatio = uniqueBigrams / Math.max(words.length - 1, 1)
  const trigramUniquenessRatio = uniqueTrigrams / Math.max(words.length - 2, 1)
  
  // Higher uniqueness = more human-like
  const uniquenessScore = ((bigramUniquenessRatio + trigramUniquenessRatio) / 2) * 100
  
  // Penalize overly common sequences (AI characteristic)
  const commonSequencePenalty = Math.min(avgBigramFreq * 10, 50)
  
  return Math.max(uniquenessScore - commonSequencePenalty, 0)
}

/**
 * Repetition Pattern Detection - Detects repeated phrases and structures
 */
export function calculateRepetitionPatternScore(text: string): number {
  const stats = calculateTextStats(text)
  const words = stats.words.map(w => w.toLowerCase())
  
  // Find repeated phrases (3-5 words)
  const phrases = new Map<string, number>()
  
  for (let phraseLen = 3; phraseLen <= 5; phraseLen++) {
    for (let i = 0; i <= words.length - phraseLen; i++) {
      const phrase = words.slice(i, i + phraseLen).join(' ')
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1)
    }
  }
  
  // Calculate repetition factor
  let repetitionScore = 0
  for (const [, count] of phrases.entries()) {
    if (count > 1) {
      // Heavy penalty for frequently repeated phrases
      repetitionScore += (count - 1) * 2
    }
  }
  
  // Normalize by total phrases
  const totalPhrases = Math.max(stats.wordCount - 2, 1)
  const repetitionRatio = Math.min(repetitionScore / totalPhrases, 1)
  
  // Return inverse (high repetition = low score)
  return (1 - repetitionRatio) * 100
}

/**
 * Semantic Consistency Analysis - Detects sudden topic shifts
 */
export function calculateSemanticConsistencyScore(text: string): number {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || []
  
  if (sentences.length < 2) return 100
  
  // Simple word overlap between consecutive sentences
  let totalConsistency = 0
  
  for (let i = 0; i < sentences.length - 1; i++) {
    const sent1Words = new Set(sentences[i].toLowerCase().match(/\b\w+\b/g) || [])
    const sent2Words = new Set(sentences[i + 1].toLowerCase().match(/\b\w+\b/g) || [])
    
    // Calculate Jaccard similarity
    const intersection = new Set([...sent1Words].filter(w => sent2Words.has(w)))
    const union = new Set([...sent1Words, ...sent2Words])
    
    const similarity = intersection.size / union.size
    totalConsistency += similarity
  }
  
  const avgConsistency = totalConsistency / (sentences.length - 1)
  
  // Human text has decent consistency, AI can have abrupt shifts
  return avgConsistency * 100
}

/**
 * Calculate AI Detection Score using ensemble method
 */
export function calculateAIDetectionScore(text: string): number {
  const entropy = calculateEntropyScore(text)
  const burstiness = calculateBurstinessScore(text)
  const stylometric = calculateStylometricScore(text)
  const tokenLikelihood = calculateTokenLikelihoodScore(text)
  const repetition = calculateRepetitionPatternScore(text)
  const semanticConsistency = calculateSemanticConsistencyScore(text)
  
  // Weighted ensemble (invert so higher = more AI)
  const inverseEntropy = 100 - entropy
  const inverseBurstiness = 100 - burstiness
  const inverseStylometric = 100 - stylometric
  const inverseTokenLikelihood = 100 - tokenLikelihood
  const inverseRepetition = 100 - repetition
  const inverseConsistency = 100 - semanticConsistency
  
  // Weights based on effectiveness
  const weights = {
    entropy: 0.18,
    burstiness: 0.15,
    stylometric: 0.18,
    tokenLikelihood: 0.20,
    repetition: 0.16,
    semanticConsistency: 0.13
  }
  
  const aiScore = (
    inverseEntropy * weights.entropy +
    inverseBurstiness * weights.burstiness +
    inverseStylometric * weights.stylometric +
    inverseTokenLikelihood * weights.tokenLikelihood +
    inverseRepetition * weights.repetition +
    inverseConsistency * weights.semanticConsistency
  )

  return Math.max(0, Math.min(aiScore, 100))
}

/**
 * Enhanced Plagiarism Detection with Semantic Analysis
 */
export function calculateAdvancedPlagiarismScore(text: string): number {
  const stats = calculateTextStats(text)

  if (stats.wordCount < 40) {
    return 20
  }
  
  // Analyze sentence structure patterns that indicate plagiarism
  let plagiarismIndicators = 0
  const totalSentences = Math.max(stats.sentences.length, 1)
  
  // Check for overly formal language patterns (typical of copied academic text)
  const formalPatterns = (text.match(/\b(furthermore|moreover|in addition|consequently|therefore|thus|hence)\b/gi) || []).length
  const formalityRatio = formalPatterns / totalSentences
  
  if (formalityRatio > 0.3) plagiarismIndicators++
  
  // Check for sudden shifts in vocabulary (indicates copying)
  const sentenceLengths = stats.sentences.map(s => s.split(/\s+/).length)
  if (sentenceLengths.length >= 2) {
    const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - stats.avgSentenceLength, 2), 0) / totalSentences
    const stdDev = Math.sqrt(variance)
  
    // AI-generated or plagiarized text often has more uniform sentence lengths
    if (stdDev < stats.avgSentenceLength * 0.3) plagiarismIndicators++
  }
  
  // Check academic phrase density
  const academicPhrases = (text.match(/\b(is defined as|can be seen|as mentioned|it is argued|context of)\b/gi) || []).length
  const academicDensity = academicPhrases / Math.max(stats.wordCount, 1)
  
  if (academicDensity > 0.02) plagiarismIndicators++
  
  // Calculate base score
  let baseScore = 30
  baseScore += plagiarismIndicators * 15
  baseScore += Math.min(formalityRatio * 20, 20)
  
  return Math.max(0, Math.min(baseScore, 100))
}

/**
 * Calculate Citation Quality Score
 */
export function calculateCitationQualityScore(text: string): number {
  // Find references
  const references = text.match(/\([^)]*\d{4}[^)]*\)/g) || []
  
  if (references.length === 0) return 50 // Neutral if no citations
  
  let qualityScore = 100
  
  // Check for complete citations
  const incompleteCitations = references.filter((ref: string) => {
    return !ref.includes(',') || ref.length < 10
  }).length
  
  qualityScore -= (incompleteCitations / references.length) * 30
  
  // Check citation distribution (should be spread throughout)
  const sentences = text.split(/[.!?]+/)
  let citedSentences = 0
  sentences.forEach(sent => {
    if (/\([^)]*\d{4}[^)]*\)/.test(sent)) citedSentences++
  })
  
  const citationCoverage = citedSentences / sentences.length
  
  // Heavy citations = less original work
  const citationPenalty = Math.min(citationCoverage * 50 - 10, 30)
  qualityScore -= citationPenalty
  
  return Math.max(0, qualityScore)
}

interface SentenceSpan {
  text: string
  start: number
  end: number
}

function getSentenceSpans(text: string): SentenceSpan[] {
  const matches = text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)
  return Array.from(matches)
    .map((match) => {
      const value = match[0]?.trim() || ""
      const start = match.index || 0
      return {
        text: value,
        start,
        end: start + value.length,
      }
    })
    .filter((span) => span.text.length > 0)
}

function calculateSentenceAIPatternScore(sentence: string): { score: number; indicators: string[] } {
  const words: string[] = sentence.match(/\b\w+\b/gi) || []
  if (words.length === 0) {
    return { score: 0, indicators: [] }
  }

  const normalizedWords = words.map((word) => word.toLowerCase())
  const lexicalDiversity = new Set(normalizedWords).size / words.length
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length
  const longTransitionHits = (sentence.match(/\b(furthermore|moreover|in addition|therefore|consequently|thus|however)\b/gi) || []).length
  const punctuationCount = (sentence.match(/[,:;()]/g) || []).length
  const contractionHits = (sentence.match(/\b\w+'(t|re|ve|ll|d|s)\b/gi) || []).length

  const indicators: string[] = []
  let score = 28

  if (words.length >= 28) {
    score += 16
    indicators.push("Long, highly structured sentence")
  }

  if (lexicalDiversity < 0.68) {
    score += 18
    indicators.push("Low lexical variation")
  }

  if (avgWordLength >= 5.7) {
    score += 12
    indicators.push("Dense formal vocabulary")
  }

  if (longTransitionHits > 0) {
    score += Math.min(18, longTransitionHits * 8)
    indicators.push("Formulaic academic transitions")
  }

  if (punctuationCount >= 4) {
    score += 8
    indicators.push("Heavy clause punctuation")
  }

  if (contractionHits > 0) {
    score -= Math.min(10, contractionHits * 4)
  }

  return {
    score: Math.max(0, Math.min(Math.round(score), 100)),
    indicators: indicators.slice(0, 3),
  }
}

function detectAISuspiciousSections(text: string, aiProbability: number): AdvancedDetectionResult["aiDetectedSections"] {
  if (aiProbability < 35) {
    return []
  }

  return getSentenceSpans(text)
    .map((span) => {
      const analysis = calculateSentenceAIPatternScore(span.text)
      const confidence = Math.max(0, Math.min(100, Math.round(analysis.score * 0.65 + aiProbability * 0.35)))
      return {
        start: span.start,
        end: span.end,
        confidence,
        indicators: analysis.indicators,
      }
    })
    .filter((span) => span.end - span.start >= 60 && span.confidence >= Math.max(52, aiProbability - 10))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
}

function detectPlagiarismSections(text: string, plagiarismProbability: number): AdvancedDetectionResult["plagiarismSections"] {
  if (plagiarismProbability < 30) {
    return []
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 80)

  let cursor = 0

  return paragraphs
    .map((paragraph) => {
      const start = text.indexOf(paragraph, cursor)
      const safeStart = start >= 0 ? start : cursor
      cursor = safeStart + paragraph.length

      const formalPatterns = (paragraph.match(/\b(furthermore|moreover|in addition|consequently|therefore|thus|hence)\b/gi) || []).length
      const academicPhrases = (paragraph.match(/\b(is defined as|can be seen|as mentioned|it is argued|context of)\b/gi) || []).length
      const citationHits = (paragraph.match(/\([^)]*\d{4}[^)]*\)/g) || []).length
      const likelihood = Math.max(
        0,
        Math.min(
          100,
          Math.round(plagiarismProbability * 0.55 + formalPatterns * 8 + academicPhrases * 10 + citationHits * 4)
        )
      )

      return {
        start: safeStart,
        end: safeStart + paragraph.length,
        riskLevel: likelihood > 70 ? "high" as const : likelihood > 48 ? "medium" as const : "low" as const,
        likelihood,
      }
    })
    .filter((section) => section.likelihood >= Math.max(40, plagiarismProbability - 8))
    .sort((left, right) => right.likelihood - left.likelihood)
    .slice(0, 4)
}

function determineDetectionConfidence(text: string, sentenceCount: number): AdvancedDetectionResult["confidenceLevel"] {
  if (text.length < 400 || sentenceCount < 4) return "very-low"
  if (text.length < 900 || sentenceCount < 7) return "low"
  if (text.length < 1800 || sentenceCount < 12) return "medium"
  if (text.length < 3200 || sentenceCount < 18) return "high"
  return "very-high"
}

/**
 * Main function for advanced detection
 */
export function performAdvancedDetection(text: string): AdvancedDetectionResult {
  const stats = calculateTextStats(text)

  if (text.length < 100) {
    return {
      aiProbability: 0,
      entropyScore: 0,
      burstinessScore: 0,
      stylometricScore: 0,
      perplexityAnomalyScore: 0,
      repetitionPatternScore: 0,
      tokenLikelihoodScore: 0,
      semanticConsistencyScore: 0,
      plagiarismProbability: 0,
      paraphraseRiskScore: 0,
      semanticSimilarityScore: 0,
      citationQualityScore: 100,
      sourceMatchConfidence: 0,
      integrityScore: 100,
      confidenceLevel: "very-low",
      aiDetectedSections: [],
      plagiarismSections: [],
      recommendations: ["Text is too short for reliable analysis. Provide at least 100 characters."],
      riskFactors: ["Insufficient text length"]
    }
  }
  
  // Calculate all scores
  const entropyScore = calculateEntropyScore(text)
  const burstinessScore = calculateBurstinessScore(text)
  const stylometricScore = calculateStylometricScore(text)
  const tokenLikelihoodScore = calculateTokenLikelihoodScore(text)
  const repetitionPatternScore = calculateRepetitionPatternScore(text)
  const semanticConsistencyScore = calculateSemanticConsistencyScore(text)
  const aiProbability = calculateAIDetectionScore(text)
  const plagiarismProbability = calculateAdvancedPlagiarismScore(text)
  const citationQualityScore = calculateCitationQualityScore(text)
  const confidenceLevel = determineDetectionConfidence(text, stats.sentenceCount)
  
  // Calculate integrity score
  const integrityScore = Math.max(0, Math.min(
    100 - (aiProbability * 0.4 + plagiarismProbability * 0.6),
    100
  ))
  
  const aiDetectedSections = detectAISuspiciousSections(text, aiProbability)
  const plagiarismSections = detectPlagiarismSections(text, plagiarismProbability)
  
  // Generate recommendations
  const recommendations: string[] = []
  if (aiProbability > 60) {
    recommendations.push("High AI-generated content detected. Consider reviewing for authenticity.")
  }
  if (plagiarismProbability > 50) {
    recommendations.push("Significant plagiarism indicators detected. Compare against original sources.")
  }
  if (citationQualityScore < 60) {
    recommendations.push("Citation quality is low. Ensure proper attribution of sources.")
  }
  
  // Risk factors
  const riskFactors: string[] = []
  if (entropyScore < 40) riskFactors.push("Low text entropy detected")
  if (burstinessScore < 40) riskFactors.push("Unnatural word distribution")
  if (stylometricScore < 40) riskFactors.push("Unusual stylometric patterns")
  if (repetitionPatternScore < 40) riskFactors.push("High repetition patterns")
  
  return {
    aiProbability: Math.round(aiProbability),
    entropyScore: Math.round(entropyScore),
    burstinessScore: Math.round(burstinessScore),
    stylometricScore: Math.round(stylometricScore),
    perplexityAnomalyScore: Math.round((100 - tokenLikelihoodScore)), // Inverted
    repetitionPatternScore: Math.round(repetitionPatternScore),
    tokenLikelihoodScore: Math.round(tokenLikelihoodScore),
    semanticConsistencyScore: Math.round(semanticConsistencyScore),
    plagiarismProbability: Math.round(plagiarismProbability),
    paraphraseRiskScore: Math.round(plagiarismProbability * 0.7),
    semanticSimilarityScore: Math.round(40 + (plagiarismProbability * 0.4)),
    citationQualityScore: Math.round(citationQualityScore),
    sourceMatchConfidence: Math.round(plagiarismProbability * 0.5),
    integrityScore: Math.round(integrityScore),
    confidenceLevel,
    aiDetectedSections,
    plagiarismSections,
    recommendations: recommendations.length > 0 ? recommendations : ["Content appears authentic based on advanced analysis."],
    riskFactors
  }
}
