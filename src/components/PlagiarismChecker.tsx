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
import { PlagiarismResult, DocumentReviewResult, HumanizedResult, SavedReviewDocument, UserProfile } from "@/types"
import { useKV } from "@github/spark/hooks"
import { SaveReviewDialog } from "@/components/SaveReviewDialog"
import { SavedReviews } from "@/components/SavedReviews"
import { exportReviewToPDF } from "@/lib/pdf-export"
import { computeReviewAnalysis, ReviewComputationMeta, ReviewFilters, SectionSummary } from "@/lib/review-engine"
import { addProCredits, consumeProCredits, getFeatureEntitlements, upgradeToPro } from "@/lib/subscription"
import { getCurrentMonthKey, getExportPlanConfig } from "@/lib/strategy-governance"
import mammoth from "mammoth"
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { createWorker } from "tesseract.js"

GlobalWorkerOptions.workerSrc = pdfWorkerUrl
const MAX_DOCUMENT_CHARS = 50000

interface PlagiarismCheckerProps {
  user: UserProfile
}

export function PlagiarismChecker({ user }: PlagiarismCheckerProps) {
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
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    excludeQuotes: true,
    excludeReferences: true,
    minMatchWords: 8,
  })
  const [subscriptionPlan, setSubscriptionPlan] = useState<"basic" | "pro">(user.subscription?.plan || "basic")
  const [proCredits, setProCredits] = useState(user.subscription?.proCredits || 0)
  const [documentReviews, setDocumentReviews] = useKV<DocumentReviewResult[]>(
    `document-reviews-${userId}`,
    []
  )
  const [savedReviews, setSavedReviews] = useKV<SavedReviewDocument[]>(
    `saved-reviews-${userId}`,
    []
  )
  const [monthlyReviewExportCount, setMonthlyReviewExportCount] = useKV<number>(
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
    },
  })
  const exportPlanConfig = getExportPlanConfig(entitlements.isPro ? "pro" : "basic")
  const activeReviewFilters = entitlements.isPro
    ? reviewFilters
    : { excludeQuotes: true, excludeReferences: true, minMatchWords: 8 }

  const resetUploadInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const normalizeExtractedText = (rawText: string): string => {
    return rawText
      .replace(/\u0000/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
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
              setUploadProgress(100)
              toast.success(`OCR completed for "${file.name}"`)
            } else {
              toast.error("Could not extract readable text from this PDF, even with OCR. Try a clearer scan (300 DPI+) or paste text manually.")
              setUploadStatus("Upload failed: OCR could not detect readable text. Try a higher-quality scan.")
              setText("")
              setFileName(null)
            }
            return
          }
          setUploadProgress(100)
          toast.success(`File "${file.name}" loaded successfully`)
        } else {
          setUploadStatus("No selectable text found. Running OCR fallback...")
          setUploadProgress(30)
          const ocrText = await extractTextFromPdfWithOcr(arrayBuffer)

          if (ocrText && ocrText.trim().length > 0 && applyExtractedText(ocrText, "PDF OCR")) {
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

  const preprocessCanvasForOcr = (source: HTMLCanvasElement): HTMLCanvasElement => {
    const canvas = document.createElement("canvas")
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      return source
    }

    ctx.drawImage(source, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = imageData

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // Grayscale + threshold improves OCR on low-contrast scanned pages.
      const grayscale = 0.299 * r + 0.587 * g + 0.114 * b
      const thresholded = grayscale > 180 ? 255 : 0

      data[i] = thresholded
      data[i + 1] = thresholded
      data[i + 2] = thresholded
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

        // If first pass is too short, try a thresholded second pass.
        if (firstPass.length < 40) {
          const enhancedCanvas = preprocessCanvasForOcr(canvas)
          const {
            data: { text: secondPassText },
          } = await worker.recognize(enhancedCanvas)

          const secondPass = secondPassText.trim()
          if (secondPass.length > bestText.length) {
            bestText = secondPass
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
    setHumanizedResult(null)

    try {
      const prompt = spark.llmPrompt`You are an advanced plagiarism detection and academic integrity system. Analyze the following text comprehensively.

Text to analyze:
${text}

Perform the following analysis:
1. Detect potential plagiarism by identifying passages that may be copied from external sources
2. Detect AI-generated content using linguistic patterns, repetitive structures, and unnatural phrasing
3. Evaluate if the text is ready for Turnitin submission
4. Check references and sources mentioned in the text for validity
5. Identify potential source matches
6. Provide improvement recommendations

CRITICAL: Return ONLY a valid JSON object with NO markdown, NO code blocks, NO text before or after.

Required JSON structure:
{
  "overallScore": <number 0-100, where 100 is completely original>,
  "plagiarismPercentage": <number 0-100>,
  "aiContentPercentage": <number 0-100>,
  "highlights": [
    {
      "text": "<excerpt of potentially plagiarized text>",
      "startIndex": <approximate character position>,
      "endIndex": <approximate end position>,
      "severity": "<high|medium|low>",
      "source": "<potential source if identified>"
    }
  ],
  "aiHighlights": [
    {
      "text": "<excerpt of AI-detected text>",
      "startIndex": <approximate character position>,
      "endIndex": <approximate end position>,
      "confidence": <number 0-100>
    }
  ],
  "summary": "<2-3 paragraph summary of the document>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "..."],
  "turnitinReady": <boolean>,
  "validReferences": [
    {
      "reference": "<reference text>",
      "isValid": <boolean>,
      "reason": "<explanation>"
    }
  ],
  "detectedSources": [
    {
      "source": "<source name or URL>",
      "similarity": <number 0-100>
    }
  ]
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
      
      const parsedResult = JSON.parse(cleanedResponse) as PlagiarismResult
      const enriched = computeReviewAnalysis(text, parsedResult, activeReviewFilters)

      setResult(enriched.result)
      setReviewMeta(enriched.meta)
      setSectionSummaries(enriched.sections)

      const review: DocumentReviewResult = {
        documentText: text,
        fileName: fileName || "Untitled Document",
        summary: enriched.result.summary,
        plagiarismResult: enriched.result,
        timestamp: Date.now()
      }

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

  const handleViewReview = (review: SavedReviewDocument) => {
    setText(review.documentText)
    setFileName(review.fileName)
    setResult(review.plagiarismResult)
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

  const humanizeText = async () => {
    if (!text.trim()) {
      toast.error("Please enter text to humanize")
      return
    }

    if (!entitlements.isPro) {
      toast.info("🔒 Humanizer is available in Pro. Upgrade to unlock this feature.")
      return
    }

    if (!entitlements.canUseHumanizer) {
      toast.error("No Pro credits remaining. Please buy credits to continue using Humanizer.")
      return
    }

    setIsHumanizing(true)

    try {
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

      const response = await spark.llm(prompt, "gpt-4o", true)

      let cleaned = response.trim()
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

      const parsed = JSON.parse(cleaned)

      const humanized: HumanizedResult = {
        originalText: text,
        humanizedText: parsed.humanizedText,
        changes: parsed.changes || [],
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
    const result = await upgradeToPro(user.id, 25)
    if (result.success) {
      setSubscriptionPlan("pro")
      setProCredits(result.credits)
      toast.success(`Upgraded to Pro. ${result.credits} credits added.`)
    } else {
      toast.error(result.error || "Failed to upgrade to Pro")
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
            <Textarea
              id="plagiarism-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your text here or upload a document above..."
              className="min-h-64 resize-none"
              maxLength={50000}
            />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-2">
              <p className="text-xs text-muted-foreground">
                {text.length.toLocaleString()} / 50,000 characters
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={humanizeText}
                  disabled={!text.trim() || isHumanizing || isChecking || (entitlements.isPro && proCredits <= 0)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <LockKey size={16} weight="duotone" />
                  {isHumanizing ? "Humanizing..." : entitlements.isPro ? `Humanize (Pro: ${proCredits})` : "Humanize (Pro)"}
                </Button>

                {!entitlements.isPro && (
                  <Button onClick={handleUpgradeToPro} variant="secondary" size="sm">
                    Upgrade to Pro
                  </Button>
                )}

                {entitlements.isPro && proCredits <= 0 && (
                  <Button onClick={handleBuyCredits} variant="secondary" size="sm">
                    Buy Credits
                  </Button>
                )}

                <Button
                  onClick={checkPlagiarism}
                  disabled={!text.trim() || text.trim().length < 50 || isChecking || isUploading}
                  size="sm"
                  className="gap-2"
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
              {!entitlements.isPro && (
                <p className="text-xs text-primary">
                  Advanced filter customization is available on Pro. Basic uses safe defaults (quotes/references excluded, min match words = 8).
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewFilters.excludeQuotes}
                    disabled={!entitlements.isPro}
                    onChange={(e) => setReviewFilters((prev) => ({ ...prev, excludeQuotes: e.target.checked }))}
                  />
                  Exclude quoted matches
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewFilters.excludeReferences}
                    disabled={!entitlements.isPro}
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
                    disabled={!entitlements.isPro}
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
                    {result.aiHighlights.length > 0 ? (
                      <div className="space-y-3">
                        {result.aiHighlights.map((highlight, index) => (
                          <Alert key={index}>
                            <AlertDescription>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">
                                    {highlight.confidence}% Confidence
                                  </Badge>
                                  <Robot size={16} weight="duotone" />
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
