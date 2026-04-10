import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  MagnifyingGlass, 
  UploadSimple, 
  FileText, 
  ShieldCheck, 
  Robot, 
  Sparkle,
  CheckCircle,
  WarningCircle,
  XCircle,
  LockKey,
  FloppyDisk
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { sentinelQuery } from "@/lib/sentinel-query-pipeline"
import { getSafeKVClient } from "@/lib/spark-shim"
import { DocumentFingerprintRecord, PlagiarismResult, DocumentReviewResult, ExternalSourceCheckResult, ExternalSourceMatch, HumanizedResult, HumanizerCandidateReview, SavedReviewDocument, UserProfile } from "@/types"
import { useSafeKV } from "@/hooks/useSafeKV"
import { SaveReviewDialog } from "@/components/SaveReviewDialog"
import { SavedReviews } from "@/components/SavedReviews"
import { buildDocumentPreview, createDocumentFingerprint, findFingerprintMatches, normalizeDocumentText } from "@/lib/document-fingerprint"
import { exportReviewToPDF } from "@/lib/pdf-export"
import { performEnhancedPlagiarismCheck } from "@/lib/enhanced-plagiarism"
import { performExternalSourceCheck } from "@/lib/external-source-check"
import { computeReviewAnalysis, ReviewComputationMeta, ReviewFilters, SectionSummary } from "@/lib/review-engine"
import { AdvancedDetectionResult } from "@/lib/advanced-detection"
import { addProCredits, consumeProCredits, consumeReviewCredit, getFeatureEntitlements, requestUpgrade } from "@/lib/subscription"
import { UpgradePaywall } from "@/components/UpgradePaywall"
import type { SubscriptionPlan } from "@/types"
import { getCurrentMonthKey, getExportPlanConfig } from "@/lib/strategy-governance"
import { estimateHumanizerMeters, getHumanizerScoringModeLabel, rankHumanizerCandidatesOnServer, scoreHumanizerMeters, selectBestHumanizerCandidate } from "@/lib/humanizer-metrics"
import { scoreReviewMetaOnServer } from "@/lib/review-scoring"
import mammoth from "mammoth"
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { createWorker } from "tesseract.js"

GlobalWorkerOptions.workerSrc = pdfWorkerUrl
const MAX_DOCUMENT_CHARS = 50000
const HUMANIZER_MAX_WORDS = 1000

type HumanizerWorkspaceEntry = {
  id: string
  label: string
  sourceName: string
  originalText: string
  humanizedText: string
  candidates?: HumanizerCandidateReview[]
  selectedCandidateId?: string | null
  semanticGuardrailReport?: SemanticGuardrailReport | null
  wordCount: number
  creditsUsed: number
  timestamp: number
}

type HumanizerBehaviorSettings = {
  tone: "neutral" | "friendly" | "professional" | "persuasive"
  formality: "casual" | "balanced" | "formal"
  readabilityGrade: number
  humanVariance: "low" | "medium" | "high"
  riskMode: "safe" | "balanced" | "aggressive"
  skillProfile: "balanced-v1" | "wikipedia-v2.5.1"
}

type HumanizerDraft = {
  id: string
  userId: string
  sourceText: string
  settings: HumanizerBehaviorSettings
  lastOutput: string
  candidates?: HumanizerCandidateReview[]
  selectedCandidateId?: string | null
  semanticGuardrailReport?: SemanticGuardrailReport | null
  aiScoreBefore: number
  aiScoreAfter: number
  similarityBefore: number
  similarityAfter: number
  updatedAt: number
  isFinal: boolean
}

type ReviewScoringProfile = "institutional" | "strict" | "balanced"

type HumanizerCandidatePayload = {
  humanizedText: string
  changes: Array<{ original: string; humanized: string }>
  strategy: string | undefined
}

type EvidenceMeter = {
  label: string
  value: number
  tone: "positive" | "neutral" | "risk"
}

type SourceVerificationSummary = {
  totalMatches: number
  verifiedProviders: number
  retentionAwareProviders: number
  liveProviders: number
  highestSimilarity: number
}

type RankedExternalMatch = ExternalSourceMatch & {
  rank: number
  trustScore: number
  confidence: "trusted" | "review" | "caution"
}

type ParaphraseCluster = {
  id: string
  provider: string
  repository: string
  count: number
  averageSimilarity: number
  highestSimilarity: number
  sampleSources: string[]
}

type SemanticGuardrailReport = {
  status: "pass" | "warn" | "fail"
  score: number
  missingAnchors: string[]
  numericDrift: string[]
  namedEntityDrift: string[]
  negationDrift: boolean
  notes: string[]
}

const DEFAULT_HUMANIZER_SETTINGS: HumanizerBehaviorSettings = {
  tone: "neutral",
  formality: "balanced",
  readabilityGrade: 8,
  humanVariance: "medium",
  riskMode: "balanced",
  skillProfile: "wikipedia-v2.5.1",
}

function getHumanizerSkillLabel(profile: HumanizerBehaviorSettings["skillProfile"]): string {
  if (profile === "wikipedia-v2.5.1") return "Wikipedia signals v2.5.1"
  return "Balanced default"
}

function buildHumanizerSkillDirective(profile: HumanizerBehaviorSettings["skillProfile"]): string {
  if (profile !== "wikipedia-v2.5.1") {
    return "Use a balanced rewrite strategy that prioritizes clarity, natural rhythm, and meaning preservation."
  }

  return `Use the Wikipedia-signals humanizer strategy:
- Remove inflated significance language, generic hype, and vague authority claims
- Reduce AI-isms such as formulaic transitions (furthermore/moreover/in conclusion)
- Avoid signposting phrases (let's dive in, here's what you need to know)
- Avoid forced rhetorical structures (not only... but also, it's not just...)
- Reduce em-dash overuse, emoji bullets, and bold-heading list artifacts
- Prefer direct constructions (is/are/has) over ornate substitutes
- Preserve concrete facts, numbers, named entities, qualifiers, and citations
- After drafting each candidate, run a brief anti-AI self-audit and tighten the rewrite once more`
}

interface PlagiarismCheckerProps {
  user: UserProfile | null
  mode?: "review" | "humanizer"
}

// Auth guard wrapper — keeps hooks unconditionally called in the inner component.
export function PlagiarismChecker({ user, mode = "review" }: PlagiarismCheckerProps) {
  if (!user) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <LockKey size={20} weight="duotone" />
            Authentication Required
          </CardTitle>
          <CardDescription>
            Sign in to access plagiarism review, AI detection, and re-upload history.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return <PlagiarismCheckerInner user={user} mode={mode} />
}

// Inner component: always receives a non-null user so hooks are always called unconditionally.
function PlagiarismCheckerInner({ user, mode }: { user: UserProfile; mode: "review" | "humanizer" }) {
  const userId = user.id
  const [text, setText] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [isHumanizing, setIsHumanizing] = useState(false)
  const [result, setResult] = useState<PlagiarismResult | null>(null)
  const [humanizedResult, setHumanizedResult] = useState<HumanizedResult | null>(null)
  const [humanizerCandidates, setHumanizerCandidates] = useState<HumanizerCandidateReview[]>([])
  const [selectedHumanizerCandidateId, setSelectedHumanizerCandidateId] = useState<string | null>(null)
  const [humanizerSettings, setHumanizerSettings] = useState<HumanizerBehaviorSettings>(DEFAULT_HUMANIZER_SETTINGS)
  const [humanizerScores, setHumanizerScores] = useState<{
    aiScoreBefore: number
    aiScoreAfter: number | null
    similarityBefore: number
    similarityAfter: number | null
  } | null>(null)
  const [semanticGuardrailReport, setSemanticGuardrailReport] = useState<SemanticGuardrailReport | null>(null)
  const [humanizerAnalyzed, setHumanizerAnalyzed] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [currentReviewResult, setCurrentReviewResult] = useState<DocumentReviewResult | null>(null)
  const [reviewMeta, setReviewMeta] = useState<ReviewComputationMeta | null>(null)
  const [sectionSummaries, setSectionSummaries] = useState<SectionSummary[]>([])
  const [externalSourceCheck, setExternalSourceCheck] = useState<ExternalSourceCheckResult | null>(null)
  const [showSavePlagiarismCheck, setShowSavePlagiarismCheck] = useState(false)
  const [plagiarismCheckLabel, setPlagiarismCheckLabel] = useState("")
  const [savedPlagiarismChecks, setSavedPlagiarismChecks] = useSafeKV<Array<{
    id: string
    label: string
    documentName: string
    plagiarismScore: number
    aiContentScore: number
    timestamp: number
    summary: string
  }>>(
    `plagiarism-checks-${userId}`,
    []
  )
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    excludeQuotes: true,
    excludeReferences: true,
    minMatchWords: 8,
  })
  const [reviewScoringProfile, setReviewScoringProfile] = useState<ReviewScoringProfile>("institutional")
  const [advancedMetrics, setAdvancedMetrics] = useState<AdvancedDetectionResult | null>(null)
  // subscriptionPlan is read-only here; derived from user.subscription at mount time
  const [subscriptionPlan] = useState<SubscriptionPlan>(user.subscription?.plan || "basic")
  const [proCredits, setProCredits] = useState(user.subscription?.proCredits || 0)
  const [trialSubmissionsUsed, setTrialSubmissionsUsed] = useState(user.subscription?.trial?.submissionsUsed || 0)
  const [, setDocumentReviews] = useSafeKV<DocumentReviewResult[]>(
    `document-reviews-${userId}`,
    []
  )
  const [documentFingerprintRegistry, setDocumentFingerprintRegistry] = useSafeKV<DocumentFingerprintRecord[]>(
    `document-fingerprint-registry-${userId}`,
    []
  )
  const [savedReviews, setSavedReviews] = useSafeKV<SavedReviewDocument[]>(
    `saved-reviews-${userId}`,
    []
  )
  const [humanizerWorkspace, setHumanizerWorkspace] = useSafeKV<HumanizerWorkspaceEntry[]>(
    `humanizer-workspace-${userId}`,
    []
  )
  const [humanizerDraft, setHumanizerDraft] = useSafeKV<HumanizerDraft | null>(
    `humanizer-draft-${userId}`,
    null
  )
  const [monthlyReviewExportCount, setMonthlyReviewExportCount] = useSafeKV<number>(
    `${getCurrentMonthKey("review-exports")}-${userId}`,
    0
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const entitlements = getFeatureEntitlements({
    ...user,
    subscription: {
      ...(user.subscription || { plan: "basic", status: "active", proCredits: 0, updatedAt: Date.now() }),
      plan: subscriptionPlan,
      proCredits,
      trial: user.subscription?.trial
        ? { ...user.subscription.trial, submissionsUsed: trialSubmissionsUsed }
        : undefined,
    },
  })
  const exportPlanConfig = getExportPlanConfig(entitlements.isPaidPlan ? subscriptionPlan : "basic")
  const derivedReviewFilters: Record<ReviewScoringProfile, ReviewFilters> = {
    institutional: { excludeQuotes: true, excludeReferences: true, minMatchWords: 8 },
    strict: { excludeQuotes: false, excludeReferences: false, minMatchWords: 4 },
    balanced: { excludeQuotes: true, excludeReferences: false, minMatchWords: 6 },
  }
  const activeReviewFilters = entitlements.isPaidPlan
    ? reviewFilters
    : derivedReviewFilters[reviewScoringProfile]
  const normalizedFingerprintRegistry = Array.isArray(documentFingerprintRegistry) ? documentFingerprintRegistry : []
  const reuploadHistory = [...normalizedFingerprintRegistry].sort((left, right) => right.lastReviewedAt - left.lastReviewedAt)
  const totalFingerprintReviews = reuploadHistory.reduce((sum, entry) => sum + entry.reviewCount, 0)
  const evidenceMeters = result ? buildEvidenceMeters(result, reviewMeta) : []
  const sourceVerificationSummary = buildSourceVerificationSummary(externalSourceCheck)
  const rankedExternalMatches = buildRankedExternalMatches(externalSourceCheck)
  const paraphraseClusters = buildParaphraseClusters(externalSourceCheck)

  const countWords = (input: string) => {
    const normalized = input.trim()
    if (!normalized) {
      return 0
    }
    return normalized.split(/\s+/).length
  }

  const trimToWordLimit = (input: string, maxWords: number) => {
    const words = input.trim().split(/\s+/).filter(Boolean)
    if (words.length <= maxWords) {
      return input
    }
    return words.slice(0, maxWords).join(" ")
  }

  const estimateHumanizerCredits = (wordCount: number) => {
    if (wordCount <= 0) {
      return 0
    }
    return Math.max(1, Math.ceil(wordCount / 1000))
  }

  const applyReviewScoringProfile = (profile: ReviewScoringProfile) => {
    setReviewScoringProfile(profile)
    setReviewFilters(derivedReviewFilters[profile])
  }

  function buildEvidenceMeters(review: PlagiarismResult, meta: ReviewComputationMeta | null): EvidenceMeter[] {
    const citationValidCount = review.validReferences.filter((ref) => ref.isValid).length
    const citationCoverage = review.validReferences.length > 0
      ? Math.round((citationValidCount / review.validReferences.length) * 100)
      : 0

    return [
      {
        label: "Integrity",
        value: meta?.integrityScore ?? review.overallScore,
        tone: (meta?.integrityScore ?? review.overallScore) >= 75 ? "positive" : (meta?.integrityScore ?? review.overallScore) >= 55 ? "neutral" : "risk",
      },
      {
        label: "Similarity risk",
        value: Math.max(0, 100 - review.plagiarismPercentage),
        tone: review.plagiarismPercentage <= 20 ? "positive" : review.plagiarismPercentage <= 40 ? "neutral" : "risk",
      },
      {
        label: "AI-pattern risk",
        value: Math.max(0, 100 - review.aiContentPercentage),
        tone: review.aiContentPercentage <= 20 ? "positive" : review.aiContentPercentage <= 40 ? "neutral" : "risk",
      },
      {
        label: "Citation support",
        value: citationCoverage,
        tone: citationCoverage >= 75 ? "positive" : citationCoverage >= 45 ? "neutral" : "risk",
      },
    ]
  }

  function buildSourceVerificationSummary(sourceCheck: ExternalSourceCheckResult | null): SourceVerificationSummary | null {
    if (!sourceCheck) {
      return null
    }

    const checks = sourceCheck.providerChecks || []
    return {
      totalMatches: sourceCheck.matches.length,
      verifiedProviders: checks.filter((check) => check.status === "completed").length,
      retentionAwareProviders: checks.filter((check) => check.canVerifyRetention).length,
      liveProviders: checks.filter((check) => check.canPerformLiveCheck).length,
      highestSimilarity: sourceCheck.matches.reduce((max, match) => Math.max(max, match.similarity), 0),
    }
  }

  function getEvidenceToneClasses(tone: EvidenceMeter["tone"]) {
    if (tone === "positive") return "bg-green-500"
    if (tone === "neutral") return "bg-amber-500"
    return "bg-red-500"
  }

  function clampPercent(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)))
  }

  function buildRankedExternalMatches(sourceCheck: ExternalSourceCheckResult | null): RankedExternalMatch[] {
    if (!sourceCheck || !Array.isArray(sourceCheck.matches) || sourceCheck.matches.length === 0) {
      return []
    }

    const providerChecks = sourceCheck.providerChecks || []
    const providerWeight = new Map<string, number>()

    providerChecks.forEach((check) => {
      const statusWeight = check.status === "completed" ? 12 : check.status === "ready" ? 7 : check.status === "unsupported" ? 2 : 0
      const liveWeight = check.canPerformLiveCheck ? 6 : 0
      const retentionWeight = check.canVerifyRetention ? 5 : 1
      providerWeight.set(check.provider, statusWeight + liveWeight + retentionWeight)
    })

    const ranked = sourceCheck.matches.map((match) => {
      const matchTypeWeight =
        match.matchType === "exact"
          ? 10
          : match.matchType === "near-exact"
            ? 7
            : match.matchType === "paraphrase"
              ? 4
              : 2

      const retentionWeight = match.retentionState === "active" ? 8 : match.retentionState === "unknown" ? 3 : -4
      const providerScore = providerWeight.get(match.provider || "") || 0
      const trustScore = clampPercent(match.similarity * 0.62 + providerScore + matchTypeWeight + retentionWeight)
      const confidence: RankedExternalMatch["confidence"] = trustScore >= 75 ? "trusted" : trustScore >= 45 ? "review" : "caution"

      return {
        ...match,
        rank: 0,
        trustScore,
        confidence,
      }
    })

    ranked.sort((left, right) => {
      if (right.trustScore !== left.trustScore) return right.trustScore - left.trustScore
      if (right.similarity !== left.similarity) return right.similarity - left.similarity
      return left.source.localeCompare(right.source)
    })

    return ranked.map((match, index) => ({ ...match, rank: index + 1 }))
  }

  function buildParaphraseClusters(sourceCheck: ExternalSourceCheckResult | null): ParaphraseCluster[] {
    if (!sourceCheck || !Array.isArray(sourceCheck.matches) || sourceCheck.matches.length === 0) {
      return []
    }

    const paraphraseLikeMatches = sourceCheck.matches.filter((match) => match.matchType === "paraphrase" || match.matchType === "near-exact")
    if (paraphraseLikeMatches.length === 0) {
      return []
    }

    const clusterMap = new Map<string, ExternalSourceMatch[]>()
    paraphraseLikeMatches.forEach((match) => {
      const key = `${match.provider || "unknown"}::${match.repository || "unspecified"}`
      const current = clusterMap.get(key) || []
      clusterMap.set(key, [...current, match])
    })

    return Array.from(clusterMap.entries())
      .map(([key, clusterMatches]) => {
        const [provider, repository] = key.split("::")
        const highestSimilarity = clusterMatches.reduce((max, item) => Math.max(max, item.similarity), 0)
        const averageSimilarity = clusterMatches.reduce((sum, item) => sum + item.similarity, 0) / clusterMatches.length
        return {
          id: key,
          provider,
          repository,
          count: clusterMatches.length,
          averageSimilarity: Math.round(averageSimilarity),
          highestSimilarity,
          sampleSources: clusterMatches.map((item) => item.source).slice(0, 3),
        }
      })
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count
        return right.highestSimilarity - left.highestSimilarity
      })
  }

  function extractSemanticAnchors(input: string) {
    const lower = input.toLowerCase()
    const longWords = lower.match(/\b[a-z][a-z-]{5,}\b/g) || []
    const stopwords = new Set(["because", "should", "would", "could", "their", "there", "these", "those", "about", "within", "between", "during", "through", "before", "after"])
    const anchorFrequency = new Map<string, number>()

    longWords.forEach((word) => {
      if (stopwords.has(word)) return
      anchorFrequency.set(word, (anchorFrequency.get(word) || 0) + 1)
    })

    const anchors = Array.from(anchorFrequency.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([word]) => word)
      .slice(0, 12)

    const numericAnchors = Array.from(new Set(input.match(/\b\d+(?:\.\d+)?%?\b/g) || [])).slice(0, 8)
    const negationCount = (lower.match(/\b(no|not|never|without|cannot|can't|won't|n't)\b/g) || []).length

    return { anchors, numericAnchors, negationCount }
  }

  function extractNamedEntities(input: string) {
    const tokens = input.match(/\b[A-Z][a-zA-Z0-9'-]{2,}\b/g) || []
    const skip = new Set([
      "The", "This", "That", "These", "Those", "And", "But", "For", "With", "From", "Into", "About", "After", "Before", "When", "Where", "While",
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
      "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    ])

    const frequency = new Map<string, number>()
    tokens.forEach((token) => {
      if (skip.has(token)) return
      frequency.set(token, (frequency.get(token) || 0) + 1)
    })

    return Array.from(frequency.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([token]) => token)
      .slice(0, 10)
  }

  function evaluateSemanticGuardrails(original: string, candidate: string): SemanticGuardrailReport {
    const { anchors, numericAnchors, negationCount } = extractSemanticAnchors(original)
    const namedEntities = extractNamedEntities(original)
    const candidateLower = candidate.toLowerCase()
    const candidateNegations = (candidateLower.match(/\b(no|not|never|without|cannot|can't|won't|n't)\b/g) || []).length

    const missingAnchors = anchors.filter((anchor) => !candidateLower.includes(anchor)).slice(0, 6)
    const numericDrift = numericAnchors.filter((token) => !candidate.includes(token))
    const namedEntityDrift = namedEntities.filter((entity) => !candidate.includes(entity)).slice(0, 4)
    const negationDrift = negationCount > 0 && candidateNegations === 0

    const penalty =
      missingAnchors.length * 7 +
      numericDrift.length * 14 +
      namedEntityDrift.length * 10 +
      (negationDrift ? 12 : 0)
    const score = clampPercent(100 - penalty)

    const notes: string[] = []
    if (missingAnchors.length > 0) {
      notes.push(`Missing key terms: ${missingAnchors.join(", ")}`)
    }
    if (numericDrift.length > 0) {
      notes.push(`Potential numeric drift: ${numericDrift.join(", ")}`)
    }
    if (namedEntityDrift.length > 0) {
      notes.push(`Potential named-entity drift: ${namedEntityDrift.join(", ")}`)
    }
    if (negationDrift) {
      notes.push("Negation cues changed; review meaning preservation")
    }
    if (notes.length === 0) {
      notes.push("Meaning-preservation checks passed")
    }

    const status: SemanticGuardrailReport["status"] =
      score < 60 || numericDrift.length >= 2 || namedEntityDrift.length >= 2
        ? "fail"
        : score < 80 || missingAnchors.length >= 3 || namedEntityDrift.length >= 1 || negationDrift
          ? "warn"
          : "pass"

    return {
      status,
      score,
      missingAnchors,
      numericDrift,
      namedEntityDrift,
      negationDrift,
      notes,
    }
  }

  function getDiffPreview(original: string, humanized: string) {
    const before = original.trim().replace(/\s+/g, " ")
    const after = humanized.trim().replace(/\s+/g, " ")
    return {
      before: before.length > 180 ? `${before.slice(0, 177)}...` : before,
      after: after.length > 180 ? `${after.slice(0, 177)}...` : after,
    }
  }

  const resetUploadInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const normalizeExtractedText = (rawText: string): string => {
    return normalizeDocumentText(rawText)
  }

  useEffect(() => {
    if (mode !== "humanizer") {
      return
    }

    if (!humanizerDraft || humanizerDraft.isFinal) {
      return
    }

    if (humanizerDraft.sourceText && !text.trim()) {
      setText(humanizerDraft.sourceText)
    }

    if (humanizerDraft.settings) {
      setHumanizerSettings(humanizerDraft.settings)
    }

    if (humanizerDraft.lastOutput) {
      setHumanizerCandidates(humanizerDraft.candidates || [])
      setSelectedHumanizerCandidateId(humanizerDraft.selectedCandidateId || null)
      setSemanticGuardrailReport(humanizerDraft.semanticGuardrailReport || null)
      setHumanizedResult({
        originalText: humanizerDraft.sourceText,
        humanizedText: humanizerDraft.lastOutput,
        changes: [],
        timestamp: humanizerDraft.updatedAt,
      })
    }

    setHumanizerScores({
      aiScoreBefore: humanizerDraft.aiScoreBefore,
      aiScoreAfter: humanizerDraft.aiScoreAfter || null,
      similarityBefore: humanizerDraft.similarityBefore,
      similarityAfter: humanizerDraft.similarityAfter || null,
    })
  }, [humanizerDraft, mode, text])

  useEffect(() => {
    if (mode !== "humanizer") {
      return
    }

    const sourceText = text.trim()
    if (!sourceText) {
      return
    }

    const beforeMeters = estimateHumanizerMeters(sourceText)
    const afterMeters = humanizedResult ? estimateHumanizerMeters(humanizedResult.humanizedText) : null

    setHumanizerDraft((current) => ({
      id: current?.id || `draft-${Date.now()}`,
      userId,
      sourceText,
      settings: humanizerSettings,
      lastOutput: humanizedResult?.humanizedText || current?.lastOutput || "",
      candidates: humanizerCandidates.length > 0 ? humanizerCandidates : current?.candidates || [],
      selectedCandidateId: selectedHumanizerCandidateId || current?.selectedCandidateId || null,
      semanticGuardrailReport: semanticGuardrailReport || current?.semanticGuardrailReport || null,
      aiScoreBefore: beforeMeters.aiLikelihood,
      aiScoreAfter: afterMeters?.aiLikelihood || current?.aiScoreAfter || 0,
      similarityBefore: beforeMeters.similarityRisk,
      similarityAfter: afterMeters?.similarityRisk || current?.similarityAfter || 0,
      updatedAt: Date.now(),
      isFinal: false,
    }))
  }, [
    mode,
    text,
    humanizedResult,
    humanizerCandidates,
    humanizerSettings,
    selectedHumanizerCandidateId,
    semanticGuardrailReport,
    setHumanizerDraft,
    userId,
  ])

  const applyExtractedText = (rawText: string, sourceLabel: string): boolean => {
    const normalized = normalizeExtractedText(rawText)

    if (!normalized || normalized.length === 0) {
      return false
    }

    if (normalized.length > MAX_DOCUMENT_CHARS) {
      const truncated = normalized.slice(0, MAX_DOCUMENT_CHARS)
      const finalText = mode === "humanizer" ? trimToWordLimit(truncated, HUMANIZER_MAX_WORDS) : truncated
      setText(finalText)
      setUploadStatus(
        `${sourceLabel} processed: ${normalized.length.toLocaleString()} characters extracted; truncated to ${MAX_DOCUMENT_CHARS.toLocaleString()} for analysis.`
      )
      toast.warning(`Document is very large. Trimmed to ${MAX_DOCUMENT_CHARS.toLocaleString()} characters for reliable analysis.`)
      if (mode === "humanizer") {
        toast.info(`Humanizer accepts up to ${HUMANIZER_MAX_WORDS} words per run.`)
      }
      return true
    }

    if (mode === "humanizer") {
      const capped = trimToWordLimit(normalized, HUMANIZER_MAX_WORDS)
      setText(capped)
      const extractedWords = countWords(normalized)
      if (extractedWords > HUMANIZER_MAX_WORDS) {
        toast.warning(`Upload exceeds ${HUMANIZER_MAX_WORDS} words. It was capped for Humanizer.`)
      }
    } else {
      setText(normalized)
    }
    setUploadStatus(`${sourceLabel} processed: ${normalized.length.toLocaleString()} characters extracted.`)
    return true
  }

  const getFingerprintRegistryMatches = async (candidateText: string) => {
    const fingerprint = await createDocumentFingerprint(candidateText)
    const matches = findFingerprintMatches(fingerprint, normalizedFingerprintRegistry)

    return { fingerprint, matches }
  }

  const notifyIfPreviouslyReviewed = async (candidateText: string, candidateFileName: string) => {
    const { matches } = await getFingerprintRegistryMatches(candidateText)

    if (matches.length > 0) {
      const latestMatch = matches[0]
      toast.warning(
        `Exact re-upload detected for ${candidateFileName}. A matching reviewed document already exists${latestMatch.lastSeenAt ? ` from ${new Date(latestMatch.lastSeenAt).toLocaleDateString()}` : ""}.`
      )
    }
  }

  const registerReviewedDocumentFingerprint = async (candidateText: string, candidateFileName: string) => {
    const fingerprint = await createDocumentFingerprint(candidateText)
    const preview = buildDocumentPreview(candidateText)
    const now = Date.now()

    setDocumentFingerprintRegistry((current) => {
      const existing = Array.isArray(current) ? current : []
      const existingIndex = existing.findIndex((entry) => entry.fingerprint === fingerprint)

      if (existingIndex >= 0) {
        const updated = [...existing]
        const previous = updated[existingIndex]
        updated[existingIndex] = {
          ...previous,
          fileName: candidateFileName || previous.fileName,
          preview,
          charCount: candidateText.length,
          lastReviewedAt: now,
          reviewCount: previous.reviewCount + 1,
        }
        return updated
      }

      return [
        {
          id: `${fingerprint.slice(0, 12)}-${now}`,
          fingerprint,
          userId,
          fileName: candidateFileName,
          preview,
          charCount: candidateText.length,
          firstReviewedAt: now,
          lastReviewedAt: now,
          reviewCount: 1,
        },
        ...existing,
      ].slice(0, 250)
    })
  }

  const readTextFileWithProgress = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.max(10, Math.round((event.loaded / event.total) * 80)))
        }
      }

      reader.onload = () => resolve((reader.result as string) || "")
      reader.onerror = () => reject(new Error("Could not read text file"))
      reader.readAsText(file)
    })
  }

  const readArrayBufferWithProgress = async (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.max(10, Math.round((event.loaded / event.total) * 80)))
        }
      }

      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(new Error("Could not read uploaded file"))
      reader.readAsArrayBuffer(file)
    })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type === "application/msword" || file.name.toLowerCase().endsWith(".doc")) {
      toast.warning("Legacy .doc files are not supported for extraction. Please use PDF, DOCX, or TXT.")
      resetUploadInput()
      return
    }

    const validTypes = [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]

    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid document (PDF, DOCX, or TXT)")
      resetUploadInput()
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB")
      resetUploadInput()
      return
    }

    setText("")
    setIsUploading(true)
    setUploadProgress(5)
    setUploadStatus(`Uploading ${file.name}...`)
    setFileName(file.name)
    toast.info(`Processing "${file.name}"...`)

    try {
      if (file.type === 'text/plain') {
        const content = await readTextFileWithProgress(file)
        setUploadProgress(95)
        if (content && content.trim().length > 0) {
          const wasApplied = applyExtractedText(content, "TXT")
          if (!wasApplied) {
            toast.error("File is empty. Please upload a file with content.")
            setUploadStatus("Upload failed: file is empty.")
            setFileName(null)
            return
          }
          await notifyIfPreviouslyReviewed(content, file.name)
          setUploadProgress(100)
          toast.success(`File "${file.name}" loaded successfully`)
        } else {
          toast.error("File is empty. Please upload a file with content.")
          setUploadStatus("Upload failed: file is empty.")
          setFileName(null)
        }
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        setUploadStatus("Reading DOCX file...")
        const arrayBuffer = await readArrayBufferWithProgress(file)
        setUploadStatus("Extracting text from DOCX...")
        const extractedText = await extractTextFromDocx(arrayBuffer)
        setUploadProgress(95)
        
        if (extractedText && extractedText.trim().length > 0) {
          const wasApplied = applyExtractedText(extractedText, "DOCX")
          if (!wasApplied) {
            toast.error("Could not extract text from DOCX. Please paste your text manually or use a TXT file.")
            setUploadStatus("Upload failed: no readable text found in DOCX.")
            setText("")
            setFileName(null)
            return
          }
          await notifyIfPreviouslyReviewed(extractedText, file.name)
          setUploadProgress(100)
          toast.success(`File "${file.name}" loaded successfully`)
        } else {
          toast.error("Could not extract text from DOCX. Please paste your text manually or use a TXT file.")
          setUploadStatus("Upload failed: no readable text found in DOCX.")
          setText("")
          setFileName(null)
        }
      } else if (file.type === 'application/pdf') {
        setUploadStatus("Reading PDF file...")
        const arrayBuffer = await readArrayBufferWithProgress(file)
        setUploadStatus("Extracting text from PDF...")
        const extractedText = await extractTextFromPdf(arrayBuffer)

        if (extractedText && extractedText.trim().length > 0) {
          const wasApplied = applyExtractedText(extractedText, "PDF")
          if (!wasApplied) {
            toast.error("Could not extract readable text from PDF. Trying OCR fallback...")
            setUploadStatus("No readable text extracted from PDF. Running OCR fallback...")
            setUploadProgress(30)
            const ocrText = await extractTextFromPdfWithOcr(arrayBuffer)

            if (ocrText && ocrText.trim().length > 0 && applyExtractedText(ocrText, "PDF OCR")) {
              await notifyIfPreviouslyReviewed(ocrText, file.name)
              setUploadProgress(100)
              toast.success(`OCR completed for "${file.name}"`)
            } else {
              toast.error("Could not extract readable text from this PDF, even with OCR. Try a clearer scan (300 DPI+) or paste text manually.")
              setUploadStatus("Upload failed: OCR exhausted all enhancement options. PDF quality too low or content is not text-based. Try manual text entry.")
              setText("")
              setFileName(null)
            }
            return
          }
          await notifyIfPreviouslyReviewed(extractedText, file.name)
          setUploadProgress(100)
          toast.success(`File "${file.name}" loaded successfully`)
        } else {
          setUploadStatus("No selectable text found. Running OCR fallback...")
          setUploadProgress(30)
          const ocrText = await extractTextFromPdfWithOcr(arrayBuffer)

          if (ocrText && ocrText.trim().length > 0 && applyExtractedText(ocrText, "PDF OCR")) {
            await notifyIfPreviouslyReviewed(ocrText, file.name)
            setUploadProgress(100)
            toast.success(`OCR completed for "${file.name}"`)
          } else {
            toast.error("Could not extract readable text from this PDF, even with OCR. Try a clearer scan (300 DPI+) or paste text manually.")
            setUploadStatus("Upload failed: OCR could not detect readable text. Try a higher-quality scan.")
            setText("")
            setFileName(null)
          }
        }
      }
    } catch (error) {
      console.error("File upload error:", error)
      toast.error("Failed to process file. Please try again or paste your text manually.")
      setUploadStatus("Upload failed while processing the document.")
      setText("")
      setFileName(null)
      setUploadProgress(0)
    } finally {
      setIsUploading(false)
    }

    resetUploadInput()
  }

  const extractTextFromDocx = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer })
      return result.value.replace(/\s+\n/g, "\n").trim()
    } catch (error) {
      console.error("DOCX extraction error:", error)
      return ""
    }
  }

  const extractTextFromPdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    try {
      const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) })
      const pdf = await loadingTask.promise
      const pages: string[] = []

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()

        if (pageText) {
          pages.push(pageText)
        }

        // Keep progress responsive while parsing multi-page PDFs.
        setUploadProgress(Math.max(20, Math.round((pageNumber / pdf.numPages) * 90)))
      }

      return pages.join("\n\n").trim()
    } catch (error) {
      console.error("PDF extraction error:", error)
      return ""
    }
  }

  const applyGaussianBlur = (imageData: ImageData, radius: number): ImageData => {
    const { data, width, height } = imageData
    const output = new ImageData(width, height)
    const kernel = Math.ceil(radius) * 2 + 1
    const sigma = radius / 2
    const weights: number[] = []
    let weightSum = 0

    for (let i = 0; i < kernel; i++) {
      const x = i - Math.floor(kernel / 2)
      const weight = Math.exp(-(x * x) / (2 * sigma * sigma))
      weights.push(weight)
      weightSum += weight
    }

    for (let i = 0; i < weights.length; i++) {
      weights[i] /= weightSum
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0

        for (let k = 0; k < kernel; k++) {
          const xk = x + k - Math.floor(kernel / 2)
          if (xk >= 0 && xk < width) {
            const idx = (y * width + xk) * 4
            r += data[idx] * weights[k]
            g += data[idx + 1] * weights[k]
            b += data[idx + 2] * weights[k]
          }
        }

        const idx = (y * width + x) * 4
        output.data[idx] = r
        output.data[idx + 1] = g
        output.data[idx + 2] = b
        output.data[idx + 3] = data[idx + 3]
      }
    }

    return output
  }

  const applyAdaptiveThreshold = (imageData: ImageData, windowSize: number): ImageData => {
    const { data, width, height } = imageData
    const output = new ImageData(width, height)
    const halfWindow = Math.floor(windowSize / 2)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0
        let count = 0

        for (let wy = Math.max(0, y - halfWindow); wy < Math.min(height, y + halfWindow + 1); wy++) {
          for (let wx = Math.max(0, x - halfWindow); wx < Math.min(width, x + halfWindow + 1); wx++) {
            const idx = (wy * width + wx) * 4
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
            sum += gray
            count++
          }
        }

        const threshold = sum / count - 10
        const idx = (y * width + x) * 4
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
        const value = gray > threshold ? 255 : 0

        output.data[idx] = value
        output.data[idx + 1] = value
        output.data[idx + 2] = value
        output.data[idx + 3] = 255
      }
    }

    return output
  }

  const sharpenImage = (imageData: ImageData): ImageData => {
    const { data, width, height } = imageData
    const output = new ImageData(width, height)
    
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ]

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let r = 0, g = 0, b = 0

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4
            const kernelIdx = (ky + 1) * 3 + (kx + 1)
            const weight = kernel[kernelIdx]
            
            r += data[idx] * weight
            g += data[idx + 1] * weight
            b += data[idx + 2] * weight
          }
        }

        const idx = (y * width + x) * 4
        output.data[idx] = Math.min(255, Math.max(0, r))
        output.data[idx + 1] = Math.min(255, Math.max(0, g))
        output.data[idx + 2] = Math.min(255, Math.max(0, b))
        output.data[idx + 3] = 255
      }
    }

    for (let i = 0; i < data.length; i++) {
      if (output.data[i] === 0) {
        output.data[i] = data[i]
      }
    }

    return output
  }

  const removeSaltAndPepperNoise = (imageData: ImageData): ImageData => {
    const { data, width, height } = imageData
    const output = new ImageData(width, height)

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const neighbors: number[] = []
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
            neighbors.push(gray)
          }
        }

        neighbors.sort((a, b) => a - b)
        const median = neighbors[Math.floor(neighbors.length / 2)]

        const idx = (y * width + x) * 4
        output.data[idx] = median
        output.data[idx + 1] = median
        output.data[idx + 2] = median
        output.data[idx + 3] = 255
      }
    }

    for (let i = 0; i < data.length; i++) {
      if (output.data[i] === 0) {
        output.data[i] = data[i]
      }
    }

    return output
  }

  const preprocessCanvasForOcr = (source: HTMLCanvasElement, filterMode: "standard" | "aggressive" | "ultra" = "standard"): HTMLCanvasElement => {
    const canvas = document.createElement("canvas")
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      return source
    }

    ctx.drawImage(source, 0, 0)
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    if (filterMode === "ultra") {
      // Ultra aggressive preprocessing for very poor quality scans
      imageData = removeSaltAndPepperNoise(imageData)
      imageData = removeSaltAndPepperNoise(imageData) // Apply twice
      imageData = applyGaussianBlur(imageData, 2)
      imageData = sharpenImage(imageData)
      imageData = applyAdaptiveThreshold(imageData, 20)
      imageData = removeSaltAndPepperNoise(imageData)
    } else if (filterMode === "aggressive") {
      imageData = removeSaltAndPepperNoise(imageData)
      imageData = applyGaussianBlur(imageData, 1.2)
      imageData = sharpenImage(imageData)
      imageData = applyAdaptiveThreshold(imageData, 15)
    } else {
      const { data } = imageData

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        const grayscale = 0.299 * r + 0.587 * g + 0.114 * b
        const thresholded = grayscale > 180 ? 255 : 0

        data[i] = thresholded
        data[i + 1] = thresholded
        data[i + 2] = thresholded
      }
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas
  }

  const extractTextFromPdfWithOcr = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null

    try {
      const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) })
      const pdf = await loadingTask.promise
      const pages: string[] = []

      worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            const percent = Math.max(30, Math.min(98, Math.round(30 + message.progress * 68)))
            setUploadProgress(percent)
          }
        },
      })

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setUploadStatus(`Running OCR on page ${pageNumber} of ${pdf.numPages}...`)
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 3 })
        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d")

        if (!context) {
          continue
        }

        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)

        await page.render({ canvasContext: context, viewport, canvas }).promise

        const {
          data: { text: firstPassText },
        } = await worker.recognize(canvas)

        const firstPass = firstPassText.trim()
        let bestText = firstPass

        if (firstPass.length < 40) {
          setUploadStatus(`Applying standard preprocessing to page ${pageNumber}...`)
          const standardCanvas = preprocessCanvasForOcr(canvas, "standard")
          const {
            data: { text: secondPassText },
          } = await worker.recognize(standardCanvas)

          const secondPass = secondPassText.trim()
          if (secondPass.length > bestText.length) {
            bestText = secondPass
          }

          if (bestText.length < 40) {
            setUploadStatus(`Applying aggressive filters to page ${pageNumber}...`)
            const aggressiveCanvas = preprocessCanvasForOcr(canvas, "aggressive")
            const {
              data: { text: thirdPassText },
            } = await worker.recognize(aggressiveCanvas)

            const thirdPass = thirdPassText.trim()
            if (thirdPass.length > bestText.length) {
              bestText = thirdPass
            }

            if (bestText.length < 40) {
              setUploadStatus(`Applying ultra-enhanced filters to page ${pageNumber}...`)
              const ultraCanvas = preprocessCanvasForOcr(canvas, "ultra")
              const {
                data: { text: ultraPassText },
              } = await worker.recognize(ultraCanvas)

              const ultraPass = ultraPassText.trim()
              if (ultraPass.length > bestText.length) {
                bestText = ultraPass
              }
            }
          }
        }

        if (bestText.length > 0) {
          pages.push(bestText)
        }

        const pageProgress = Math.round((pageNumber / pdf.numPages) * 100)
        setUploadProgress(Math.max(30, Math.min(99, pageProgress)))
      }

      return pages.join("\n\n").trim()
    } catch (error) {
      console.error("PDF OCR extraction error:", error)
      return ""
    } finally {
      if (worker) {
        await worker.terminate()
      }
    }
  }

  const checkPlagiarism = async () => {
    if (!text.trim() || text.trim().length < 50) {
      toast.error("Please enter at least 50 characters to check")
      return
    }

    if (text.length > MAX_DOCUMENT_CHARS) {
      const trimmed = text.slice(0, MAX_DOCUMENT_CHARS)
      setText(trimmed)
      toast.warning(`Text was trimmed to ${MAX_DOCUMENT_CHARS.toLocaleString()} characters for reliable analysis. Please run integrity check again.`)
      return
    }

    if (text.includes("data:application/") || text.includes("base64,")) {
      toast.error("The text area contains encoded file data instead of readable text. Please upload a TXT file or paste your text directly.")
      return
    }

    setIsChecking(true)
    setResult(null)
    setReviewMeta(null)
    setSectionSummaries([])
      setExternalSourceCheck(null)
      setHumanizedResult(null)
      setSemanticGuardrailReport(null)
      setHumanizerCandidates([])
      setSelectedHumanizerCandidateId(null)
      setAdvancedMetrics(null)

    try {
      // Consume review credit (admin is free, trial users decrement, paid plans consume 1 credit)
      if (user.role !== "admin") {
        const creditResult = await consumeReviewCredit(user.id)
        if (!creditResult.success) {
          setIsChecking(false)
          toast.error(creditResult.error || "Failed to consume review credit")
          return
        }
        setProCredits(creditResult.remainingCredits)
        if (creditResult.trialSubmissionsUsed !== undefined) {
          setTrialSubmissionsUsed(creditResult.trialSubmissionsUsed)
        }
      }

      const { matches: fingerprintMatches } = await getFingerprintRegistryMatches(text)
      
      toast.info("Analyzing document with advanced detection algorithms...")
      
      const [analysisOutcome, externalOutcome] = await Promise.all([
        performEnhancedPlagiarismCheck(text, 3),
        performExternalSourceCheck({ text, fileName, fingerprintMatches }),
      ]).catch((err) => {
        console.error("Plagiarism analysis failed:", err)
        throw new Error("Analysis failed. Please try again.")
      })

      // Use enhanced plagiarism detection with advanced algorithms
      const { result: enrichedResult, advancedMetrics: detectionMetrics } = analysisOutcome
      setExternalSourceCheck(externalOutcome)
      setAdvancedMetrics(detectionMetrics)

      // Further enhance with local review analysis
      const enriched = computeReviewAnalysis(text, enrichedResult, activeReviewFilters)
      const scoredMeta = await scoreReviewMetaOnServer(text, enriched.result, activeReviewFilters)
      setResult(enriched.result)
      setReviewMeta(scoredMeta || enriched.meta)
      setSectionSummaries(enriched.sections)

      const review: DocumentReviewResult = {
        documentText: text,
        fileName: fileName || "Untitled Document",
        summary: enriched.result.summary,
        plagiarismResult: enriched.result,
        externalSourceCheck: externalOutcome,
        timestamp: Date.now()
      }

      await registerReviewedDocumentFingerprint(text, fileName || "Untitled Document")
      setCurrentReviewResult(review)
      setDocumentReviews((current) => [review, ...(current || [])].slice(0, 20))

      if (enriched.result.turnitinReady) {
        toast.success("Document analysis complete. Lower submission-risk estimate detected.")
      } else {
        toast.warning("Document analysis complete. Review evidence and recommendations before submission.")
      }

      setTimeout(() => {
        setShowSaveDialog(true)
      }, 1000)
    } catch (error) {
      console.error("Plagiarism check error:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      
      if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
        toast.error("Failed to process the analysis response. Please try again or contact support if the issue persists.")
      } else {
        toast.error("Failed to analyze document. Please try again.")
      }
    } finally {
      setIsChecking(false)
    }
  }

  const handleSaveReview = (name: string) => {
    if (!currentReviewResult) return

    const savedReview: SavedReviewDocument = {
      id: Date.now().toString(),
      name,
      documentText: currentReviewResult.documentText,
      fileName: currentReviewResult.fileName,
      summary: currentReviewResult.summary,
      plagiarismResult: currentReviewResult.plagiarismResult,
      externalSourceCheck: currentReviewResult.externalSourceCheck,
      timestamp: currentReviewResult.timestamp,
      userId
    }

    setSavedReviews((current) => [savedReview, ...(current || [])])
    toast.success("Review saved successfully!")
  }

  const handleDiscardReview = () => {
    toast.info("Review discarded")
  }

  const handleDeleteReview = (id: string) => {
    setSavedReviews((current) => (current || []).filter(r => r.id !== id))
    toast.success("Review deleted")
  }

  const handleArchiveReview = (id: string) => {
    setSavedReviews((current) => 
      (current || []).map(r => 
        r.id === id ? { ...r, archived: true } : r
      )
    )
    toast.success("Review archived")
  }

  const handleUnarchiveReview = (id: string) => {
    setSavedReviews((current) => 
      (current || []).map(r => 
        r.id === id ? { ...r, archived: false } : r
      )
    )
    toast.success("Review unarchived")
  }

  const handleLoadFingerprintPreview = (entry: DocumentFingerprintRecord) => {
    setText(entry.preview)
    setFileName(entry.fileName)
    setResult(null)
    setReviewMeta(null)
    setSectionSummaries([])
    setExternalSourceCheck(null)
    setCurrentReviewResult(null)
    setUploadStatus("Loaded preview from re-upload history. Upload the original document for a full analysis.")
    toast.info("Preview loaded from re-upload history. This is a short stored excerpt, not the full document.")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleDeleteFingerprintEntry = (id: string) => {
    setDocumentFingerprintRegistry((current) => (Array.isArray(current) ? current : []).filter((entry) => entry.id !== id))
    toast.success("History entry removed")
  }

  const handleClearFingerprintHistory = () => {
    setDocumentFingerprintRegistry([])
    toast.success("Re-upload history cleared")
  }

  const handleViewReview = async (review: SavedReviewDocument) => {
    setText(review.documentText)
    setFileName(review.fileName)
    setResult(review.plagiarismResult)
    setExternalSourceCheck(review.externalSourceCheck || null)
    const enriched = computeReviewAnalysis(review.documentText, review.plagiarismResult, activeReviewFilters)
    const scoredMeta = await scoreReviewMetaOnServer(review.documentText, enriched.result, activeReviewFilters)
    setReviewMeta(scoredMeta || enriched.meta)
    setSectionSummaries(enriched.sections)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleExportReview = async (review: SavedReviewDocument) => {
    if ((monthlyReviewExportCount || 0) >= exportPlanConfig.monthlyExports) {
      toast.error(`Monthly export quota reached (${exportPlanConfig.monthlyExports}). Upgrade for higher limits.`)
      return
    }

    try {
      const enriched = computeReviewAnalysis(review.documentText, review.plagiarismResult, activeReviewFilters)
      const scoredMeta = await scoreReviewMetaOnServer(review.documentText, enriched.result, activeReviewFilters)
      await exportReviewToPDF(review, {
        meta: scoredMeta || enriched.meta,
        sections: enriched.sections,
        filters: activeReviewFilters,
      })
      setMonthlyReviewExportCount((current) => (current || 0) + 1)
      toast.success("PDF export initiated!")
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Failed to export PDF. Please try again.")
    }
  }

  const handleExportReviewPdf = async () => {
    if (!currentReviewResult) {
      toast.error("No review result available to export")
      return
    }

    if ((monthlyReviewExportCount || 0) >= exportPlanConfig.monthlyExports) {
      toast.error(`Monthly export quota reached (${exportPlanConfig.monthlyExports}). Upgrade for higher limits.`)
      return
    }

    try {
      const enriched = computeReviewAnalysis(
        currentReviewResult.documentText,
        currentReviewResult.plagiarismResult,
        activeReviewFilters
      )
      const scoredMeta = await scoreReviewMetaOnServer(currentReviewResult.documentText, enriched.result, activeReviewFilters)
      
      const reviewForExport: SavedReviewDocument = {
        id: Date.now().toString(),
        name: fileName || "Untitled Review",
        documentText: currentReviewResult.documentText,
        fileName: currentReviewResult.fileName,
        summary: currentReviewResult.summary,
        plagiarismResult: currentReviewResult.plagiarismResult,
        externalSourceCheck: currentReviewResult.externalSourceCheck,
        timestamp: currentReviewResult.timestamp,
        userId
      }

      await exportReviewToPDF(reviewForExport, {
        meta: scoredMeta || enriched.meta,
        sections: enriched.sections,
        filters: activeReviewFilters,
      })
      
      setMonthlyReviewExportCount((current) => (current || 0) + 1)
      toast.success("PDF export initiated!")
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Failed to export PDF. Please try again.")
    }
  }

  const savePlagiarismCheckResult = async () => {
    if (!result || !plagiarismCheckLabel.trim()) {
      toast.error("Please provide a label for this plagiarism check result")
      return
    }

    try {
      const newCheck = {
        id: `check-${Date.now()}`,
        label: plagiarismCheckLabel,
        documentName: fileName || "Direct Input",
        plagiarismScore: result.plagiarismPercentage,
        aiContentScore: result.aiContentPercentage,
        timestamp: Date.now(),
        summary: result.summary.substring(0, 200)
      }

      setSavedPlagiarismChecks((current) => [newCheck, ...(current || [])])
      setPlagiarismCheckLabel("")
      setShowSavePlagiarismCheck(false)
      toast.success(`Plagiarism check saved as "${plagiarismCheckLabel}"`)
    } catch (error) {
      console.error("Save plagiarism check error:", error)
      toast.error("Failed to save plagiarism check result")
    }
  }

  const parseHumanizerResponse = (response: unknown): {
    candidates: HumanizerCandidatePayload[]
  } => {
    let parsed: Record<string, unknown>

    if (typeof response === "object" && response !== null) {
      parsed = response as Record<string, unknown>
    } else {
      let cleaned = String(response || "").trim()
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "")
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "")
      }

      cleaned = cleaned.trim()
      const firstBrace = cleaned.indexOf("{")
      const lastBrace = cleaned.lastIndexOf("}")
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1)
      }

      parsed = JSON.parse(cleaned)
    }

    const rawCandidates = Array.isArray(parsed.candidates)
      ? parsed.candidates
      : typeof parsed.humanizedText === "string"
        ? [{ humanizedText: parsed.humanizedText, changes: parsed.changes, strategy: parsed.strategy }]
        : []

    const candidates = rawCandidates.reduce<HumanizerCandidatePayload[]>((acc, candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return acc
      }

      const record = candidate as Record<string, unknown>
      const humanizedText = typeof record.humanizedText === "string" ? record.humanizedText.trim() : ""
      if (!humanizedText) {
        return acc
      }

      const changes = Array.isArray(record.changes)
        ? record.changes.filter((change): change is { original: string; humanized: string } => {
          if (!change || typeof change !== "object") {
            return false
          }
          const item = change as Record<string, unknown>
          return typeof item.original === "string" && typeof item.humanized === "string"
        })
        : []

      acc.push({
        humanizedText,
        strategy: typeof record.strategy === "string" ? record.strategy : undefined,
        changes,
      })
      return acc
    }, [])

    if (candidates.length === 0) {
      throw new Error("No valid humanizer candidates returned")
    }

    return { candidates }
  }

  const humanizeText = async () => {
    if (!text.trim()) {
      toast.error("Please enter text to humanize")
      return
    }

    const wordCount = countWords(text)
    if (wordCount > HUMANIZER_MAX_WORDS) {
      const capped = trimToWordLimit(text, HUMANIZER_MAX_WORDS)
      setText(capped)
      toast.warning(`Humanizer supports up to ${HUMANIZER_MAX_WORDS} words per run. Your text was capped.`)
      return
    }

    if (!entitlements.isPaidPlan && user.role !== "admin") {
      toast.info("🔒 Humanizer is available for Admin, Pro, and Team plans. Upgrade to unlock this feature.")
      return
    }

    if (!entitlements.canUseHumanizer) {
      toast.error("No credits remaining. Please buy credits to continue using Humanizer.")
      return
    }

    const requiredCredits = estimateHumanizerCredits(wordCount)
    if (entitlements.isPaidPlan && user.role !== "admin" && proCredits < requiredCredits) {
      toast.error(`Not enough credits. This run requires ${requiredCredits} credit(s).`)
      return
    }

    if (!humanizerAnalyzed) {
      toast.info("Run Analyze first to inspect pre-check meters before humanizing.")
      return
    }

    setIsHumanizing(true)
    setHumanizerCandidates([])
    setSelectedHumanizerCandidateId(null)

    try {
      const strPrompt = `You are an expert text humanizer and rewrite optimizer. Create multiple strong rewrites, then return them as structured JSON for local scoring.

Original text:
${text}

Behavior controls:
- Tone: ${humanizerSettings.tone}
- Formality: ${humanizerSettings.formality}
- Readability target grade: ${humanizerSettings.readabilityGrade}
- Human variance level: ${humanizerSettings.humanVariance}
- Risk mode: ${humanizerSettings.riskMode}
- Skill profile: ${getHumanizerSkillLabel(humanizerSettings.skillProfile)}

Skill directives:
${buildHumanizerSkillDirective(humanizerSettings.skillProfile)}

Instructions:
- Remove robotic or overly formal language
- Add natural variations in sentence structure
- Include appropriate contractions and colloquialisms where suitable
- Maintain the original meaning and key facts
- Make it sound conversational yet professional
- Vary sentence length and complexity
- Preserve numbers, citations, named entities, and critical qualifiers
- Avoid inventing facts or changing the author's intent
- Produce 3 distinct rewrite candidates with different rhythm and flow choices

Return ONLY a valid JSON object:
{
  "candidates": [
    {
      "humanizedText": "<fully rewritten text>",
      "strategy": "<short strategy label>",
      "changes": [
        {
          "original": "<original phrase>",
          "humanized": "<humanized version>"
        }
      ]
    }
  ]
}`

      const waitForAuthToken = async (timeoutMs = 1500) => {
        const startedAt = Date.now()
        while (Date.now() - startedAt < timeoutMs) {
          const token = localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
          if (token) return true
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return false
      }

      const runHumanizerQuery = async () => sentinelQuery(strPrompt, {
        module: "humanizer",
        userId: user?.id || undefined,
        enableQualityGate: true,
        userInputForQualityGate: text,
        qualityGateProfile: "lenient",
        preferCopilot: true,
      })

      let response: unknown
      try {
        const res = await runHumanizerQuery()
        if (res.status === "needs_clarification") {
          toast.error(res.response || "Please provide clearer text for humanization.")
          return
        }
        response = typeof res.response === "string" ? res.response : JSON.stringify(res.response)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const authError = message.toLowerCase().includes("authentication required") || message.toLowerCase().includes("unauthorized")

        if (authError) {
          const tokenReady = await waitForAuthToken()
          if (tokenReady) {
            try {
              const retryRes = await runHumanizerQuery()
              if (retryRes.status === "needs_clarification") {
                toast.error(retryRes.response || "Please provide clearer text for humanization.")
                return
              }
              response = typeof retryRes.response === "string" ? retryRes.response : JSON.stringify(retryRes.response)
            } catch (retryErr) {
              console.error("Humanizer retry failed:", retryErr)
              throw new Error("Authentication/session issue while contacting Humanizer. Please refresh and try again.")
            }
          } else {
            throw new Error("Authentication/session is not ready yet. Please try again in a moment.")
          }
        } else {
          console.error("Humanizer sentinelQuery failed:", err)
          throw new Error("AI service unavailable. Please try again.")
        }
      }

      const parsed = parseHumanizerResponse(response)
      const candidateInputs = parsed.candidates.map((candidate, index) => ({
        ...candidate,
        strategy: candidate.strategy || getHumanizerSkillLabel(humanizerSettings.skillProfile),
        id: `candidate-${index + 1}`,
      }))
      const serverRanking = await rankHumanizerCandidatesOnServer(text, candidateInputs)
      const selection = serverRanking
        ? {
            ranked: serverRanking.ranked,
            score: serverRanking.ranked[0].score,
            best: serverRanking.ranked[0].candidate,
          }
        : selectBestHumanizerCandidate(text, candidateInputs)

      const guardedRanking = selection.ranked
        .map(({ candidate, score }) => {
          const guardrail = evaluateSemanticGuardrails(text, candidate.humanizedText)
          const guardrailPenalty =
            (guardrail.status === "fail" ? 20 : guardrail.status === "warn" ? 9 : 0) +
            guardrail.numericDrift.length * 5 +
            guardrail.namedEntityDrift.length * 4 +
            (guardrail.negationDrift ? 4 : 0)
          const adjustedScore = clampPercent(score.overallScore - guardrailPenalty)
          return {
            candidate,
            guardrail,
            score: {
              ...score,
              overallScore: adjustedScore,
              notes: [`Semantic guardrail: ${guardrail.status.toUpperCase()} (${guardrail.score}%)`, ...score.notes].slice(0, 5),
            },
          }
        })
        .sort((left, right) => right.score.overallScore - left.score.overallScore)

      const selected = guardedRanking[0].candidate
      const selectedGuardrail = guardedRanking[0].guardrail
      const rankedCandidates: HumanizerCandidateReview[] = guardedRanking.map(({ candidate, score }) => ({
          id: candidate.id,
          humanizedText: candidate.humanizedText,
          changes: candidate.changes || [],
          strategy: candidate.strategy,
          scores: score,
        }))

      const humanized: HumanizedResult = {
        originalText: text,
        humanizedText: selected.humanizedText,
        changes: Array.isArray(selected.changes) ? selected.changes : [],
        timestamp: Date.now(),
      }

      let remainingCredits = proCredits
      if (user.role !== "admin") {
        const creditUse = await consumeProCredits(user.id, requiredCredits)
        if (!creditUse.success) {
          toast.error(creditUse.error || "Failed to consume Pro credit")
          return
        }
        remainingCredits = creditUse.remainingCredits
        setProCredits(remainingCredits)
      }

      setHumanizerCandidates(rankedCandidates)
      setSelectedHumanizerCandidateId(selected.id)
      setSemanticGuardrailReport(selectedGuardrail)
      setHumanizedResult(humanized)

      const beforeMeters = estimateHumanizerMeters(text)
      const afterMeters = estimateHumanizerMeters(humanized.humanizedText)
      setHumanizerScores({
        aiScoreBefore: beforeMeters.aiLikelihood,
        aiScoreAfter: afterMeters.aiLikelihood,
        similarityBefore: beforeMeters.similarityRisk,
        similarityAfter: afterMeters.similarityRisk,
      })
      const selectionNote = rankedCandidates[0].scores.notes.length > 0
        ? ` ${rankedCandidates[0].scores.notes[0]}.`
        : ""
      toast.success(`Best rewrite candidate selected from ${rankedCandidates.length} options.${selectionNote} ${remainingCredits} Pro credits left.`)
    } catch (error) {
      console.error("Humanization error:", error)
      const message = error instanceof Error ? error.message : "Failed to humanize text. Please try again."
      toast.error(message)
    } finally {
      setIsHumanizing(false)
    }
  }

  const handleUpgradeToPro = async () => {
    const result = await requestUpgrade(user.id, "pro")
    if (result.success) {
      toast.success("Pro upgrade request submitted! Admin will review and approve your upgrade.")
    } else {
      toast.error(result.error || "Failed to submit upgrade request")
    }
  }

  const handleUpgradeToTeam = async () => {
    const result = await requestUpgrade(user.id, "team")
    if (result.success) {
      toast.success("Team upgrade request submitted! Admin will review and approve your upgrade.")
    } else {
      toast.error(result.error || "Failed to submit upgrade request")
    }
  }

  const handleBuyCredits = async () => {
    const result = await addProCredits(user.id, 25)
    if (result.success) {
      setProCredits(result.credits)
      toast.success(`Credits purchased. New balance: ${result.credits}`)
    } else {
      toast.error(result.error || "Failed to add credits")
    }
  }

  const exportHumanizedText = (entry: { humanizedText: string; sourceName: string; timestamp: number }) => {
    const safeName = entry.sourceName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "_") || "text"
    const fileNameForExport = `${safeName}_regenerated_${new Date(entry.timestamp).toISOString().slice(0, 10)}.txt`
    const blob = new Blob([entry.humanizedText], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileNameForExport
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const saveCurrentHumanizedToWorkspace = () => {
    if (!humanizedResult) {
      toast.error("No humanized output available to save")
      return
    }

    const sourceName = fileName || "Direct Input"
    const entry: HumanizerWorkspaceEntry = {
      id: `humanized-${Date.now()}`,
      label: `Humanized ${new Date().toLocaleString()}`,
      sourceName,
      originalText: humanizedResult.originalText,
      humanizedText: humanizedResult.humanizedText,
      candidates: humanizerCandidates,
      selectedCandidateId: selectedHumanizerCandidateId,
      semanticGuardrailReport,
      wordCount: countWords(humanizedResult.originalText),
      creditsUsed: estimateHumanizerCredits(countWords(humanizedResult.originalText)),
      timestamp: Date.now(),
    }

    setHumanizerWorkspace((current) => [entry, ...(current || [])].slice(0, 50))
    toast.success("Saved to Humanizer workspace")
  }

  const loadHumanizerWorkspaceEntry = (entry: HumanizerWorkspaceEntry) => {
    setText(entry.originalText)
    setHumanizerCandidates(entry.candidates || [])
    setSelectedHumanizerCandidateId(entry.selectedCandidateId || null)
    setSemanticGuardrailReport(entry.semanticGuardrailReport || null)
    setHumanizedResult({
      originalText: entry.originalText,
      humanizedText: entry.humanizedText,
      changes: [],
      timestamp: entry.timestamp,
    })
    setSemanticGuardrailReport(evaluateSemanticGuardrails(entry.originalText, entry.humanizedText))
    setFileName(entry.sourceName)
    window.scrollTo({ top: 0, behavior: "smooth" })
    toast.success("Workspace entry loaded")
  }

  const deleteHumanizerWorkspaceEntry = (id: string) => {
    setHumanizerWorkspace((current) => (current || []).filter((entry) => entry.id !== id))
    toast.success("Workspace entry removed")
  }

  const applyHumanizerCandidate = (candidate: HumanizerCandidateReview) => {
    setSelectedHumanizerCandidateId(candidate.id)
    setHumanizedResult({
      originalText: text,
      humanizedText: candidate.humanizedText,
      changes: candidate.changes,
      timestamp: Date.now(),
    })
    setSemanticGuardrailReport(evaluateSemanticGuardrails(text, candidate.humanizedText))
    setHumanizerScores({
      aiScoreBefore: humanizerScores?.aiScoreBefore ?? estimateHumanizerMeters(text).aiLikelihood,
      aiScoreAfter: candidate.scores.aiLikelihood,
      similarityBefore: humanizerScores?.similarityBefore ?? estimateHumanizerMeters(text).similarityRisk,
      similarityAfter: candidate.scores.similarityRisk,
    })
    toast.success("Candidate applied")
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <CheckCircle size={20} className="text-green-600" weight="fill" />
    if (score >= 60) return <WarningCircle size={20} className="text-yellow-600" weight="fill" />
    return <XCircle size={20} className="text-red-600" weight="fill" />
  }

  const getRiskColorClass = (score: number) => {
    if (score <= 35) return "text-green-600"
    if (score <= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const aiPatternReduction = humanizerScores?.aiScoreAfter !== null && humanizerScores
    ? clampPercent(Math.max(0, humanizerScores.aiScoreBefore - (humanizerScores.aiScoreAfter ?? 0)))
    : null
  const aiRiskAfterValue = humanizerScores?.aiScoreAfter
  const similarityAfterValue = humanizerScores?.similarityAfter
  const qualityTargets = {
    aiPatternReduction: aiPatternReduction !== null ? aiPatternReduction >= 40 : null,
    aiRiskAfter: aiRiskAfterValue !== null && aiRiskAfterValue !== undefined ? aiRiskAfterValue <= 35 : null,
    similarityAfter: similarityAfterValue !== null && similarityAfterValue !== undefined ? similarityAfterValue <= 45 : null,
    semanticGuardrail: semanticGuardrailReport ? semanticGuardrailReport.status !== "fail" && semanticGuardrailReport.score >= 80 : null,
  }
  const qualityPassed = Object.values(qualityTargets).every((value) => value !== false)

  const runHumanizerAnalyze = async () => {
    const value = text.trim()
    if (!value) {
      toast.error("Please add text before running analyze")
      return
    }

    const beforeMeters = await scoreHumanizerMeters(value)
    const afterMeters = humanizedResult ? await scoreHumanizerMeters(humanizedResult.humanizedText) : null
    setHumanizerScores({
      aiScoreBefore: beforeMeters.aiLikelihood,
      aiScoreAfter: afterMeters?.aiLikelihood ?? null,
      similarityBefore: beforeMeters.similarityRisk,
      similarityAfter: afterMeters?.similarityRisk ?? null,
    })
    setHumanizerAnalyzed(true)
    const scoringMode = getHumanizerScoringModeLabel()
    toast.success(`Humanizer analysis complete (${scoringMode})`)
  }

  const restoreHumanizerDraft = () => {
    if (!humanizerDraft) {
      toast.info("No draft available to restore")
      return
    }

    setText(humanizerDraft.sourceText || "")
    setHumanizerSettings(humanizerDraft.settings || DEFAULT_HUMANIZER_SETTINGS)
    setHumanizerCandidates(humanizerDraft.candidates || [])
    setSelectedHumanizerCandidateId(humanizerDraft.selectedCandidateId || null)
    setSemanticGuardrailReport(humanizerDraft.semanticGuardrailReport || null)
    setHumanizerScores({
      aiScoreBefore: humanizerDraft.aiScoreBefore,
      aiScoreAfter: humanizerDraft.aiScoreAfter || null,
      similarityBefore: humanizerDraft.similarityBefore,
      similarityAfter: humanizerDraft.similarityAfter || null,
    })

    if (humanizerDraft.lastOutput) {
      setHumanizedResult({
        originalText: humanizerDraft.sourceText,
        humanizedText: humanizerDraft.lastOutput,
        changes: [],
        timestamp: humanizerDraft.updatedAt,
      })
      setSemanticGuardrailReport(evaluateSemanticGuardrails(humanizerDraft.sourceText, humanizerDraft.lastOutput))
    }

    setHumanizerAnalyzed(true)
    toast.success("Draft restored")
  }

  const resetHumanizerDraft = () => {
    setHumanizerDraft(null)
    setHumanizerSettings(DEFAULT_HUMANIZER_SETTINGS)
    setHumanizerScores(null)
    setHumanizedResult(null)
    setHumanizerCandidates([])
    setSelectedHumanizerCandidateId(null)
    setSemanticGuardrailReport(null)
    setSemanticGuardrailReport(null)
    setHumanizerAnalyzed(false)
    toast.success("Draft reset")
  }

  const clearCurrentInput = () => {
    setText("")
    setFileName(null)
    setResult(null)

    if (mode === "humanizer") {
      // Clear all unsaved generation artifacts. Only explicit workspace saves persist.
      setHumanizedResult(null)
      setHumanizerCandidates([])
      setSelectedHumanizerCandidateId(null)
      setSemanticGuardrailReport(null)
      setHumanizerScores(null)
      setHumanizerDraft(null)
      setHumanizerAnalyzed(false)
      // Explicitly delete KV entry to prevent draft restoration on page reload
      getSafeKVClient().delete(`humanizer-draft-${userId}`).catch(() => {})
    } else if (mode === "review") {
      // Clear all unsaved review artifacts. Only explicitly saved reviews persist.
      setReviewMeta(null)
      setCurrentReviewResult(null)
    }

    toast.info("Text cleared")
  }

  const requiresAccess = mode === "humanizer" ? !entitlements.canUseHumanizer : !entitlements.canAccessReview

  // Gate: show paywall for users without access (admin bypasses)
  if (user.role !== "admin" && requiresAccess) {
    return (
      <UpgradePaywall
        user={user}
        feature={mode === "humanizer" ? "humanize" : "review"}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MagnifyingGlass size={24} weight="duotone" className="text-primary" />
            </div>
            <div>
              <CardTitle>{mode === "humanizer" ? "Humanizer Workspace" : "Academic Review & Integrity Analyzer"}</CardTitle>
              <CardDescription>
                {mode === "humanizer"
                  ? "Rewrite text to be natural, authentic, and human-like while keeping original meaning"
                  : "Analyze thesis/article documents for similarity, AI-writing risk, and citation quality"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "humanizer" && humanizerDraft && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={humanizerDraft.isFinal ? "default" : "secondary"}>
                    {humanizerDraft.isFinal ? "Final" : "Draft"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Last saved: {new Date(humanizerDraft.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7" onClick={restoreHumanizerDraft}>
                    Restore
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={resetHumanizerDraft}>
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant={showUpload ? "default" : "outline"}
              size="sm"
              onClick={() => setShowUpload(!showUpload)}
              className="gap-2"
            >
              <FileText size={18} weight="duotone" />
              {showUpload ? "Hide Upload" : "Show Upload"}
            </Button>
            {isUploading && (
              <Badge variant="outline" className="gap-1">
                <Sparkle size={14} className="animate-pulse" />
                Uploading {uploadProgress}%
              </Badge>
            )}
            {fileName && (
              <Badge variant="secondary" className="gap-1">
                <FileText size={14} />
                {fileName}
              </Badge>
            )}
          </div>

          <AnimatePresence>
            {showUpload && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-3">
                  <UploadSimple size={48} weight="duotone" className="mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      Upload Document
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOCX, or TXT (max 10MB)
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="sm"
                    disabled={isUploading}
                  >
                    {isUploading ? `Uploading ${uploadProgress}%` : "Choose File"}
                  </Button>

                  {uploadStatus && (
                    <div className="w-full max-w-md mx-auto space-y-2">
                      <Progress value={isUploading ? uploadProgress : uploadProgress || undefined} className="w-full" />
                      <p className="text-xs text-muted-foreground">{uploadStatus}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label htmlFor="plagiarism-text" className="block text-sm font-medium mb-2">
              Document Text
            </label>
            
            {(text.includes("data:application/") || text.includes("base64,")) && (
              <Alert variant="destructive" className="mb-3">
                <WarningCircle size={18} weight="fill" />
                <AlertDescription>
                  The text area contains encoded file data instead of readable text. Please use the upload button above to upload your document, or paste plain text directly.
                  <Button
                    onClick={() => {
                      setText("")
                      setShowUpload(true)
                    }}
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                  >
                    Clear & Show Upload
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            
            <Textarea
              id="plagiarism-text"
              value={text}
              onChange={(e) => {
                const value = e.target.value
                if (value.includes("data:application/") || value.includes("base64,")) {
                  toast.error("Please upload a file using the upload button instead of pasting encoded data.")
                  return
                }
                if (mode === "humanizer") {
                  const next = trimToWordLimit(value, HUMANIZER_MAX_WORDS)
                  if (next !== value) {
                    toast.warning(`Humanizer supports up to ${HUMANIZER_MAX_WORDS} words per run.`)
                  }
                  setText(next)
                  return
                }
                setText(value)
              }}
              placeholder="Paste your text here or upload a document above..."
              className="min-h-64 resize-none"
              maxLength={mode === "humanizer" ? 12000 : 50000}
            />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-2">
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  {mode === "humanizer"
                    ? `${countWords(text).toLocaleString()} / ${HUMANIZER_MAX_WORDS.toLocaleString()} words • ${estimateHumanizerCredits(countWords(text))} credit(s) required`
                    : `${text.length.toLocaleString()} / 50,000 characters`}
                </p>
                {text.length > 0 && (
                  <Button
                    onClick={clearCurrentInput}
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mode === "humanizer" && (
                  <Button
                    onClick={runHumanizerAnalyze}
                    disabled={!text.trim() || isHumanizing || isChecking}
                    size="sm"
                    variant="secondary"
                    className="gap-2"
                  >
                    <Robot size={16} weight="duotone" />
                    Analyze
                  </Button>
                )}

                {mode === "humanizer" && (
                  <Button
                    onClick={humanizeText}
                    disabled={!text.trim() || isHumanizing || isChecking || (entitlements.isPaidPlan && proCredits < estimateHumanizerCredits(countWords(text)))}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <LockKey size={16} weight="duotone" />
                    {isHumanizing
                      ? "Humanizing..."
                      : entitlements.isPaidPlan
                        ? `Humanize (${estimateHumanizerCredits(countWords(text))} credit(s), balance: ${proCredits})`
                        : "Humanize (Pro/Team)"}
                  </Button>
                )}

                {mode === "humanizer" && !entitlements.isPaidPlan && user.role !== "admin" && (
                  <div className="flex gap-1">
                    <Button onClick={handleUpgradeToPro} variant="secondary" size="sm">
                      Upgrade to Pro
                    </Button>
                    <Button onClick={handleUpgradeToTeam} variant="outline" size="sm">
                      Team
                    </Button>
                  </div>
                )}

                {mode === "humanizer" && entitlements.isPaidPlan && proCredits <= 0 && (
                  <Button onClick={handleBuyCredits} variant="secondary" size="sm">
                    Buy Credits
                  </Button>
                )}

                {mode !== "humanizer" && (
                  <Button
                    onClick={checkPlagiarism}
                    disabled={
                      !text.trim() ||
                      text.trim().length < 50 ||
                      isChecking ||
                      isUploading ||
                      text.includes("data:application/") ||
                      text.includes("base64,")
                    }
                    size="sm"
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    {isChecking ? (
                      <>Analyzing...</>
                    ) : (
                      <>
                        <MagnifyingGlass size={18} weight="duotone" />
                        Run Integrity Check
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {mode === "humanizer" && (
              <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Humanizer Controls
                  </p>
                  <Badge variant="outline">Two-stage flow: Analyze -&gt; Optimize</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
                  <select
                    value={humanizerSettings.skillProfile}
                    onChange={(e) => setHumanizerSettings((current) => ({ ...current, skillProfile: e.target.value as HumanizerBehaviorSettings["skillProfile"] }))}
                    className="h-9 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="wikipedia-v2.5.1">Skill: Wikipedia signals</option>
                    <option value="balanced-v1">Skill: Balanced default</option>
                  </select>

                  <select
                    value={humanizerSettings.tone}
                    onChange={(e) => setHumanizerSettings((current) => ({ ...current, tone: e.target.value as HumanizerBehaviorSettings["tone"] }))}
                    className="h-9 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="neutral">Tone: Neutral</option>
                    <option value="friendly">Tone: Friendly</option>
                    <option value="professional">Tone: Professional</option>
                    <option value="persuasive">Tone: Persuasive</option>
                  </select>

                  <select
                    value={humanizerSettings.formality}
                    onChange={(e) => setHumanizerSettings((current) => ({ ...current, formality: e.target.value as HumanizerBehaviorSettings["formality"] }))}
                    className="h-9 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="casual">Formality: Casual</option>
                    <option value="balanced">Formality: Balanced</option>
                    <option value="formal">Formality: Formal</option>
                  </select>

                  <select
                    value={humanizerSettings.readabilityGrade}
                    onChange={(e) => setHumanizerSettings((current) => ({ ...current, readabilityGrade: Number(e.target.value) }))}
                    className="h-9 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value={6}>Readability: Grade 6</option>
                    <option value={8}>Readability: Grade 8</option>
                    <option value={10}>Readability: Grade 10</option>
                    <option value={12}>Readability: Grade 12</option>
                  </select>

                  <select
                    value={humanizerSettings.humanVariance}
                    onChange={(e) => setHumanizerSettings((current) => ({ ...current, humanVariance: e.target.value as HumanizerBehaviorSettings["humanVariance"] }))}
                    className="h-9 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="low">Variance: Low</option>
                    <option value="medium">Variance: Medium</option>
                    <option value="high">Variance: High</option>
                  </select>

                  <select
                    value={humanizerSettings.riskMode}
                    onChange={(e) => setHumanizerSettings((current) => ({ ...current, riskMode: e.target.value as HumanizerBehaviorSettings["riskMode"] }))}
                    className="h-9 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="safe">Risk: Safe</option>
                    <option value="balanced">Risk: Balanced</option>
                    <option value="aggressive">Risk: Aggressive</option>
                  </select>
                </div>

                {humanizerScores && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Estimated AI-Pattern Risk</p>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Before: <span className={getRiskColorClass(humanizerScores.aiScoreBefore)}>{humanizerScores.aiScoreBefore}%</span></p>
                        <Progress value={humanizerScores.aiScoreBefore} className="h-2" />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">After: <span className={getRiskColorClass(humanizerScores.aiScoreAfter ?? humanizerScores.aiScoreBefore)}>{humanizerScores.aiScoreAfter ?? "--"}{humanizerScores.aiScoreAfter !== null ? "%" : ""}</span></p>
                        <Progress value={humanizerScores.aiScoreAfter ?? 0} className="h-2" />
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Estimated Surface Similarity</p>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Before: <span className={getRiskColorClass(humanizerScores.similarityBefore)}>{humanizerScores.similarityBefore}%</span></p>
                        <Progress value={humanizerScores.similarityBefore} className="h-2" />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">After: <span className={getRiskColorClass(humanizerScores.similarityAfter ?? humanizerScores.similarityBefore)}>{humanizerScores.similarityAfter ?? "--"}{humanizerScores.similarityAfter !== null ? "%" : ""}</span></p>
                        <Progress value={humanizerScores.similarityAfter ?? 0} className="h-2" />
                      </div>
                    </div>
                  </div>
                )}

                {(humanizerScores || semanticGuardrailReport) && (
                  <div className={`rounded-lg border p-3 space-y-2 ${qualityPassed ? "border-emerald-300 bg-emerald-50/50" : "border-amber-300 bg-amber-50/40"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quality Target Panel</p>
                      <Badge variant={qualityPassed ? "default" : "secondary"}>{qualityPassed ? "READY" : "REVIEW"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Goal: keep meaning intact while reducing AI-pattern and similarity signals.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-border bg-background/70 p-2 flex items-center justify-between">
                        <span>AI-pattern reduction {">="} 40%</span>
                        <Badge variant={qualityTargets.aiPatternReduction === null ? "outline" : qualityTargets.aiPatternReduction ? "default" : "destructive"}>
                          {qualityTargets.aiPatternReduction === null ? "Pending" : qualityTargets.aiPatternReduction ? "Pass" : "Miss"}
                        </Badge>
                      </div>
                      <div className="rounded border border-border bg-background/70 p-2 flex items-center justify-between">
                        <span>AI-risk after {"<="} 35%</span>
                        <Badge variant={qualityTargets.aiRiskAfter === null ? "outline" : qualityTargets.aiRiskAfter ? "default" : "destructive"}>
                          {qualityTargets.aiRiskAfter === null ? "Pending" : qualityTargets.aiRiskAfter ? "Pass" : "Miss"}
                        </Badge>
                      </div>
                      <div className="rounded border border-border bg-background/70 p-2 flex items-center justify-between">
                        <span>Similarity after {"<="} 45%</span>
                        <Badge variant={qualityTargets.similarityAfter === null ? "outline" : qualityTargets.similarityAfter ? "default" : "destructive"}>
                          {qualityTargets.similarityAfter === null ? "Pending" : qualityTargets.similarityAfter ? "Pass" : "Miss"}
                        </Badge>
                      </div>
                      <div className="rounded border border-border bg-background/70 p-2 flex items-center justify-between">
                        <span>Semantic guardrail {">="} 80%</span>
                        <Badge variant={qualityTargets.semanticGuardrail === null ? "outline" : qualityTargets.semanticGuardrail ? "default" : "destructive"}>
                          {qualityTargets.semanticGuardrail === null ? "Pending" : qualityTargets.semanticGuardrail ? "Pass" : "Miss"}
                        </Badge>
                      </div>
                    </div>
                    {aiPatternReduction !== null && (
                      <p className="text-xs text-muted-foreground">
                        Current AI-pattern reduction: <span className="font-semibold text-foreground">{aiPatternReduction}%</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode !== "humanizer" && <div className="mt-4 p-3 border border-border rounded-lg space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scoring Filters</p>
              <p className="text-xs text-muted-foreground">
                These controls emulate institution-style similarity exclusions and affect displayed similarity and integrity estimates.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => applyReviewScoringProfile("institutional")}
                  className={`rounded-lg border px-3 py-2 text-left ${reviewScoringProfile === "institutional" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                >
                  <p className="text-sm font-medium">Institutional</p>
                  <p className="text-xs text-muted-foreground">Quotes and references excluded, safer academic baseline.</p>
                </button>
                <button
                  type="button"
                  onClick={() => applyReviewScoringProfile("balanced")}
                  className={`rounded-lg border px-3 py-2 text-left ${reviewScoringProfile === "balanced" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                >
                  <p className="text-sm font-medium">Balanced</p>
                  <p className="text-xs text-muted-foreground">Keeps references in play with moderate match sensitivity.</p>
                </button>
                <button
                  type="button"
                  onClick={() => applyReviewScoringProfile("strict")}
                  className={`rounded-lg border px-3 py-2 text-left ${reviewScoringProfile === "strict" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                >
                  <p className="text-sm font-medium">Strict</p>
                  <p className="text-xs text-muted-foreground">Minimal exclusions, closer to worst-case screening.</p>
                </button>
              </div>
              {!entitlements.isPaidPlan && user.role !== "admin" && (
                <p className="text-xs text-primary">
                  Advanced filter customization is available on Pro/Team. Basic uses the selected preset profile only.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewFilters.excludeQuotes}
                    disabled={!entitlements.isPaidPlan && user.role !== "admin"}
                    onChange={(e) => setReviewFilters((prev) => ({ ...prev, excludeQuotes: e.target.checked }))}
                  />
                  Exclude quoted matches
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewFilters.excludeReferences}
                    disabled={!entitlements.isPaidPlan && user.role !== "admin"}
                    onChange={(e) => setReviewFilters((prev) => ({ ...prev, excludeReferences: e.target.checked }))}
                  />
                  Exclude references/bibliography
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Min match words
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={reviewFilters.minMatchWords}
                    disabled={!entitlements.isPaidPlan && user.role !== "admin"}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      setReviewFilters((prev) => ({ ...prev, minMatchWords: Number.isNaN(value) ? 0 : value }))
                    }}
                    className="w-16 rounded border border-input bg-background px-2 py-1 text-xs"
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Suggested defaults: quotes excluded, references excluded, minimum match words = 8.
              </p>
              <p className="text-xs text-muted-foreground">
                Exports this month: {monthlyReviewExportCount || 0}/{exportPlanConfig.monthlyExports}
              </p>
            </div>}
          </div>
        </CardContent>
      </Card>

      {mode !== "humanizer" && <AnimatePresence>
        {isChecking && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 text-center">
                  <Sparkle size={48} weight="duotone" className="text-primary animate-pulse mx-auto" />
                  <div>
                    <p className="font-medium text-foreground mb-1">Analyzing Document...</p>
                    <p className="text-sm text-muted-foreground">
                      Computing similarity, AI-writing risk, reference quality, and evidence highlights
                    </p>
                  </div>
                  <Progress value={undefined} className="w-full" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>}

      {mode !== "humanizer" && <AnimatePresence>
        {result && !isChecking && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Analysis Results
                  {result.turnitinReady ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle size={14} weight="fill" />
                      Lower Submission Risk
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <WarningCircle size={14} weight="fill" />
                      Needs Review
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Integrity Score</p>
                      {getScoreBadge(result.overallScore)}
                    </div>
                    <p className={`text-3xl font-bold ${getScoreColor(result.overallScore)}`}>
                      {result.overallScore}%
                    </p>
                    <Progress value={result.overallScore} className="mt-2" />
                  </div>

                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Plagiarism Detected</p>
                      <ShieldCheck size={20} weight="duotone" className="text-primary" />
                    </div>
                    <p className={`text-3xl font-bold ${getScoreColor(100 - result.plagiarismPercentage)}`}>
                      {result.plagiarismPercentage}%
                    </p>
                    <Progress value={result.plagiarismPercentage} className="mt-2" />
                  </div>

                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">AI Content</p>
                      <Robot size={20} weight="duotone" className="text-primary" />
                    </div>
                    <p className={`text-3xl font-bold ${getScoreColor(100 - result.aiContentPercentage)}`}>
                      {result.aiContentPercentage}%
                    </p>
                    <Progress value={result.aiContentPercentage} className="mt-2" />
                  </div>

                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Estimated Similarity Range</p>
                      <Badge variant="secondary">Estimate</Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {reviewMeta
                        ? `${(reviewMeta.estimatedSimilarityRange || reviewMeta.likelyTurnitinRange).min}% - ${(reviewMeta.estimatedSimilarityRange || reviewMeta.likelyTurnitinRange).max}%`
                        : "--"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Confidence: {reviewMeta ? reviewMeta.confidenceLabel.toUpperCase() : "N/A"}
                    </p>
                  </div>
                </div>

                {reviewMeta && (
                  <Alert>
                    <AlertDescription>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Scoring Confidence ({reviewMeta.confidenceLabel.toUpperCase()})</p>
                        {reviewMeta.confidenceReasons.slice(0, 3).map((reason, index) => (
                          <p key={index} className="text-xs text-muted-foreground">- {reason}</p>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {user.role === "admin" && externalSourceCheck?.status === "completed" && (externalSourceCheck?.matches || []).length > 0 && (
                  <Alert>
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">External Repository Verification (Admin Only)</p>
                          <Badge variant="default">{externalSourceCheck.status}</Badge>
                          <Badge variant="outline">Provider: {externalSourceCheck.provider}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{externalSourceCheck.summary}</p>
                        {(externalSourceCheck.providerChecks || []).filter(c => c.matches.length > 0).length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                            {externalSourceCheck.providerChecks.filter(c => c.matches.length > 0).map((check) => (
                              <div key={check.provider} className="rounded-lg border border-border bg-background/70 p-3 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{check.provider}</p>
                                  <Badge variant="default">{check.status}</Badge>
                                </div>
                                <p className="text-xs text-foreground">{check.summary}</p>
                                <p className="text-xs text-muted-foreground">Matches: {check.matches.length}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <Tabs defaultValue="summary" className="w-full">
                  <div className="overflow-x-auto pb-1">
                    <TabsList className="grid min-w-[820px] grid-cols-6">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="plagiarism">Similarity</TabsTrigger>
                      <TabsTrigger value="ai">AI Detection</TabsTrigger>
                      <TabsTrigger value="references">References</TabsTrigger>
                      <TabsTrigger value="evidence">Evidence</TabsTrigger>
                      <TabsTrigger value="recommendations">Actions</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="summary" className="space-y-3">
                    <div className="prose prose-sm max-w-none">
                      <p className="text-foreground leading-relaxed">{result.summary}</p>
                    </div>

                    {sectionSummaries.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        {sectionSummaries.map((item) => (
                          <div key={item.section} className="p-3 border border-border rounded-lg bg-muted/30">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{item.section}</p>
                            <p className="text-sm text-foreground leading-relaxed">{item.summary}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="plagiarism" className="space-y-3">
                    {result.detectedSources.length > 0 && (
                      <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detected Source Contributions</p>
                        <div className="space-y-2">
                          {result.detectedSources.map((src, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{src.source}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="w-24 h-1.5 rounded bg-muted overflow-hidden">
                                  <div
                                    className={`h-full ${src.similarity >= 60 ? "bg-red-500" : src.similarity >= 30 ? "bg-yellow-500" : "bg-blue-400"}`}
                                    style={{ width: `${Math.min(src.similarity, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-semibold ${src.similarity >= 60 ? "text-red-600" : src.similarity >= 30 ? "text-yellow-600" : "text-muted-foreground"}`}>
                                  {src.similarity}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">Percentages show estimated contribution to overall similarity index. Values are LLM-estimated and should be treated as indicative.</p>
                      </div>
                    )}
                    {result.highlights.length > 0 ? (
                      <div className="space-y-3">
                        {result.highlights.map((highlight, index) => (
                          <Alert key={index} variant={highlight.severity === "high" ? "destructive" : "default"}>
                            <AlertDescription>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant={highlight.severity === "high" ? "destructive" : "secondary"}>
                                    {highlight.severity.toUpperCase()}
                                  </Badge>
                                  {highlight.source && (
                                    <span className="text-xs text-muted-foreground">
                                      Possible source: {highlight.source}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-mono bg-muted p-2 rounded">
                                  "{highlight.text}"
                                </p>
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No plagiarism detected. Great job!
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="ai" className="space-y-3">
                    {advancedMetrics && (
                      <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Algorithmic Signal Breakdown</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: "Entropy", value: advancedMetrics.entropyScore, help: "Text randomness (higher = more human)" },
                            { label: "Burstiness", value: advancedMetrics.burstinessScore, help: "Word distribution variance (higher = more human)" },
                            { label: "Stylometric", value: advancedMetrics.stylometricScore, help: "Linguistic style patterns (higher = more human)" },
                            { label: "Repetition", value: advancedMetrics.repetitionPatternScore, help: "Repetition avoidance (higher = more human)" },
                          ].map(({ label, value, help }) => (
                            <div key={label} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{label}</span>
                                <span className={`text-xs font-semibold ${value >= 60 ? "text-green-600" : value >= 40 ? "text-yellow-600" : "text-red-600"}`}>{value}%</span>
                              </div>
                              <div className="h-1.5 rounded bg-muted overflow-hidden">
                                <div
                                  className={`h-full ${value >= 60 ? "bg-green-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                                  style={{ width: `${value}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground leading-tight">{help}</p>
                            </div>
                          ))}
                        </div>
                        {advancedMetrics.riskFactors.length > 0 && (
                          <div className="pt-1 space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground">Detected Risk Signals</p>
                            {advancedMetrics.riskFactors.map((factor, i) => (
                              <p key={i} className="text-xs text-amber-700 flex items-start gap-1">
                                <span>⚠</span> {factor}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {result.aiHighlights.length > 0 ? (
                      <div className="space-y-3">
                        {result.aiHighlights.map((highlight, index) => (
                          <Alert key={index}>
                            <AlertDescription>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">
                                    {highlight.confidence}% AI Confidence
                                  </Badge>
                                  <Robot size={16} weight="duotone" />
                                </div>
                                <p className="text-sm font-mono bg-muted p-2 rounded">
                                  "{highlight.text}"
                                </p>
                                {highlight.indicators && highlight.indicators.length > 0 && (
                                  <div className="pt-1 space-y-1">
                                    <p className="text-xs font-semibold text-muted-foreground">Why it was flagged:</p>
                                    {highlight.indicators.map((indicator, i) => (
                                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                        <span className="text-primary">•</span> {indicator}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No AI-generated content detected.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="references" className="space-y-3">
                    {result.validReferences.length > 0 ? (
                      <div className="space-y-3">
                        {result.validReferences.map((ref, index) => (
                          <div key={index} className="p-3 border border-border rounded-lg">
                            <div className="flex items-start gap-2">
                              {ref.isValid ? (
                                <CheckCircle size={20} className="text-green-600 mt-0.5" weight="fill" />
                              ) : (
                                <XCircle size={20} className="text-red-600 mt-0.5" weight="fill" />
                              )}
                              <div className="flex-1">
                                <p className="text-sm font-medium">{ref.reference}</p>
                                <p className="text-xs text-muted-foreground mt-1">{ref.reason}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No references found in the document.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="evidence" className="space-y-3">
                    {reviewMeta && (
                      <div className="space-y-3">
                        {evidenceMeters.length > 0 && (
                          <div className="p-3 border border-border rounded-lg bg-background/80 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence Signal Chart</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {evidenceMeters.map((meter) => (
                                <div key={meter.label} className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-foreground font-medium">{meter.label}</span>
                                    <span className="text-muted-foreground">{meter.value}%</span>
                                  </div>
                                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full ${getEvidenceToneClasses(meter.tone)}`} style={{ width: `${meter.value}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 border border-border rounded-lg bg-muted/30 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scoring Profile</p>
                            <p className="text-sm text-foreground">{reviewMeta.scoringProfile}</p>
                            <p className="text-xs text-muted-foreground">Version: {reviewMeta.profileVersion}</p>
                            <p className="text-xs text-muted-foreground">Calibration: {reviewMeta.calibration?.method || "heuristic-baseline"}</p>
                            <p className="text-xs text-muted-foreground">Score band: {reviewMeta.calibration?.confidenceBand?.min ?? reviewMeta.integrityScore}% - {reviewMeta.calibration?.confidenceBand?.max ?? reviewMeta.integrityScore}%</p>
                            <p className="text-xs text-muted-foreground">Benchmark set: {reviewMeta.benchmarkEvidence?.datasetVersion || "not-disclosed"} ({reviewMeta.benchmarkEvidence?.sampleCount ?? 0} samples)</p>
                          </div>
                          <div className="p-3 border border-border rounded-lg bg-muted/30 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence Provenance</p>
                            <div className="space-y-1">
                              {reviewMeta.provenance.map((item) => (
                                <div key={item.label} className="flex items-start justify-between gap-3 text-xs">
                                  <span className="text-foreground">{item.label}</span>
                                  <Badge variant={item.status === "verified" ? "default" : item.status === "partial" ? "secondary" : "outline"}>{item.status}</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {reviewMeta.evidenceItems.map((item) => (
                            <div key={item.label} className="p-3 border border-border rounded-lg bg-background/80 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">{item.label}</p>
                                <Badge variant={item.impact === "positive" ? "default" : item.impact === "neutral" ? "secondary" : "destructive"}>{item.impact}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{item.detail}</p>
                            </div>
                          ))}
                        </div>

                        <div className="p-3 border border-border rounded-lg bg-muted/20 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provenance Notes</p>
                          {reviewMeta.provenance.map((item) => (
                            <p key={item.label} className="text-xs text-muted-foreground">
                              <span className="text-foreground font-medium">{item.label}:</span> {item.detail}
                            </p>
                          ))}
                        </div>

                        {sourceVerificationSummary && (
                          <div className="p-3 border border-border rounded-lg bg-muted/20 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source Verification</p>
                              <Badge variant={sourceVerificationSummary.totalMatches > 0 ? "secondary" : "outline"}>{sourceVerificationSummary.totalMatches} matches</Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">Completed paths</p>
                                <p className="font-semibold text-foreground">{sourceVerificationSummary.verifiedProviders}</p>
                              </div>
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">Live-check paths</p>
                                <p className="font-semibold text-foreground">{sourceVerificationSummary.liveProviders}</p>
                              </div>
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">Retention-aware</p>
                                <p className="font-semibold text-foreground">{sourceVerificationSummary.retentionAwareProviders}</p>
                              </div>
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">Highest similarity</p>
                                <p className="font-semibold text-foreground">{sourceVerificationSummary.highestSimilarity}%</p>
                              </div>
                            </div>

                            {rankedExternalMatches.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ranked Source Signals</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {rankedExternalMatches.slice(0, 4).map((match) => (
                                    <div key={`${match.source}-${match.rank}`} className="rounded border border-border bg-background/80 p-2 text-xs space-y-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="font-medium text-foreground truncate">#{match.rank} {match.source}</p>
                                        <Badge variant={match.confidence === "trusted" ? "default" : match.confidence === "review" ? "secondary" : "outline"}>
                                          {match.trustScore}
                                        </Badge>
                                      </div>
                                      <p className="text-muted-foreground">{match.matchType} • {match.similarity}% similarity</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {paraphraseClusters.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paraphrase Clusters</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {paraphraseClusters.slice(0, 4).map((cluster) => (
                                    <div key={cluster.id} className="rounded border border-border bg-background/80 p-2 text-xs space-y-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="font-medium text-foreground truncate">{cluster.provider} / {cluster.repository}</p>
                                        <Badge variant="outline">{cluster.count} links</Badge>
                                      </div>
                                      <p className="text-muted-foreground">Avg {cluster.averageSimilarity}% • Peak {cluster.highestSimilarity}%</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="recommendations" className="space-y-2">
                    {result.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                        <Sparkle size={16} className="text-primary mt-0.5" weight="duotone" />
                        <p className="text-sm text-foreground">{rec}</p>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => setShowSavePlagiarismCheck(true)}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <FloppyDisk size={16} weight="duotone" />
                    Save Check Result
                  </Button>
                  <Button
                    onClick={handleExportReviewPdf}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <FileText size={16} weight="duotone" />
                    Export PDF
                  </Button>
                </div>

                {showSavePlagiarismCheck && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 p-4 border border-border rounded-lg bg-muted/30 space-y-3"
                  >
                    <p className="text-sm font-semibold">Save this plagiarism check for future reference</p>
                    <input
                      type="text"
                      value={plagiarismCheckLabel}
                      onChange={(e) => setPlagiarismCheckLabel(e.target.value)}
                      placeholder="e.g., Final Essay Review, Report v2"
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={savePlagiarismCheckResult}
                        disabled={!plagiarismCheckLabel.trim()}
                        size="sm"
                        className="gap-2"
                      >
                        <CheckCircle size={16} weight="duotone" />
                        Save Result
                      </Button>
                      <Button
                        onClick={() => {
                          setShowSavePlagiarismCheck(false)
                          setPlagiarismCheckLabel("")
                        }}
                        variant="ghost"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}

                {(savedPlagiarismChecks || []).length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <h4 className="text-sm font-semibold">Your Saved Checks ({(savedPlagiarismChecks || []).length})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {(savedPlagiarismChecks || []).map((check) => (
                        <div key={check.id} className="p-3 border border-border rounded-lg bg-muted/30 space-y-1">
                          <p className="text-sm font-medium truncate">{check.label}</p>
                          <p className="text-xs text-muted-foreground">{check.documentName}</p>
                          <div className="flex gap-4 text-xs">
                            <span>Similarity: <span className={getScoreColor(check.plagiarismScore)}>{check.plagiarismScore}%</span></span>
                            <span>AI: <span className={getScoreColor(check.aiContentScore)}>{check.aiContentScore}%</span></span>
                          </div>
                          <p className="text-xs text-muted-foreground">{new Date(check.timestamp).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.detectedSources.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-3">Detected Sources</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {result.detectedSources.map((source, index) => (
                        <div key={index} className="p-3 border border-border rounded-lg">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium truncate flex-1">{source.source}</p>
                            <Badge variant="secondary">{source.similarity}%</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {externalSourceCheck && externalSourceCheck.matches.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-3">External Repository Matches</h4>
                    {rankedExternalMatches.length > 0 && (
                      <div className="mb-3 p-3 border border-border rounded-lg bg-muted/20 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Ranked Sources</p>
                        <div className="space-y-2">
                          {rankedExternalMatches.slice(0, 6).map((match) => (
                            <div key={`${match.rank}-${match.source}`} className="flex items-center justify-between gap-3 text-xs">
                              <p className="text-foreground truncate">#{match.rank} {match.source}</p>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant={match.confidence === "trusted" ? "default" : match.confidence === "review" ? "secondary" : "outline"}>
                                  Trust {match.trustScore}
                                </Badge>
                                <Badge variant="outline">{match.similarity}%</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {paraphraseClusters.length > 0 && (
                      <div className="mb-3 p-3 border border-border rounded-lg bg-muted/20 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paraphrase Cluster Groups</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {paraphraseClusters.slice(0, 6).map((cluster) => (
                            <div key={cluster.id} className="rounded border border-border bg-background/80 p-2 text-xs space-y-1">
                              <p className="font-medium text-foreground truncate">{cluster.provider} / {cluster.repository}</p>
                              <p className="text-muted-foreground">{cluster.count} related matches • Peak {cluster.highestSimilarity}%</p>
                              {cluster.sampleSources.length > 0 && (
                                <p className="text-muted-foreground truncate">Examples: {cluster.sampleSources.join(", ")}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {externalSourceCheck.providerChecks.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        {externalSourceCheck.providerChecks.map((check) => (
                          <div key={check.provider} className="p-3 border border-border rounded-lg bg-muted/20 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-foreground capitalize">{check.provider}</p>
                              <Badge variant={check.status === "completed" ? "default" : check.status === "error" ? "destructive" : "outline"}>{check.status}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{check.summary}</p>
                            <p className="text-[11px] text-muted-foreground">Live check: {check.canPerformLiveCheck ? "yes" : "no"} • Retention: {check.canVerifyRetention ? "verifiable" : "unknown"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {externalSourceCheck.matches.map((match, index) => (
                        <div key={`${match.source}-${index}`} className="p-3 border border-border rounded-lg bg-muted/20 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{match.source}</p>
                            <Badge variant="secondary">{match.similarity}%</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {match.matchType} match{match.repository ? ` in ${match.repository}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Retention: {match.retentionState || "unknown"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>}

      <AnimatePresence>
        {humanizedResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-accent/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkle size={24} weight="duotone" className="text-accent" />
                  Optimized Humanized Text
                </CardTitle>
                <CardDescription>
                  Best-scoring rewrite selected from multiple candidates to improve authenticity while preserving meaning
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {humanizerCandidates.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium">Candidate Comparison</label>
                      <Badge variant="secondary">{humanizerCandidates.length} scored options</Badge>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                      {humanizerCandidates.map((candidate, index) => {
                        const isSelected = selectedHumanizerCandidateId === candidate.id
                        const guardrail = evaluateSemanticGuardrails(text, candidate.humanizedText)
                        return (
                          <div key={candidate.id} className={`rounded-lg border p-3 space-y-3 ${isSelected ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-foreground">Candidate {index + 1}</p>
                                <p className="text-[11px] text-muted-foreground">{candidate.strategy || "Balanced rewrite strategy"}</p>
                              </div>
                              <Badge variant={isSelected ? "default" : "outline"}>Score {candidate.scores.overallScore}</Badge>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <p className="text-muted-foreground">Semantic guardrail</p>
                              <Badge variant={guardrail.status === "pass" ? "default" : guardrail.status === "warn" ? "secondary" : "destructive"}>
                                {guardrail.status.toUpperCase()} {guardrail.score}%
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">Preservation</p>
                                <p className="font-semibold text-foreground">{candidate.scores.preservationScore}%</p>
                              </div>
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">Variation</p>
                                <p className="font-semibold text-foreground">{candidate.scores.variationScore}%</p>
                              </div>
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">AI risk</p>
                                <p className={`font-semibold ${getRiskColorClass(candidate.scores.aiLikelihood)}`}>{candidate.scores.aiLikelihood}%</p>
                              </div>
                              <div className="rounded border border-border p-2">
                                <p className="text-muted-foreground">Similarity</p>
                                <p className={`font-semibold ${getRiskColorClass(candidate.scores.similarityRisk)}`}>{candidate.scores.similarityRisk}%</p>
                              </div>
                              <div className="rounded border border-border p-2 col-span-2">
                                <p className="text-muted-foreground">AI pattern score</p>
                                <p className="font-semibold text-foreground">{candidate.scores.aiPatternScore ?? "--"}%</p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-5">{candidate.humanizedText}</p>
                            {candidate.scores.notes.length > 0 && (
                              <div className="space-y-1">
                                {candidate.scores.notes.map((note) => (
                                  <p key={note} className="text-[11px] text-muted-foreground">- {note}</p>
                                ))}
                              </div>
                            )}
                            <Button variant={isSelected ? "default" : "outline"} size="sm" className="w-full" onClick={() => applyHumanizerCandidate(candidate)}>
                              {isSelected ? "Selected" : "Choose Candidate"}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-2 block">Humanized Version</label>
                  <Textarea
                    value={humanizedResult.humanizedText}
                    readOnly
                    className="min-h-64 resize-none"
                  />
                </div>

                {semanticGuardrailReport && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium">Semantic Rewrite Guardrails</label>
                      <Badge variant={semanticGuardrailReport.status === "pass" ? "default" : semanticGuardrailReport.status === "warn" ? "secondary" : "destructive"}>
                        {semanticGuardrailReport.status.toUpperCase()} {semanticGuardrailReport.score}%
                      </Badge>
                    </div>
                    {semanticGuardrailReport.notes.map((note) => (
                      <p key={note} className="text-xs text-muted-foreground">- {note}</p>
                    ))}
                  </div>
                )}
                {humanizedResult.changes.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium block">Rewrite Diffs</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {humanizedResult.changes.slice(0, 4).map((change, index) => {
                        const preview = getDiffPreview(change.original, change.humanized)
                        return (
                          <div key={`${change.original}-${index}`} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rewrite {index + 1}</p>
                            <div className="rounded border border-red-200 bg-red-50/60 p-2">
                              <p className="text-[11px] uppercase tracking-wide text-red-600 mb-1">Before</p>
                              <p className="text-sm text-foreground">{preview.before}</p>
                            </div>
                            <div className="rounded border border-green-200 bg-green-50/60 p-2">
                              <p className="text-[11px] uppercase tracking-wide text-green-700 mb-1">After</p>
                              <p className="text-sm text-foreground">{preview.after}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {humanizedResult.changes.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Key Changes</label>
                    <div className="space-y-2">
                      {humanizedResult.changes.slice(0, 5).map((change, index) => (
                        <div key={index} className="p-3 border border-border rounded-lg text-sm">
                          <p className="text-muted-foreground mb-1">
                            <span className="font-mono line-through">"{change.original}"</span>
                          </p>
                          <p className="text-foreground">
                            <span className="font-mono">"{change.humanized}"</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  onClick={() => {
                    setText(humanizedResult.humanizedText)
                    setHumanizerDraft((current) => current ? { ...current, isFinal: true, updatedAt: Date.now() } : current)
                    setHumanizedResult(null)
                    setSemanticGuardrailReport(null)
                    toast.success("Humanized text copied to editor")
                  }}
                  className="w-full gap-2"
                >
                    Use Selected Rewrite
                </Button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Button
                    onClick={saveCurrentHumanizedToWorkspace}
                    variant="secondary"
                    className="gap-2"
                  >
                    <FloppyDisk size={16} weight="duotone" />
                    Save to Workspace
                  </Button>
                  <Button
                    onClick={() => exportHumanizedText({
                      humanizedText: humanizedResult.humanizedText,
                      sourceName: fileName || "Direct Input",
                      timestamp: humanizedResult.timestamp,
                    })}
                    variant="outline"
                  >
                    Export Regenerated TXT
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <SaveReviewDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSaveReview}
        onDiscard={handleDiscardReview}
      />

      {mode !== "humanizer" && <Card className="mt-8 border-border/70">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle>Re-upload History</CardTitle>
            <CardDescription>
              Exact-match registry built from documents you have already reviewed. This is separate from public-web and external-provider checks.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{reuploadHistory.length} {reuploadHistory.length === 1 ? "document" : "documents"}</Badge>
            <Badge variant="outline">{totalFingerprintReviews} total reviews</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFingerprintHistory}
              disabled={reuploadHistory.length === 0}
            >
              Clear History
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reuploadHistory.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground">No re-upload history yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Reviewed documents will appear here once their fingerprints have been stored.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reuploadHistory.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{entry.fileName}</p>
                        <Badge variant="secondary">{entry.reviewCount} {entry.reviewCount === 1 ? "review" : "reviews"}</Badge>
                        <Badge variant="outline">{entry.charCount.toLocaleString()} chars</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{entry.preview}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>First reviewed: {new Date(entry.firstReviewedAt).toLocaleString()}</span>
                        <span>Last reviewed: {new Date(entry.lastReviewedAt).toLocaleString()}</span>
                        <span>Fingerprint: {entry.fingerprint.slice(0, 12)}...</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLoadFingerprintPreview(entry)}
                      >
                        Load Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFingerprintEntry(entry.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      {mode === "humanizer" && (
        <Card className="mt-8 border-border/70">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle>Saved Humanizer Workspace</CardTitle>
              <CardDescription>
                Store rewritten outputs, reload them quickly, and export regenerated text files.
              </CardDescription>
            </div>
            <Badge variant="secondary">{(humanizerWorkspace || []).length} entries</Badge>
          </CardHeader>
          <CardContent>
            {(humanizerWorkspace || []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm font-medium text-foreground">No saved humanized outputs yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Run Humanizer, then use Save to Workspace to keep your regenerated outputs.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(humanizerWorkspace || []).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{entry.label}</p>
                          <Badge variant="outline">{entry.wordCount} words</Badge>
                          <Badge variant="secondary">{entry.creditsUsed} credit(s)</Badge>
                          {entry.candidates && entry.candidates.length > 0 && <Badge variant="outline">{entry.candidates.length} candidates</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">Source: {entry.sourceName}</p>
                        {entry.selectedCandidateId && (
                          <p className="text-xs text-muted-foreground">Selected candidate: {entry.selectedCandidateId}</p>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-2">{entry.humanizedText}</p>
                        <p className="text-xs text-muted-foreground">Saved: {new Date(entry.timestamp).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => loadHumanizerWorkspaceEntry(entry)}>
                          Load
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportHumanizedText({
                            humanizedText: entry.humanizedText,
                            sourceName: entry.sourceName,
                            timestamp: entry.timestamp,
                          })}
                        >
                          Export
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteHumanizerWorkspaceEntry(entry.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode !== "humanizer" && (savedReviews && savedReviews.length > 0) && (
        <div className="space-y-4 mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-foreground">Saved Reviews</h3>
            <Badge variant="secondary">{savedReviews.length} {savedReviews.length === 1 ? 'review' : 'reviews'}</Badge>
          </div>
          <SavedReviews
            reviews={savedReviews}
            onDelete={handleDeleteReview}
            onArchive={handleArchiveReview}
            onUnarchive={handleUnarchiveReview}
            onView={handleViewReview}
            onExport={handleExportReview}
          />
        </div>
      )}
    </div>
  )
}
