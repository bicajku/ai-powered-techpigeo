import { useState, useRef } from "react"
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
import { isNeonConfigured } from "@/lib/neon-client"
import { isGeminiConfigured } from "@/lib/gemini-client"
import { DocumentFingerprintRecord, PlagiarismResult, DocumentReviewResult, ExternalSourceCheckResult, HumanizedResult, SavedReviewDocument, UserProfile } from "@/types"
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
import mammoth from "mammoth"
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { createWorker } from "tesseract.js"

GlobalWorkerOptions.workerSrc = pdfWorkerUrl
const MAX_DOCUMENT_CHARS = 50000

interface PlagiarismCheckerProps {
  user: UserProfile | null
}

// Auth guard wrapper — keeps hooks unconditionally called in the inner component.
export function PlagiarismChecker({ user }: PlagiarismCheckerProps) {
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

  return <PlagiarismCheckerInner user={user} />
}

// Inner component: always receives a non-null user so hooks are always called unconditionally.
function PlagiarismCheckerInner({ user }: { user: UserProfile }) {
  const userId = user.id
  const [text, setText] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [isHumanizing, setIsHumanizing] = useState(false)
  const [result, setResult] = useState<PlagiarismResult | null>(null)
  const [humanizedResult, setHumanizedResult] = useState<HumanizedResult | null>(null)
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
  const activeReviewFilters = entitlements.isPaidPlan
    ? reviewFilters
    : { excludeQuotes: true, excludeReferences: true, minMatchWords: 8 }
  const normalizedFingerprintRegistry = Array.isArray(documentFingerprintRegistry) ? documentFingerprintRegistry : []
  const reuploadHistory = [...normalizedFingerprintRegistry].sort((left, right) => right.lastReviewedAt - left.lastReviewedAt)
  const totalFingerprintReviews = reuploadHistory.reduce((sum, entry) => sum + entry.reviewCount, 0)

  const resetUploadInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const normalizeExtractedText = (rawText: string): string => {
    return normalizeDocumentText(rawText)
  }

  const applyExtractedText = (rawText: string, sourceLabel: string): boolean => {
    const normalized = normalizeExtractedText(rawText)

    if (!normalized || normalized.length === 0) {
      return false
    }

    if (normalized.length > MAX_DOCUMENT_CHARS) {
      const truncated = normalized.slice(0, MAX_DOCUMENT_CHARS)
      setText(truncated)
      setUploadStatus(
        `${sourceLabel} processed: ${normalized.length.toLocaleString()} characters extracted; truncated to ${MAX_DOCUMENT_CHARS.toLocaleString()} for analysis.`
      )
      toast.warning(`Document is very large. Trimmed to ${MAX_DOCUMENT_CHARS.toLocaleString()} characters for reliable analysis.`)
      return true
    }

    setText(normalized)
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
        performEnhancedPlagiarismCheck(text, spark, 3),
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
      setResult(enriched.result)
      setReviewMeta(enriched.meta)
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
        toast.success("Document analysis complete! ✓ Ready for Turnitin")
      } else {
        toast.warning("Document analysis complete. Review recommendations before submission.")
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

  const handleViewReview = (review: SavedReviewDocument) => {
    setText(review.documentText)
    setFileName(review.fileName)
    setResult(review.plagiarismResult)
    setExternalSourceCheck(review.externalSourceCheck || null)
    const enriched = computeReviewAnalysis(review.documentText, review.plagiarismResult, activeReviewFilters)
    setReviewMeta(enriched.meta)
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
      await exportReviewToPDF(review, {
        meta: enriched.meta,
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
        meta: enriched.meta,
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

  const humanizeText = async () => {
    if (!text.trim()) {
      toast.error("Please enter text to humanize")
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

    setIsHumanizing(true)

    try {
      if (typeof spark === "undefined" || typeof spark.llmPrompt === "undefined" || typeof spark.llm !== "function") {
        toast.error("Spark is not available. Please refresh the page.")
        setIsHumanizing(false)
        return
      }

      const prompt = spark.llmPrompt`You are an expert text humanizer. Rewrite the following text to sound more natural, authentic, and human-written while preserving the core meaning and information.

Original text:
${text}

Instructions:
- Remove robotic or overly formal language
- Add natural variations in sentence structure
- Include appropriate contractions and colloquialisms where suitable
- Maintain the original meaning and key facts
- Make it sound conversational yet professional
- Vary sentence length and complexity

Return ONLY a valid JSON object:
{
  "humanizedText": "<the fully rewritten text>",
  "changes": [
    {
      "original": "<original phrase>",
      "humanized": "<humanized version>"
    }
  ]
}`

      let response: unknown
      const strPrompt = prompt as string
      if (isNeonConfigured() || isGeminiConfigured()) {
        try {
          const res = await sentinelQuery(strPrompt, {
            module: "humanizer",
            userId: user?.id ? parseInt(user.id) || undefined : undefined,
            sparkFallback: async () => {
              if (typeof spark !== "undefined" && typeof spark.llm === "function") {
                return (await spark.llm(strPrompt, "gpt-4o", false)) as string
              }
              throw new Error("Spark fallback unavailable")
            }
          })
          response = typeof res.response === 'string' ? res.response : JSON.stringify(res.response)
        } catch {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            response = await spark.llm(strPrompt, "gpt-4o", true)
          } else {
            throw new Error("AI service unavailable")
          }
        }
      } else {
        response = await spark.llm(strPrompt, "gpt-4o", true)
      }

      let parsed: Record<string, unknown>
      if (typeof response === "object" && response !== null) {
        parsed = response as Record<string, unknown>
      } else {
        let cleaned = (response as string).trim()
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

      const humanized: HumanizedResult = {
        originalText: text,
        humanizedText: typeof parsed.humanizedText === "string" ? parsed.humanizedText : text,
        changes: Array.isArray(parsed.changes) ? parsed.changes as { original: string; humanized: string }[] : [],
        timestamp: Date.now(),
      }

      const creditUse = await consumeProCredits(user.id, 1)
      if (!creditUse.success) {
        toast.error(creditUse.error || "Failed to consume Pro credit")
        return
      }

      setProCredits(creditUse.remainingCredits)
      setHumanizedResult(humanized)
      toast.success(`Text humanized successfully! ${creditUse.remainingCredits} Pro credits left.`)
    } catch (error) {
      console.error("Humanization error:", error)
      toast.error("Failed to humanize text. Please try again.")
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

  // Gate: show paywall for basic users without trial / with exhausted trial (admin bypasses)
  if (user.role !== "admin" && !entitlements.canAccessReview) {
    return (
      <UpgradePaywall
        user={user}
        feature="review"
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
              <CardTitle>Academic Review & Integrity Analyzer</CardTitle>
              <CardDescription>
                Analyze thesis/article documents for similarity, AI-writing risk, and citation quality
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
                setText(value)
              }}
              placeholder="Paste your text here or upload a document above..."
              className="min-h-64 resize-none"
              maxLength={50000}
            />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-2">
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  {text.length.toLocaleString()} / 50,000 characters
                </p>
                {text.length > 0 && (
                  <Button
                    onClick={() => {
                      setText("")
                      setFileName(null)
                      setResult(null)
                      setHumanizedResult(null)
                      toast.info("Text cleared")
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={humanizeText}
                  disabled={!text.trim() || isHumanizing || isChecking || (entitlements.isPaidPlan && proCredits <= 0)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <LockKey size={16} weight="duotone" />
                  {isHumanizing ? "Humanizing..." : entitlements.isPaidPlan ? `Humanize (${subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)}: ${proCredits})` : "Humanize (Pro/Team)"}
                </Button>

                {!entitlements.isPaidPlan && user.role !== "admin" && (
                  <div className="flex gap-1">
                    <Button onClick={handleUpgradeToPro} variant="secondary" size="sm">
                      Upgrade to Pro
                    </Button>
                    <Button onClick={handleUpgradeToTeam} variant="outline" size="sm">
                      Team
                    </Button>
                  </div>
                )}

                {entitlements.isPaidPlan && proCredits <= 0 && (
                  <Button onClick={handleBuyCredits} variant="secondary" size="sm">
                    Buy Credits
                  </Button>
                )}

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
              </div>
            </div>

            <div className="mt-4 p-3 border border-border rounded-lg space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scoring Filters</p>
              <p className="text-xs text-muted-foreground">
                These controls emulate Turnitin-style exclusions and affect displayed similarity/integrity values.
              </p>
              {!entitlements.isPaidPlan && user.role !== "admin" && (
                <p className="text-xs text-primary">
                  Advanced filter customization is available on Pro/Team. Basic uses safe defaults (quotes/references excluded, min match words = 8).
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
            </div>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
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
                      Turnitin Ready
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
                      <p className="text-sm font-medium text-muted-foreground">Likely Turnitin Range</p>
                      <Badge variant="secondary">Estimate</Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {reviewMeta
                        ? `${reviewMeta.likelyTurnitinRange.min}% - ${reviewMeta.likelyTurnitinRange.max}%`
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
                    <TabsList className="grid min-w-[680px] grid-cols-5">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="plagiarism">Similarity</TabsTrigger>
                      <TabsTrigger value="ai">AI Detection</TabsTrigger>
                      <TabsTrigger value="references">References</TabsTrigger>
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
      </AnimatePresence>

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
                  Humanized Text
                </CardTitle>
                <CardDescription>
                  Your text has been rewritten to sound more natural and human
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Humanized Version</label>
                  <Textarea
                    value={humanizedResult.humanizedText}
                    readOnly
                    className="min-h-64 resize-none"
                  />
                </div>
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
                    setHumanizedResult(null)
                    toast.success("Humanized text copied to editor")
                  }}
                  className="w-full gap-2"
                >
                  Use Humanized Text
                </Button>
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

      <Card className="mt-8 border-border/70">
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
      </Card>

      {(savedReviews && savedReviews.length > 0) && (
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
