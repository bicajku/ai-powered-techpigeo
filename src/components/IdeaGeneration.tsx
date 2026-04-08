import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Lightbulb, 
  Sparkle, 
  FloppyDisk, 
  ArrowClockwise, 
  ChartDonut,
  PresentationChart,
  Lock
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { CookedIdea, BusinessCanvasModel, PitchDeck, SavedIdea, UserMemoryEntry, UserProfile } from "@/types"
import { BusinessCanvasView } from "@/components/BusinessCanvasView"
import { PitchDeckView } from "@/components/PitchDeckView"
import { SaveIdeaDialog } from "@/components/SaveIdeaDialog"
import { SavedIdeasList } from "@/components/SavedIdeasList"
import { useSafeKV } from "@/hooks/useSafeKV"
import { toast } from "sonner"
import { getFeatureEntitlements } from "@/lib/subscription"
import { sentinelQuery } from "@/lib/sentinel-query-pipeline"
import { isNeonConfigured } from "@/lib/neon-client"
import { trackGenerationInsight } from "@/lib/user-style-client"
import { isGeminiConfigured } from "@/lib/gemini-client"

interface IdeaGenerationProps {
  userId: string
  user?: UserProfile
}

export function IdeaGeneration({ userId, user }: IdeaGenerationProps) {
  const [ideaInput, setIdeaInput] = useState("")
  const [isLoadingIdea, setIsLoadingIdea] = useState(false)
  const [isLoadingCanvas, setIsLoadingCanvas] = useState(false)
  const [isLoadingPitch, setIsLoadingPitch] = useState(false)
  const [cookedIdea, setCookedIdea] = useState<CookedIdea | null>(null)
  const [businessCanvas, setBusinessCanvas] = useState<BusinessCanvasModel | null>(null)
  const [pitchDeck, setPitchDeck] = useState<PitchDeck | null>(null)
  const [currentIdeaInput, setCurrentIdeaInput] = useState("")
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savedIdeas, setSavedIdeas] = useSafeKV<SavedIdea[]>(
    userId ? `saved-ideas-${userId}` : "saved-ideas-temp",
    []
  )
  const [userMemory, setUserMemory] = useSafeKV<UserMemoryEntry[]>(
    userId ? `idea-memory-${userId}` : "idea-memory-temp",
    []
  )
  const resultsRef = useRef<HTMLDivElement>(null)

  // Pitch deck gating: Pro, Team, or Admin only
  const entitlements = user ? getFeatureEntitlements(user) : null
  const canAccessPitchDeck = user?.role === "admin" || entitlements?.isPaidPlan

  const buildMemoryContext = (): string => {
    const entries = userMemory ?? []
    if (entries.length === 0) return ""
    const recent = entries.slice(-6)
    const lines = recent.map(e => `- [${e.type}] ${e.title}: ${e.facts.join(" | ")}`).join("\n")
    return `\n\nThe user has previously explored these business ideas (use this to avoid repetition and build on their history):\n${lines}`
  }

  const isValidInput = ideaInput.trim().length >= 10

  const validateInputQuality = (text: string): { valid: boolean; reason?: string } => {
    const trimmed = text.trim()
    if (trimmed.length < 10) return { valid: false, reason: "Please enter at least 10 characters." }
    if (trimmed.length < 30) return { valid: false, reason: "Please describe your business idea in more detail (at least 30 characters)." }

    // Check for excessive repetition (e.g., "aaaa", "abcabc")
    const words = trimmed.toLowerCase().split(/\s+/)
    const uniqueWords = new Set(words)
    if (words.length >= 5 && uniqueWords.size / words.length < 0.3) {
      return { valid: false, reason: "Your input seems repetitive. Please describe a real business idea." }
    }

    // Check for gibberish: too many non-dictionary-like patterns
    const alphaWords = words.filter(w => /^[a-z]+$/.test(w))
    if (alphaWords.length >= 4) {
      const avgWordLen = alphaWords.reduce((sum, w) => sum + w.length, 0) / alphaWords.length
      const longGibberish = alphaWords.filter(w => w.length > 15).length
      if (avgWordLen > 12 || longGibberish > alphaWords.length * 0.5) {
        return { valid: false, reason: "Your input doesn't appear to describe a meaningful business idea. Please try again." }
      }
    }

    // Check that input has at least 3 real words (length >= 2)
    const meaningfulWords = words.filter(w => w.length >= 2)
    if (meaningfulWords.length < 3) {
      return { valid: false, reason: "Please describe your idea with at least a few words." }
    }

    // Check for too many special chars / numbers (not a real idea)
    const alphaChars = trimmed.replace(/[^a-zA-Z]/g, "").length
    if (alphaChars / trimmed.length < 0.4) {
      return { valid: false, reason: "Your input contains too many numbers or special characters. Please describe a business idea in words." }
    }

    return { valid: true }
  }

  const cleanJsonResponse = (raw: unknown): unknown => {
    // If spark.llm already parsed the response (parseJson: true), return as-is
    if (typeof raw === "object" && raw !== null) {
      return raw
    }

    if (typeof raw !== "string") {
      console.warn("cleanJsonResponse: unexpected response type:", typeof raw)
      return {}
    }

    let cleanedResponse = raw.trim()

    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/```\s*$/, "")
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/```\s*$/, "")
    }

    const firstBrace = cleanedResponse.indexOf("{")
    const lastBrace = cleanedResponse.lastIndexOf("}")

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1)
    }

    try {
      return JSON.parse(cleanedResponse.trim())
    } catch (e) {
      console.error("cleanJsonResponse: JSON parse failed:", e, "Raw:", cleanedResponse.substring(0, 200))
      return {}
    }
  }

  const asText = (value: unknown, fallback: string): string => {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
    return fallback
  }

  const asTextArray = (value: unknown, fallback: string[]): string[] => {
    if (!Array.isArray(value)) {
      return fallback
    }

    const items = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

    return items.length > 0 ? items : fallback
  }

  const normalizeCookedIdea = (raw: unknown, originalIdea: string): CookedIdea => {
    const source = (raw ?? {}) as Partial<CookedIdea>
    return {
      originalIdea,
      refinedIdea: asText(source.refinedIdea, "Refined idea was not generated. Please try again."),
      marketOpportunity: asText(source.marketOpportunity, "Market opportunity analysis was not generated."),
      competitiveAdvantage: asText(source.competitiveAdvantage, "Competitive advantage analysis was not generated."),
      targetMarket: asText(source.targetMarket, "Target market analysis was not generated."),
      revenueModel: asText(source.revenueModel, "Revenue model analysis was not generated."),
      keyInsights: asTextArray(source.keyInsights, ["Key insights were not generated."]),
      keyRisks: asTextArray(source.keyRisks, ["Key risks were not generated."]),
      nextSteps: asTextArray(source.nextSteps, ["Next steps were not generated."]),
    }
  }

  const normalizeBusinessCanvas = (raw: unknown): BusinessCanvasModel => {
    const source = (raw ?? {}) as Partial<BusinessCanvasModel>
    return {
      keyPartners: asText(source.keyPartners, "Key partners were not generated."),
      keyActivities: asText(source.keyActivities, "Key activities were not generated."),
      keyResources: asText(source.keyResources, "Key resources were not generated."),
      valueProposition: asText(source.valueProposition, "Value proposition was not generated."),
      customerRelationships: asText(source.customerRelationships, "Customer relationship strategy was not generated."),
      channels: asText(source.channels, "Channels were not generated."),
      customerSegments: asText(source.customerSegments, "Customer segments were not generated."),
      costStructure: asText(source.costStructure, "Cost structure was not generated."),
      revenueStreams: asText(source.revenueStreams, "Revenue streams were not generated."),
    }
  }

  const normalizePitchDeck = (raw: unknown): PitchDeck => {
    const source = (raw ?? {}) as Partial<PitchDeck>
    const fallbackTitles = [
      "Problem",
      "Solution",
      "Market Opportunity",
      "Product/Service",
      "Business Model",
      "Go-to-Market Strategy",
      "Competitive Advantage",
      "Financial Projections & Ask",
    ]

    const normalizedSlides = Array.isArray(source.slides)
      ? source.slides
          .filter((slide): slide is PitchDeck["slides"][number] => Boolean(slide))
          .map((slide, index) => ({
            slideNumber:
              typeof slide.slideNumber === "number" && Number.isFinite(slide.slideNumber)
                ? slide.slideNumber
                : index + 1,
            title: asText(slide.title, fallbackTitles[index] || `Slide ${index + 1}`),
            content: asText(slide.content, "Slide content was not generated."),
            notes: asText(slide.notes, "Speaker notes were not generated."),
          }))
      : []

    return {
      executiveSummary: asText(source.executiveSummary, "Executive summary was not generated."),
      slides: normalizedSlides,
    }
  }

  const normalizeSavedIdeaRecord = (record: SavedIdea): SavedIdea => {
    const normalizedCooked = normalizeCookedIdea(record.cookedIdea, record.originalIdea || "")

    return {
      ...record,
      name: asText(record.name, "Untitled Idea"),
      originalIdea: asText(record.originalIdea, normalizedCooked.originalIdea || "Untitled idea"),
      cookedIdea: normalizedCooked,
      businessCanvas: record.businessCanvas ? normalizeBusinessCanvas(record.businessCanvas) : undefined,
      pitchDeck: record.pitchDeck ? normalizePitchDeck(record.pitchDeck) : undefined,
      timestamp:
        typeof record.timestamp === "number" && Number.isFinite(record.timestamp)
          ? record.timestamp
          : Date.now(),
      userId: asText(record.userId, userId),
    }
  }

  const cookIdea = async () => {
    const validation = validateInputQuality(ideaInput)
    if (!validation.valid) {
      toast.error(validation.reason || "Please enter a valid business idea")
      return
    }

    setIsLoadingIdea(true)

    try {
      if (typeof spark === "undefined" || typeof spark.llm !== "function") {
        throw new Error("AI service is not available. Please refresh the page.")
      }

      const memoryContext = buildMemoryContext()

      const prompt = spark.llmPrompt`You are a world-class business mentor and innovation strategist.
Your task is to analyze and refine the following business idea:

"${ideaInput}"${memoryContext}

Provide a comprehensive analysis in valid JSON format with the following structure:

{
  "refinedIdea": "A refined, compelling version of the idea (2-3 paragraphs) that highlights the core value proposition, innovation, and impact.",
  "marketOpportunity": "Detailed analysis (2-3 paragraphs) of market size, trends, gaps this idea fills, and growth potential.",
  "competitiveAdvantage": "Explanation (2-3 paragraphs) of what makes this idea unique, defensible, and superior to existing solutions.",
  "targetMarket": "Specific description (2-3 paragraphs) of the ideal customer segments, their pain points, and why they would adopt this.",
  "revenueModel": "Practical revenue model description (2-3 paragraphs) including pricing strategy, monetization channels, and unit economics.",
  "keyInsights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "keyRisks": ["risk 1", "risk 2", "risk 3", "risk 4", "risk 5"],
  "nextSteps": ["step 1", "step 2", "step 3", "step 4", "step 5"]
}

CRITICAL: Return ONLY valid JSON with no markdown, no code blocks, no explanatory text.`

      let response: unknown
      const strPrompt = prompt as string
      if (isNeonConfigured() || isGeminiConfigured()) {
        try {
          const res = await sentinelQuery(strPrompt, {
            module: "idea-generation",
            userId: user?.id ? parseInt(user.id) || undefined : undefined,
            enableQualityGate: true,
            userInputForQualityGate: ideaInput,
            qualityGateProfile: "balanced",
            useConsensus: true,
            sparkFallback: async () => {
              if (typeof spark !== "undefined" && typeof spark.llm === "function") {
                return (await spark.llm(strPrompt, "gpt-4o", false)) as string
              }
              throw new Error("Spark fallback unavailable")
            }
          })
          if (res.status === "needs_clarification") {
            toast.error(res.response || "Please clarify your idea before generation.")
            return
          }
          response = cleanJsonResponse(res.response)
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

      const parsedResult = cleanJsonResponse(response)
      const cookedIdeaWithOriginal = normalizeCookedIdea(parsedResult, ideaInput)

      setCookedIdea(cookedIdeaWithOriginal)
      setBusinessCanvas(null)
      setPitchDeck(null)
      setCurrentIdeaInput(ideaInput)

      const memoryEntry: UserMemoryEntry = {
        id: crypto.randomUUID(),
        userId,
        type: "idea",
        title: cookedIdeaWithOriginal.refinedIdea.slice(0, 90),
        facts: [
          `Market: ${cookedIdeaWithOriginal.marketOpportunity.slice(0, 80)}`,
          `Revenue: ${cookedIdeaWithOriginal.revenueModel.slice(0, 80)}`,
          `Top risk: ${cookedIdeaWithOriginal.keyRisks[0] ?? "—"}`,
          `Target: ${cookedIdeaWithOriginal.targetMarket.slice(0, 60)}`,
        ],
        createdAt: Date.now(),
      }
      setUserMemory(current => [memoryEntry, ...(current ?? [])].slice(0, 20))

      // Track generation for user style profiling (non-blocking)
      if (user?.id) {
        trackGenerationInsight({
          conceptMode: user.industry || "general",
          tonePreference: "professional",
          audienceLevel: "intermediate",
          sectionsEdited: [],
          wasSaved: false,
        }).catch(err => console.warn("Failed to track generation:", err))
      }

      toast.success("Idea cooked successfully!")
      
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    } catch (error) {
      console.error("Error cooking idea:", error)
      toast.error("Failed to cook idea. Please try again.")
    } finally {
      setIsLoadingIdea(false)
    }
  }

  const generateBusinessCanvas = async () => {
    if (!cookedIdea) {
      toast.error("Please cook your idea first")
      return
    }

    if (typeof spark === "undefined" || typeof spark.llm !== "function") {
      toast.error("AI service is not available. Please refresh the page.")
      return
    }

    setIsLoadingCanvas(true)

    try {
      const prompt = spark.llmPrompt`You are an expert business model strategist. Based on the refined business idea below, generate a comprehensive Business Model Canvas.

Refined Idea: ${cookedIdea.refinedIdea}
Target Market: ${cookedIdea.targetMarket}
Revenue Model: ${cookedIdea.revenueModel}

Return a valid JSON object with these keys: keyPartners, keyActivities, keyResources, valueProposition, customerRelationships, channels, customerSegments, costStructure, revenueStreams. Each value should be a detailed 2-3 paragraph string.

CRITICAL: Return ONLY valid JSON with no markdown formatting.`

      let response: unknown
      const strPrompt = prompt as string
      if (isNeonConfigured() || isGeminiConfigured()) {
        try {
          const res = await sentinelQuery(strPrompt, {
            module: "idea-generation-canvas",
            userId: user?.id ? parseInt(user.id) || undefined : undefined,
            enableQualityGate: true,
            userInputForQualityGate: cookedIdea.refinedIdea,
            qualityGateProfile: "balanced",
            useConsensus: true,
            sparkFallback: async () => {
              if (typeof spark !== "undefined" && typeof spark.llm === "function") {
                return (await spark.llm(strPrompt, "gpt-4o", false)) as string
              }
              throw new Error("Spark fallback unavailable")
            }
          })
          if (res.status === "needs_clarification") {
            toast.error(res.response || "Please provide clearer idea details for canvas generation.")
            return
          }
          response = cleanJsonResponse(res.response)
        } catch {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            response = await spark.llm(strPrompt, "gpt-4o", true)
          } else {
            throw new Error("AI service unavailable")
          }
        }
      } else {
        try {
          response = await spark.llm(strPrompt, "gpt-4o", true)
        } catch {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            response = await spark.llm(strPrompt, "gpt-4o-mini", true)
          }
        }
      }

      const parsedResult = cleanJsonResponse(response)
      const normalizedCanvas = normalizeBusinessCanvas(parsedResult)

      // Verify we got real data (not all fallbacks)
      const hasRealData = normalizedCanvas.valueProposition !== "Value proposition was not generated."
        || normalizedCanvas.keyPartners !== "Key partners were not generated."
      if (!hasRealData) {
        console.error("Canvas generation returned empty data. Raw response:", response)
      }

      setBusinessCanvas(normalizedCanvas)

      const canvasMemory: UserMemoryEntry = {
        id: crypto.randomUUID(),
        userId,
        type: "canvas",
        title: `Canvas for: ${cookedIdea.refinedIdea.slice(0, 70)}`,
        facts: [
          `Value prop: ${normalizedCanvas.valueProposition.slice(0, 80)}`,
          `Revenue streams: ${normalizedCanvas.revenueStreams.slice(0, 80)}`,
          `Key activities: ${normalizedCanvas.keyActivities.slice(0, 60)}`,
        ],
        createdAt: Date.now(),
      }
      setUserMemory(current => [canvasMemory, ...(current ?? [])].slice(0, 20))

      toast.success("Business Canvas generated successfully!")
      
      setTimeout(() => {
        const canvasElement = document.querySelector('[data-canvas-view]')
        if (canvasElement) {
          canvasElement.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 100)
    } catch (error) {
      console.error("Error generating business canvas:", error)
      toast.error("Failed to generate Business Canvas. Please try again.")
    } finally {
      setIsLoadingCanvas(false)
    }
  }

  const generatePitchDeck = async () => {
    if (!cookedIdea) {
      toast.error("Please cook your idea first")
      return
    }

    if (typeof spark === "undefined" || typeof spark.llm !== "function") {
      toast.error("AI service is not available. Please refresh the page.")
      return
    }

    setIsLoadingPitch(true)

    try {
      const prompt = spark.llmPrompt`You are an expert pitch deck consultant. Create a compelling investor pitch deck based on this business idea:

Refined Idea: ${cookedIdea.refinedIdea}
Market Opportunity: ${cookedIdea.marketOpportunity}
Target Market: ${cookedIdea.targetMarket}
Revenue Model: ${cookedIdea.revenueModel}

Generate a pitch deck with exactly 8 slides. Return valid JSON with keys: executiveSummary (string, 2 paragraphs), slides (array of 8 objects each with slideNumber, title, content, notes). Slide titles should be: Problem, Solution, Market Opportunity, Product/Service, Business Model, Go-to-Market Strategy, Competitive Advantage, Financial Projections & Ask. Each slide content should be 2-3 paragraphs, notes 1-2 paragraphs.

CRITICAL: Return ONLY valid JSON with no markdown.`

      let response: unknown
      const strPrompt = prompt as string
      if (isNeonConfigured() || isGeminiConfigured()) {
        try {
          const res = await sentinelQuery(strPrompt, {
            module: "idea-generation-pitchdeck",
            userId: user?.id ? parseInt(user.id) || undefined : undefined,
            enableQualityGate: true,
            userInputForQualityGate: cookedIdea.refinedIdea,
            qualityGateProfile: "balanced",
            useConsensus: true,
            sparkFallback: async () => {
              if (typeof spark !== "undefined" && typeof spark.llm === "function") {
                return (await spark.llm(strPrompt, "gpt-4o", false)) as string
              }
              throw new Error("Spark fallback unavailable")
            }
          })
          if (res.status === "needs_clarification") {
            toast.error(res.response || "Please provide clearer idea details for pitch deck generation.")
            return
          }
          response = cleanJsonResponse(res.response)
        } catch {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            response = await spark.llm(strPrompt, "gpt-4o", true)
          } else {
            throw new Error("AI service unavailable")
          }
        }
      } else {
        try {
          response = await spark.llm(strPrompt, "gpt-4o", true)
        } catch {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            response = await spark.llm(strPrompt, "gpt-4o-mini", true)
          }
        }
      }

      const parsedResult = cleanJsonResponse(response)
      const normalizedPitchDeck = normalizePitchDeck(parsedResult)

      if (normalizedPitchDeck.slides.length === 0) {
        console.error("Pitch deck returned no slides. Raw response:", response)
        toast.error("Pitch Deck generation returned incomplete data. Please try again.")
        return
      }

      setPitchDeck(normalizedPitchDeck)

      const pitchMemory: UserMemoryEntry = {
        id: crypto.randomUUID(),
        userId,
        type: "pitch",
        title: `Pitch for: ${cookedIdea.refinedIdea.slice(0, 70)}`,
        facts: [
          `Summary: ${normalizedPitchDeck.executiveSummary.slice(0, 100)}`,
          `Slides: ${normalizedPitchDeck.slides.length} slides generated`,
        ],
        createdAt: Date.now(),
      }
      setUserMemory(current => [pitchMemory, ...(current ?? [])].slice(0, 20))

      toast.success("Pitch Deck generated successfully!")
      
      setTimeout(() => {
        const pitchElement = document.querySelector('[data-pitch-view]')
        if (pitchElement) {
          pitchElement.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 100)
    } catch (error) {
      console.error("Error generating pitch deck:", error)
      toast.error("Failed to generate Pitch Deck. Please try again.")
    } finally {
      setIsLoadingPitch(false)
    }
  }

  const handleNewIdea = () => {
    setIdeaInput("")
    setCookedIdea(null)
    setBusinessCanvas(null)
    setPitchDeck(null)
    setCurrentIdeaInput("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSaveIdea = (name: string) => {
    if (!cookedIdea || !currentIdeaInput) return

    const newIdea: SavedIdea = {
      id: Date.now().toString(),
      name: name,
      originalIdea: currentIdeaInput,
      cookedIdea: cookedIdea,
      businessCanvas: businessCanvas || undefined,
      pitchDeck: pitchDeck || undefined,
      timestamp: Date.now(),
      userId: userId
    }

    setSavedIdeas((current) => [newIdea, ...(current || [])])
    toast.success("Idea saved successfully!")
  }

  const handleDeleteIdea = (id: string) => {
    setSavedIdeas((current) => (current || []).filter(i => i.id !== id))
    toast.success("Idea deleted")
  }

  const handleViewIdea = (idea: SavedIdea) => {
    const normalized = normalizeSavedIdeaRecord(idea)
    setIdeaInput(normalized.originalIdea)
    setCookedIdea(normalized.cookedIdea)
    setBusinessCanvas(normalized.businessCanvas || null)
    setPitchDeck(normalized.pitchDeck || null)
    setCurrentIdeaInput(normalized.originalIdea)

    setSavedIdeas((current) =>
      (current || []).map((entry) => (entry.id === idea.id ? normalized : entry))
    )

    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <>
      <SaveIdeaDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSaveIdea}
      />
      <Tabs defaultValue="cook" className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto mb-8 grid-cols-2">
          <TabsTrigger value="cook" className="gap-2">
            <Lightbulb size={18} weight="bold" />
            Cook Idea
          </TabsTrigger>
          <TabsTrigger value="saved" className="gap-2">
            <FloppyDisk size={18} weight="bold" />
            Saved ({savedIdeas?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cook" className="space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 p-6 md:p-8"
          >
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                What's your business idea?
              </h3>
              <p className="text-muted-foreground text-sm">
                Share your raw concept, and we'll help you refine it into an actionable business strategy
              </p>
            </div>

            <label htmlFor="idea-input" className="block text-sm font-semibold text-foreground mb-3">
              Describe your business idea
            </label>
            <Textarea
              id="idea-input"
              value={ideaInput}
              onChange={(e) => setIdeaInput(e.target.value)}
              placeholder="e.g., A mobile app that connects local farmers directly with consumers, cutting out middlemen and ensuring fresh produce delivery within 24 hours..."
              className="min-h-32 resize-none text-base leading-relaxed focus:ring-2 focus:ring-accent transition-all mb-4"
              maxLength={1000}
            />

            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {ideaInput.length >= 900 && (
                  <span className={ideaInput.length >= 1000 ? "text-destructive font-medium" : ""}>
                    {ideaInput.length}/1000
                  </span>
                )}
              </div>
              
              <Button
                onClick={cookIdea}
                disabled={!isValidInput || isLoadingIdea}
                size="lg"
                className="gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
              >
                {isLoadingIdea ? (
                  <>Cooking...</>
                ) : (
                  <>
                    <Sparkle weight="duotone" size={20} />
                    Cook My Idea
                  </>
                )}
              </Button>
            </div>
          </motion.div>

          <div ref={resultsRef}>
            <AnimatePresence>
              {cookedIdea && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <h2 className="text-2xl font-bold text-foreground">Your Refined Idea</h2>
                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={() => setShowSaveDialog(true)} 
                        variant="default" 
                        size="sm" 
                        className="gap-2"
                      >
                        <FloppyDisk weight="bold" size={16} />
                        Save Idea
                      </Button>
                      <Button 
                        onClick={handleNewIdea} 
                        variant="outline" 
                        size="sm" 
                        className="gap-2"
                      >
                        <ArrowClockwise weight="bold" size={16} />
                        New Idea
                      </Button>
                    </div>
                  </div>

                  <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Refined Concept</h3>
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {cookedIdea.refinedIdea}
                    </p>
                  </Card>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Card className="p-6">
                      <h4 className="font-semibold text-foreground mb-3">Market Opportunity</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {cookedIdea.marketOpportunity}
                      </p>
                    </Card>

                    <Card className="p-6">
                      <h4 className="font-semibold text-foreground mb-3">Competitive Advantage</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {cookedIdea.competitiveAdvantage}
                      </p>
                    </Card>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Card className="p-6">
                      <h4 className="font-semibold text-foreground mb-3">Target Market</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {cookedIdea.targetMarket}
                      </p>
                    </Card>

                    <Card className="p-6">
                      <h4 className="font-semibold text-foreground mb-3">Revenue Model</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {cookedIdea.revenueModel}
                      </p>
                    </Card>
                  </div>

                  <h3 className="text-xl font-semibold text-foreground pt-4">Key Insights</h3>
                  <Card className="p-6">
                    <ul className="space-y-2">
                      {cookedIdea.keyInsights.map((insight, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Sparkle size={16} weight="duotone" className="text-primary mt-1 flex-shrink-0" />
                          <span className="text-muted-foreground text-sm">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <h3 className="text-xl font-semibold text-foreground pt-2">Key Risks</h3>
                  <Card className="p-6">
                    <ul className="space-y-2">
                      {cookedIdea.keyRisks.map((risk, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-destructive font-semibold flex-shrink-0">!</span>
                          <span className="text-muted-foreground text-sm">{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <h3 className="text-xl font-semibold text-foreground pt-2">Next Steps</h3>
                  <Card className="p-6">
                    <ul className="space-y-2">
                      {cookedIdea.nextSteps.map((step, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-accent font-semibold flex-shrink-0">{index + 1}.</span>
                          <span className="text-muted-foreground text-sm">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <div className="grid md:grid-cols-2 gap-4 pt-4">
                    <Button
                      onClick={generateBusinessCanvas}
                      disabled={!cookedIdea || isLoadingCanvas}
                      size="lg"
                      variant="outline"
                      className="gap-2 h-auto py-6 flex-col"
                    >
                      {isLoadingCanvas ? (
                        <>
                          <ChartDonut size={32} weight="duotone" className="text-primary animate-pulse" />
                          <div>
                            <div className="font-semibold">Generating Canvas...</div>
                            <div className="text-xs text-muted-foreground font-normal">Please wait</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <ChartDonut size={32} weight="duotone" className="text-primary" />
                          <div>
                            <div className="font-semibold">Generate Business Canvas</div>
                            <div className="text-xs text-muted-foreground font-normal">{cookedIdea ? "Free - Powered by AI" : "Cook idea first"}</div>
                          </div>
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={() => {
                        if (!canAccessPitchDeck) {
                          toast.error("Pitch Deck is a premium feature. Upgrade to Pro or Team plan to create investor-ready pitch decks.")
                          return
                        }
                        generatePitchDeck()
                      }}
                      disabled={!cookedIdea || isLoadingPitch}
                      size="lg"
                      variant="outline"
                      className={`gap-2 h-auto py-6 flex-col ${!canAccessPitchDeck ? "opacity-75" : ""}`}
                    >
                      {isLoadingPitch ? (
                        <>
                          <PresentationChart size={32} weight="duotone" className="text-accent animate-pulse" />
                          <div>
                            <div className="font-semibold">Generating Pitch Deck...</div>
                            <div className="text-xs text-muted-foreground font-normal">Please wait</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <PresentationChart size={32} weight="duotone" className="text-accent" />
                          <div>
                            <div className="font-semibold flex items-center gap-1.5">
                              Generate Pitch Deck
                              {!canAccessPitchDeck && <Lock size={14} weight="bold" className="text-muted-foreground" />}
                            </div>
                            <div className="text-xs text-muted-foreground font-normal">
                              {!canAccessPitchDeck ? "Pro / Team / Admin only" : cookedIdea ? "Investor Ready" : "Cook idea first"}
                            </div>
                          </div>
                        </>
                      )}
                    </Button>
                  </div>

                  <AnimatePresence mode="wait">
                    {isLoadingCanvas && (
                      <motion.div
                        key="canvas-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 p-8 text-center"
                      >
                        <ChartDonut size={48} weight="duotone" className="text-primary animate-pulse mx-auto mb-4" />
                        <p className="text-muted-foreground">Generating Business Canvas Model...</p>
                      </motion.div>
                    )}

                    {!isLoadingCanvas && businessCanvas && (
                      <motion.div
                        key="canvas-result"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                      >
                        <BusinessCanvasView canvas={businessCanvas} ideaName={currentIdeaInput} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence mode="wait">
                    {isLoadingPitch && (
                      <motion.div
                        key="pitch-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 p-8 text-center"
                      >
                        <PresentationChart size={48} weight="duotone" className="text-accent animate-pulse mx-auto mb-4" />
                        <p className="text-muted-foreground">Generating Pitch Deck...</p>
                      </motion.div>
                    )}

                    {!isLoadingPitch && pitchDeck && (
                      <motion.div
                        key="pitch-result"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                      >
                        <PitchDeckView pitchDeck={pitchDeck} ideaName={currentIdeaInput} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="saved" className="space-y-6">
          <SavedIdeasList
            ideas={savedIdeas || []}
            onDelete={handleDeleteIdea}
            onView={handleViewIdea}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
