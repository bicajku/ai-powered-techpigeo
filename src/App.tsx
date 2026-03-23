import { useEffect, useMemo, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Sparkle, Lightbulb, ChatsCircle, Palette, Target, ArrowClockwise, FloppyDisk, FolderOpen, Code, Desktop, Database, DeviceMobile, ListChecks, ChartBar, ShieldCheck, MagnifyingGlass, CaretUpDown, Check, BookOpen, ClockCounterClockwise, ArrowsHorizontal, LockSimple, Lightning, Brain } from "@phosphor-icons/react"
import { UpgradePaywall } from "@/components/UpgradePaywall"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ResultCard } from "@/components/ResultCard"
import { LoadingState } from "@/components/LoadingState"
import { EmptyState } from "@/components/EmptyState"
import { SavedStrategies } from "@/components/SavedStrategies"
import { ComparisonView } from "@/components/ComparisonView"
import { SaveStrategyDialog } from "@/components/SaveStrategyDialog"
import { StrategyTemplatesBrowser } from "@/components/StrategyTemplatesBrowser"
import { UserMenu } from "@/components/UserMenu"
import { Dashboard } from "@/components/Dashboard"
import { AdminDashboard } from "@/components/AdminDashboard"
import { LandingPage } from "@/components/LandingPage"
import { SentinelBrain } from "@/components/SentinelBrain"
import { WelcomeBanner } from "@/components/WelcomeBanner"
import { TopNotchBanner } from "@/components/TopNotchBanner"
import { Footer } from "@/components/Footer"
import { PlagiarismChecker } from "@/components/PlagiarismChecker"
import { IdeaGeneration } from "@/components/IdeaGeneration"
import { NGOModule } from "@/components/NGOModule"
import { MobileNav } from "@/components/MobileNav"
import faviconImg from "@/assets/images/favicon.png"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { toast } from "sonner"
import { useSafeKV } from "@/hooks/useSafeKV"
import { motion, AnimatePresence } from "framer-motion"
import { MarketingResult, SavedStrategy, UserProfile, ConceptMode, StrategyWorkflowRun } from "@/types"
import { authService } from "@/lib/auth"
import { BRAND_THEME_STORAGE_KEY, DEFAULT_BRAND_THEME, isBrandThemeName, type BrandThemeName } from "@/lib/brand-theme"
import { logError } from "@/lib/error-logger"
import { hydrateSecretsFromKV } from "@/lib/secret-store"
import { cn } from "@/lib/utils"
import { sentinelQuery } from "@/lib/sentinel-query-pipeline"
import { isNeonConfigured } from "@/lib/neon-client"
import { isGeminiConfigured } from "@/lib/gemini-client"
import { getFeatureEntitlements, requestUpgrade } from "@/lib/subscription"
import { exportStrategyAsPDF } from "@/lib/pdf-export"
import { exportStrategyAsWord } from "@/lib/document-export"
import { estimateGenerationCostCents, estimatePromptTokens, getCurrentMonthKey, getExportPlanConfig, getStrategyPlanConfig, loadBudgetLimits } from "@/lib/strategy-governance"
import { adminService } from "@/lib/admin"

interface PromptMemoryItem {
  prompt: string
  conceptMode: ConceptMode
  count: number
  lastUsedAt: number
}

interface StrategyQAVerdict {
  pass: boolean
  score: number
  summary: string
  issues: string[]
}

const CONCEPT_MODE_INSTRUCTION: Record<ConceptMode, string> = {
  auto: "Auto-select the most relevant archetypes from the knowledge base based on the user's topic.",
  sales: "Prioritize conversational sales agent, lead qualification, appointment booking, CRM funnel visibility, and conversion optimization archetypes.",
  ecommerce: "Prioritize e-commerce concierge, recommendations, cart recovery, order automation, and revenue-intelligence archetypes.",
  saas: "Prioritize SaaS onboarding, product activation, adoption analytics, and churn prevention archetypes.",
  education: "Prioritize AI coaching, learning-path adaptation, mastery tracking, and instructor analytics archetypes.",
  healthcare: "Prioritize triage safety boundaries, booking workflows, sensitive-data handling, and clinical escalation archetypes.",
  fintech: "Prioritize onboarding/KYC support, risk controls, secure integrations, and compliance-oriented workflows.",
  ops: "Prioritize internal operations copilot, SOP automation, ticket routing, SLA monitoring, and productivity archetypes.",
  realestate: "Prioritize property search & matching, virtual tours, client relationship management, transaction workflow automation, and market analytics archetypes.",
  hospitality: "Prioritize reservation management, guest experience personalization, dynamic pricing, service request automation, and loyalty program integration archetypes.",
  manufacturing: "Prioritize production planning, supply chain visibility, quality control automation, equipment maintenance prediction, and inventory optimization archetypes.",
  retail: "Prioritize inventory management, customer service chatbots, point-of-sale integration, loyalty programs, and omnichannel experience archetypes.",
  logistics: "Prioritize route optimization, shipment tracking, warehouse management, delivery scheduling, and fleet management archetypes.",
  legal: "Prioritize document automation, case management, legal research assistance, client intake workflows, and billing automation archetypes.",
  consulting: "Prioritize project scoping, knowledge management, client reporting automation, resource allocation, and engagement tracking archetypes.",
  nonprofit: "Prioritize donor management, volunteer coordination, grant application assistance, impact reporting, and fundraising campaign automation archetypes.",
  agriculture: "Prioritize crop monitoring, weather forecasting integration, supply planning, equipment tracking, and yield optimization archetypes.",
  construction: "Prioritize project scheduling, equipment tracking, safety compliance, bid management, and progress reporting archetypes.",
  automotive: "Prioritize service appointment booking, inventory management, parts ordering, customer communication, and warranty tracking archetypes.",
  media: "Prioritize content management, audience analytics, ad campaign optimization, distribution scheduling, and collaboration workflows archetypes.",
  telecom: "Prioritize network monitoring, customer support automation, billing management, service provisioning, and outage response archetypes.",
  energy: "Prioritize consumption monitoring, grid management, demand forecasting, billing automation, and sustainability reporting archetypes.",
  insurance: "Prioritize claims processing, policy management, risk assessment, customer onboarding, and fraud detection archetypes.",
  travel: "Prioritize booking automation, itinerary management, destination recommendations, loyalty programs, and customer support archetypes.",
  foodservice: "Prioritize order management, menu planning, inventory tracking, delivery coordination, and customer feedback integration archetypes.",
  wellness: "Prioritize appointment scheduling, wellness tracking, personalized recommendations, community engagement, and progress monitoring archetypes.",
  sports: "Prioritize event scheduling, athlete performance tracking, fan engagement, ticket sales, and training program management archetypes.",
  entertainment: "Prioritize event management, ticket sales, audience engagement, content scheduling, and revenue optimization archetypes.",
  fashion: "Prioritize trend forecasting, inventory management, personalized styling, size recommendation, and collection planning archetypes.",
  beauty: "Prioritize appointment booking, product recommendations, customer loyalty, service customization, and inventory management archetypes.",
}

const AUTH_BOOTSTRAP_TIMEOUT_MS = 5000

function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [userIdForKV, setUserIdForKV] = useState<string>("temp")
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [result, setResult] = useState<MarketingResult | null>(null)
  const [currentDescription, setCurrentDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [hasShownWelcomeThisSession, setHasShownWelcomeThisSession] = useState(false)
  const [showExpandedWelcome, setShowExpandedWelcome] = useState(false)
  const [notchDismissedAt, setNotchDismissedAt] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 0
    }
    const stored = window.localStorage.getItem("notch-dismissed-at")
    return stored ? parseInt(stored, 10) : 0
  })
  const [savedStrategies, setSavedStrategies] = useSafeKV<SavedStrategy[]>(
    `saved-strategies-${userIdForKV}`,
    []
  )
  const [promptMemory, setPromptMemory] = useSafeKV<PromptMemoryItem[]>(
    `user-prompt-memory-${userIdForKV}`,
    []
  )
  const [workflowRuns, setWorkflowRuns] = useSafeKV<StrategyWorkflowRun[]>(
    `strategy-workflow-runs-${userIdForKV}`,
    []
  )
  const [monthlyStrategySpendCents, setMonthlyStrategySpendCents] = useSafeKV<number>(
    `${getCurrentMonthKey("strategy-spend")}-${userIdForKV}`,
    0
  )
  const [monthlyExportCount, setMonthlyExportCount] = useSafeKV<number>(
    `${getCurrentMonthKey("strategy-exports")}-${userIdForKV}`,
    0
  )
  const [timelineSearch, setTimelineSearch] = useState("")
  const [timelinePlanFilter, setTimelinePlanFilter] = useState<"all" | "basic" | "pro">("all")
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<"all" | "pass" | "fail">("all")
  const [selectedTimelineCompare, setSelectedTimelineCompare] = useState<string[]>([])
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showTemplatesBrowser, setShowTemplatesBrowser] = useState(false)
  const [conceptMode, setConceptMode] = useState<ConceptMode>("auto")
  const [showPromptSuggestions, setShowPromptSuggestions] = useState(false)
  const [openConceptSelector, setOpenConceptSelector] = useState(false)
  const [brandTheme, setBrandTheme] = useState<BrandThemeName>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_BRAND_THEME
    }

    const storedTheme = window.localStorage.getItem(BRAND_THEME_STORAGE_KEY)
    return isBrandThemeName(storedTheme) ? storedTheme : DEFAULT_BRAND_THEME
  })
  const [activeTab, setActiveTab] = useState("generate")
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showLandingPage, setShowLandingPage] = useState(false)
  const [adminAllStrategies, setAdminAllStrategies] = useState<SavedStrategy[]>([])
  const resultsRef = useRef<HTMLDivElement>(null)

  // When admin logs in, load all users' strategies for a global view
  useEffect(() => {
    if (user?.role !== "admin") {
      setAdminAllStrategies([])
      return
    }
    let cancelled = false
    const loadAdminData = async () => {
      try {
        const allStrategyGroups = await adminService.getAllStrategies()
        if (!cancelled) {
          const merged = allStrategyGroups.flatMap(g => g.strategies.map(s => ({
            ...s,
            // tag owner email for admin visibility
            _ownerEmail: g.user.email,
            _ownerName: g.user.fullName,
          })))
          setAdminAllStrategies(merged as SavedStrategy[])
        }
      } catch (e) {
        console.error("Admin data aggregation failed:", e)
      }
    }
    loadAdminData()
    return () => { cancelled = true }
  }, [user?.role, user?.id])

  useEffect(() => {
    let cancelled = false

    const withTimeout = <T,>(operation: Promise<T>, label: string): Promise<T> =>
      Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`${label} timed out after ${AUTH_BOOTSTRAP_TIMEOUT_MS}ms`)), AUTH_BOOTSTRAP_TIMEOUT_MS)
        }),
      ])

    const checkAuth = async () => {
      try {
        // Restore secrets from KV first (survives Codespaces URL rotation)
        await hydrateSecretsFromKV()

        await withTimeout(authService.initializeMasterAdmin(), "Auth bootstrap")
        const currentUser = await withTimeout(authService.getCurrentUser(), "Current user lookup")

        if (cancelled) {
          return
        }

        setUser(currentUser)
        if (currentUser) {
          setUserIdForKV(currentUser.id)
          setHasShownWelcomeThisSession((alreadyShown) => {
            if (!alreadyShown) {
              setShowExpandedWelcome(true)
              return true
            }
            return alreadyShown
          })
        }
      } catch (authError) {
        console.error("Auth bootstrap failed:", authError)

        void logError(
          "Auth bootstrap failed",
          authError instanceof Error ? authError : new Error(String(authError)),
          "authentication",
          "medium",
          user?.id,
          {
            timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS,
          }
        )

        if (!cancelled) {
          setUser(null)
          setUserIdForKV("temp")
        }
      } finally {
        if (!cancelled) {
          setIsCheckingAuth(false)
        }
      }
    }

    void checkAuth()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    loadBudgetLimits()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.brandTheme = brandTheme
    window.localStorage.setItem(BRAND_THEME_STORAGE_KEY, brandTheme)
  }, [brandTheme])

  // Dismiss welcome banner after 15 seconds on initial display only
  useEffect(() => {
    if (showExpandedWelcome && hasShownWelcomeThisSession) {
      const timer = setTimeout(() => {
        setShowExpandedWelcome(false)
      }, 15000)

      return () => clearTimeout(timer)
    }
  }, [])

  const isValidInput = description.trim().length >= 10
  const charCount = description.length
  const showCharCounter = charCount >= 900
  const entitlements = user ? getFeatureEntitlements(user) : null
  const canAccessNGOSaaS = user?.role === "admin" || !!entitlements?.canAccessNGOSaaS
  const strategyPlan = entitlements?.isPaidPlan ? (entitlements.isTeam ? "team" : "pro") : "basic"
  const strategyPlanConfig = getStrategyPlanConfig(strategyPlan)
  const exportPlanConfig = getExportPlanConfig(strategyPlan)
  const spendProgress = Math.min(100, Math.round(((monthlyStrategySpendCents || 0) / strategyPlanConfig.monthlyBudgetCents) * 100))
  const exportProgress = Math.min(100, Math.round(((monthlyExportCount || 0) / exportPlanConfig.monthlyExports) * 100))
  const savedProgress = Math.min(100, Math.round((((savedStrategies || []).length || 0) / strategyPlanConfig.maxSavedStrategies) * 100))

  const quickPromptSuggestions = useMemo(() => {
    const current = description.trim().toLowerCase()
    return (promptMemory || [])
      .filter((item) => item.prompt.trim().length >= 10)
      .filter((item) => item.prompt.trim().toLowerCase() !== current)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return b.lastUsedAt - a.lastUsedAt
      })
      .slice(0, 5)
  }, [promptMemory, description])

  const rememberPrompt = (promptText: string, mode: ConceptMode) => {
    const normalized = promptText.trim()
    if (normalized.length < 10) return

    setPromptMemory((current) => {
      const existing = current || []
      const now = Date.now()
      const existingIndex = existing.findIndex(
        (item) => item.prompt.trim().toLowerCase() === normalized.toLowerCase()
      )

      if (existingIndex >= 0) {
        const updated = [...existing]
        const previous = updated[existingIndex]
        updated[existingIndex] = {
          ...previous,
          conceptMode: mode,
          count: previous.count + 1,
          lastUsedAt: now,
        }

        return updated
          .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count
            return b.lastUsedAt - a.lastUsedAt
          })
          .slice(0, 50)
      }

      return [
        { prompt: normalized, conceptMode: mode, count: 1, lastUsedAt: now },
        ...existing,
      ]
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count
          return b.lastUsedAt - a.lastUsedAt
        })
        .slice(0, 50)
    })
  }

  const buildMemoryContext = () => {
    const recentStrategies = (savedStrategies || []).slice(0, 3)
    const memoryLines: string[] = []

    if (recentStrategies.length > 0) {
      memoryLines.push("Recent strategy history:")
      recentStrategies.forEach((strategy, index) => {
        memoryLines.push(`${index + 1}. ${strategy.name}: ${strategy.description.slice(0, 140)}`)
      })
    }

    const recentPrompts = (promptMemory || []).slice(0, 3)
    if (recentPrompts.length > 0) {
      memoryLines.push("Recent prompt patterns:")
      recentPrompts.forEach((item, index) => {
        memoryLines.push(`${index + 1}. (${item.conceptMode}) ${item.prompt.slice(0, 120)}`)
      })
    }

    if (memoryLines.length === 0) {
      return ""
    }

    return `\n\nUser memory context (use to avoid repetition and improve continuity):\n${memoryLines.join("\n")}`
  }

  const runWithModelFallback = async (prompt: string, parseJson = false) => {
    // Try Sentinel pipeline first (Gemini + Copilot + Brain)
    const sentinelReady = isNeonConfigured() || isGeminiConfigured()
    if (sentinelReady) {
      try {
        const pipelineResult = await sentinelQuery(prompt, {
          module: "strategy",
          useConsensus: true,
          sparkFallback: async () => {
            if (typeof spark !== "undefined" && typeof spark.llm === "function") {
              const preferredModel = strategyPlan === "pro" ? "gpt-4o" : "gpt-4o-mini"
              return await spark.llm(prompt, preferredModel, false) as string
            }
            throw new Error("Spark fallback unavailable")
          },
        })
        return { response: pipelineResult.response, modelUsed: pipelineResult.model || "sentinel-pipeline" }
      } catch {
        // Fall through to Spark-only path
      }
    }

    if (typeof spark === "undefined" || typeof spark.llm !== "function") {
      throw new Error("Spark LLM is not available. Please refresh the page.")
    }

    const preferredModel = strategyPlan === "pro" ? "gpt-4o" : "gpt-4o-mini"

    try {
      const response = await spark.llm(prompt, preferredModel, parseJson)
      return { response, modelUsed: preferredModel }
    } catch (error) {
      if (preferredModel !== "gpt-4o") {
        const response = await spark.llm(prompt, "gpt-4o", parseJson)
        return { response, modelUsed: "gpt-4o" }
      }
      throw error
    }
  }

  const attemptGeneration = async (
    attemptNumber: number,
    memoryContext: string,
    qaFeedback?: string
  ): Promise<{ result: MarketingResult; modelUsed: string }> => {
    if (typeof spark === "undefined") {
      const error = new Error("Spark API is not available. Please refresh the page.")
      await logError("Spark API unavailable", error, "system", "critical", user?.id)
      throw error
    }

    if (typeof spark.llmPrompt === "undefined") {
      const error = new Error("Spark LLM prompt is not available.")
      await logError("Spark LLM prompt unavailable", error, "system", "critical", user?.id)
      throw error
    }

    const contextSection = conceptMode !== "auto" 
      ? `Selected Concept Mode: ${conceptMode}
Mode Instruction: ${CONCEPT_MODE_INSTRUCTION[conceptMode]}

Apply the above concept mode guidance to provide domain-specific insights.`
      : `Selected Concept Mode: Auto
Automatically select the most relevant archetypes and implementation patterns based on the topic.`

    const prompt = spark.llmPrompt`You are an elite marketing strategist and solutions architect. Based on the topic below, produce a comprehensive strategy.

Topic: ${description}

${contextSection}

${qaFeedback ? `Fix these issues from QA review:\n${qaFeedback}` : ""}
${memoryContext}

Return a JSON object with exactly these 8 string properties:
- marketingCopy: Persuasive marketing copy (1-2 short paragraphs)
- visualStrategy: Visual strategy and branding recommendations (1-2 short paragraphs)
- targetAudience: Target audience analysis (1-2 short paragraphs)
- applicationWorkflow: Implementation workflow steps (1-2 short paragraphs)
- uiWorkflow: UI/UX guidance (1-2 short paragraphs)
- databaseWorkflow: Database design guidance (1-2 short paragraphs)
- mobileWorkflow: Mobile and responsive design guidance (1-2 short paragraphs)
- implementationChecklist: Sprint-ready tasks (1-2 short paragraphs)

Keep each value concise. Do NOT use newlines inside string values. Return ONLY valid JSON.`

    if (typeof spark.llm !== "function") {
      const error = new Error("Spark LLM function is not available.")
      await logError("Spark LLM function unavailable", error, "system", "critical", user?.id)
      throw error
    }

    const { response, modelUsed } = await runWithModelFallback(prompt as string, false)
    
    if (!response) {
      const error = new Error("Empty response from LLM")
      await logError("Empty LLM response", error, "generation", "high", user?.id, {
        attemptNumber,
        description: description.substring(0, 100),
        conceptMode,
      })
      throw error
    }

    // Handle already-parsed object responses defensively.
    if (typeof response === "object" && response !== null) {
      const parsedResult = response as unknown as MarketingResult
      
      // Validate that it has the expected shape
      if (!parsedResult.marketingCopy && !parsedResult.visualStrategy && !parsedResult.targetAudience) {
        console.warn("Object response missing expected fields, keys:", Object.keys(parsedResult))
        // Try to extract from nested structure if LLM wrapped it
        const responseObj = response as Record<string, unknown>
        const keys = Object.keys(responseObj)
        if (keys.length === 1 && typeof responseObj[keys[0]] === "object") {
          const nested = responseObj[keys[0]] as MarketingResult
          if (nested.marketingCopy || nested.visualStrategy) {
            return { result: nested, modelUsed }
          }
        }
      }
      
      return { result: parsedResult, modelUsed }
    }

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
    
    console.log(`Attempt ${attemptNumber} - Response length:`, cleanedResponse.length)
    console.log(`Attempt ${attemptNumber} - First 300 chars:`, cleanedResponse.substring(0, 300))
    console.log(`Attempt ${attemptNumber} - Last 300 chars:`, cleanedResponse.substring(Math.max(0, cleanedResponse.length - 300)))
    
    let parsedResult!: MarketingResult
    
    try {
      parsedResult = JSON.parse(cleanedResponse) as MarketingResult
    } catch (parseError) {
      console.error(`Attempt ${attemptNumber} - JSON parse failed, trying repair...`)
      
      // Attempt to repair common JSON issues
      const repairAttempts: string[] = []
      
      // Step 1: Basic cleanup
      const repaired = cleanedResponse
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : '')
      repairAttempts.push(repaired)
      
      // Step 2: Handle truncated response — close unterminated strings and braces
      if (!repaired.endsWith('}')) {
        let truncated = repaired
        // If we're inside a string value (odd number of unescaped quotes), close it
        const quoteCount = (truncated.match(/(?<!\\)"/g) || []).length
        if (quoteCount % 2 !== 0) {
          truncated += '"'
        }
        // Close any open braces
        const openBraces = (truncated.match(/{/g) || []).length
        const closeBraces = (truncated.match(/}/g) || []).length
        for (let i = 0; i < openBraces - closeBraces; i++) {
          truncated += '}'
        }
        repairAttempts.push(truncated)
      }
      
      let repairSucceeded = false
      for (const attempt of repairAttempts) {
        try {
          parsedResult = JSON.parse(attempt) as MarketingResult
          console.log(`Attempt ${attemptNumber} - JSON repair succeeded`)
          repairSucceeded = true
          break
        } catch {
          // Try next repair attempt
        }
      }
      
      if (!repairSucceeded) {
        console.error(`Attempt ${attemptNumber} - All JSON repairs failed`)
        
        await logError(
          "JSON parse error in LLM response",
          parseError instanceof Error ? parseError : new Error(String(parseError)),
          "generation",
          "high",
          user?.id,
          {
            attemptNumber,
            responseLength: cleanedResponse.length,
            firstChars: cleanedResponse.substring(0, 200),
            lastChars: cleanedResponse.substring(Math.max(0, cleanedResponse.length - 200)),
          }
        )
        
        throw parseError
      }
    }
    
    console.log(`Attempt ${attemptNumber} - Successfully parsed with keys:`, Object.keys(parsedResult))

    if (!parsedResult || typeof parsedResult !== 'object') {
      const error = new Error("Invalid response format - expected an object")
      await logError("Invalid LLM response format", error, "generation", "high", user?.id, {
        attemptNumber,
        responseType: typeof parsedResult,
      })
      throw error
    }

    if (!parsedResult.marketingCopy || !parsedResult.visualStrategy || !parsedResult.targetAudience) {
      const error = new Error(`Missing required fields. Got: ${Object.keys(parsedResult).join(', ')}`)
      await logError("Missing required fields in LLM response", error, "generation", "medium", user?.id, {
        attemptNumber,
        receivedFields: Object.keys(parsedResult),
      })
      throw error
    }

    const normalizedResult: MarketingResult = {
      marketingCopy: parsedResult.marketingCopy,
      visualStrategy: parsedResult.visualStrategy,
      targetAudience: parsedResult.targetAudience,
      applicationWorkflow: parsedResult.applicationWorkflow || "Application workflow guidance was not generated. Please regenerate to get implementation steps.",
      uiWorkflow: parsedResult.uiWorkflow || "UI workflow guidance was not generated. Please regenerate to get implementation steps.",
      databaseWorkflow: parsedResult.databaseWorkflow || "Database workflow guidance was not generated. Please regenerate to get implementation steps.",
      mobileWorkflow: parsedResult.mobileWorkflow || "Mobile workflow guidance was not generated. Please regenerate to get implementation steps.",
      implementationChecklist: parsedResult.implementationChecklist || "Implementation checklist was not generated. Please regenerate to get sprint-ready tasks.",
    }

    return { result: normalizedResult, modelUsed }
  }

  const runStrategyQA = async (candidate: MarketingResult): Promise<StrategyQAVerdict> => {
    if (typeof spark === "undefined" || typeof spark.llmPrompt === "undefined") {
      return { pass: true, score: 70, summary: "QA skipped — Spark not available.", issues: [] }
    }

    const qaPrompt = spark.llmPrompt`You are a strict quality gate for marketing strategy outputs.

Review the candidate strategy below and score for clarity, specificity, actionability, and consistency.
Return ONLY valid JSON with this schema:
{
  "pass": true or false,
  "score": 0-100,
  "summary": "short summary",
  "issues": ["issue 1", "issue 2"]
}

Candidate JSON:
${JSON.stringify(candidate)}`

    const { response } = await runWithModelFallback(qaPrompt as string, false)

    // Handle already-parsed object responses
    if (typeof response === "object" && response !== null) {
      return response as unknown as StrategyQAVerdict
    }

    let cleaned = response.trim()

    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "")
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "")
    }

    const firstBrace = cleaned.indexOf("{")
    const lastBrace = cleaned.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1)
    }

    try {
      const parsed = JSON.parse(cleaned) as StrategyQAVerdict
      return {
        pass: Boolean(parsed.pass),
        score: Math.max(0, Math.min(100, Number(parsed.score || 0))),
        summary: parsed.summary || "Quality review completed.",
        issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6) : [],
      }
    } catch {
      const sections = [
        candidate.marketingCopy,
        candidate.visualStrategy,
        candidate.targetAudience,
        candidate.applicationWorkflow,
        candidate.uiWorkflow,
        candidate.databaseWorkflow,
        candidate.mobileWorkflow,
        candidate.implementationChecklist,
      ]
      const populatedSections = sections.filter((section) => typeof section === "string" && section.trim().length >= 80).length
      const fallbackPass = populatedSections >= 6

      return {
        pass: fallbackPass,
        score: fallbackPass ? 72 : 40,
        summary: fallbackPass
          ? "QA parser could not validate the response, but structural checks passed."
          : "QA parser could not validate the response and structural checks found weak sections.",
        issues: fallbackPass
          ? []
          : ["Retry generation with stricter structure and clearer implementation steps."],
      }
    }
  }

  const generateMarketing = async () => {
    if (!isValidInput) {
      toast.error("Please enter at least 10 characters")
      return
    }

    setIsLoading(true)
    setLoadingProgress(0)
    setError(null)

    const memoryContext = buildMemoryContext()
    const estimatedInputTokens = estimatePromptTokens(`${description}\n${memoryContext}`)
    const estimatedOutputTokens = strategyPlan === "pro" ? 2600 : 1900
    const estimatedCostCents = estimateGenerationCostCents(estimatedInputTokens, estimatedOutputTokens, strategyPlan)
    const projectedSpend = (monthlyStrategySpendCents || 0) + estimatedCostCents

    if (projectedSpend > strategyPlanConfig.monthlyBudgetCents) {
      const budgetLabel = (strategyPlanConfig.monthlyBudgetCents / 100).toFixed(2)
      toast.error(`Monthly generation guardrail reached ($${budgetLabel}). Try shorter prompts or upgrade your plan.`)
      return
    }

    const progressInterval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 90) return prev
        return prev + 5
      })
    }, 500)

    const maxRetries = strategyPlanConfig.maxWorkflowRetries
    let lastError: Error | null = null
    let finalResult: MarketingResult | null = null
    let modelUsed = strategyPlan === "pro" ? "gpt-4o" : "gpt-4o-mini"
    const workflowSteps: StrategyWorkflowRun["steps"] = []
    let qaFeedback = ""

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          toast.info(`Retrying generation (attempt ${attempt}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }

        const generated = await attemptGeneration(attempt, memoryContext, qaFeedback)
        modelUsed = generated.modelUsed
        workflowSteps.push({
          stage: attempt === 1 ? "draft" : "repair",
          status: "info",
          message: `Generation attempt ${attempt} completed with ${modelUsed}.`,
          timestamp: Date.now(),
        })

        if (!strategyPlanConfig.enableQaLoop) {
          finalResult = generated.result
          break
        }

        const qaVerdict = await runStrategyQA(generated.result)
        workflowSteps.push({
          stage: "qa",
          status: qaVerdict.pass ? "pass" : "fail",
          message: `QA score ${qaVerdict.score}/100. ${qaVerdict.summary}`,
          timestamp: Date.now(),
        })

        if (qaVerdict.pass) {
          finalResult = generated.result
          break
        }

        qaFeedback = qaVerdict.issues.join("; ") || qaVerdict.summary

        if (attempt < maxRetries) {
          workflowSteps.push({
            stage: "repair",
            status: "info",
            message: "Applying QA feedback for the next attempt.",
            timestamp: Date.now(),
          })
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("An unexpected error occurred")
        console.error(`Attempt ${attempt} failed:`, err)

        await logError(
          `Strategy generation failed on attempt ${attempt}`,
          lastError,
          "generation",
          attempt === maxRetries ? "high" : "medium",
          user?.id,
          {
            attemptNumber: attempt,
            description: description.substring(0, 100),
            conceptMode,
            errorMessage: lastError.message,
          }
        )

        if (attempt < maxRetries) {
          const isParseError = lastError.message.includes("JSON") || 
                               lastError.message.includes("parse") || 
                               lastError.message.includes("Unexpected token")
          
          if (isParseError) {
            console.log(`Parse error detected, will retry (${maxRetries - attempt} attempts remaining)`)
          } else {
            console.log(`Non-parse error, will retry (${maxRetries - attempt} attempts remaining)`)
          }
        }
      }
    }

    if (finalResult) {
      clearInterval(progressInterval)
      setLoadingProgress(100)

      setResult(finalResult)
      rememberPrompt(description, conceptMode)
      setCurrentDescription(description)
      setMonthlyStrategySpendCents((current) => (current || 0) + estimatedCostCents)

      const run: StrategyWorkflowRun = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description,
        conceptMode,
        plan: strategyPlan,
        estimatedCostCents,
        modelUsed,
        resultSnapshot: finalResult,
        steps: [
          ...workflowSteps,
          {
            stage: "final",
            status: "pass",
            message: strategyPlanConfig.enableQaLoop
              ? "Workflow completed with QA validation."
              : "Core generation completed.",
            timestamp: Date.now(),
          },
        ],
        timestamp: Date.now(),
      }

      setWorkflowRuns((current) => [run, ...(current || [])].slice(0, strategyPlan === "pro" ? 120 : 25))

      if (strategyPlanConfig.enableQaLoop) {
        toast.success("Strategy generated and validated through QA loop.")
      } else {
        toast.success("Strategy generated successfully.")
      }

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)

      setIsLoading(false)
      setLoadingProgress(0)
      return
    }

    clearInterval(progressInterval)
    const errorMessage = lastError?.message || "Failed to generate strategy after multiple attempts"
    console.error("All attempts failed. Last error:", lastError)
    await logError(
      "Strategy generation failed after all retries",
      lastError || new Error(errorMessage),
      "generation",
      "critical",
      user?.id,
      {
        maxRetries,
        description: description.substring(0, 100),
        conceptMode,
      }
    )
    setError(errorMessage)
    toast.error(`Generation failed after ${maxRetries} attempts. Please try again.`)
    setIsLoading(false)
    setLoadingProgress(0)
  }

  const handleNewGeneration = () => {
    setDescription("")
    setResult(null)
    setCurrentDescription("")
    setError(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSaveStrategy = (name: string) => {
    if (!result || !currentDescription) return

    if ((savedStrategies || []).length >= strategyPlanConfig.maxSavedStrategies) {
      toast.error(`You've reached the ${strategyPlanConfig.maxSavedStrategies} saved strategy limit for your plan.`)
      return
    }

    try {
      const newStrategy: SavedStrategy = {
        id: Date.now().toString(),
        name: name,
        description: currentDescription,
        result: result,
        timestamp: Date.now()
      }

      setSavedStrategies((current) => [newStrategy, ...(current || [])])
      toast.success("Strategy saved successfully")
    } catch (error) {
      console.error("Failed to save strategy:", error)
      logError(
        "Failed to save strategy",
        error instanceof Error ? error : new Error(String(error)),
        "storage",
        "medium",
        user?.id
      )
      toast.error("Failed to save strategy")
    }
  }

  const handleDeleteStrategy = (id: string) => {
    setSavedStrategies((current) => (current || []).filter(s => s.id !== id))
    setSelectedForComparison((current) => current.filter(sid => sid !== id))
    toast.success("Strategy deleted")
  }

  const reserveExportQuota = () => {
    if ((monthlyExportCount || 0) >= exportPlanConfig.monthlyExports) {
      toast.error(`Monthly export quota reached (${exportPlanConfig.monthlyExports}). Upgrade for higher limits.`)
      return false
    }
    return true
  }

  const handleExportStrategyPdf = (strategy: SavedStrategy) => {
    if (!reserveExportQuota()) return

    try {
      exportStrategyAsPDF(strategy)
      setMonthlyExportCount((count) => (count || 0) + 1)
      toast.success("Strategy exported as PDF")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF. Please try again.")
    }
  }

  const handleExportStrategyWord = async (strategy: SavedStrategy) => {
    if (!exportPlanConfig.allowWordExport) {
      toast.info("Word export is available on Pro Individual.")
      return
    }

    if (!reserveExportQuota()) return

    try {
      await exportStrategyAsWord(strategy)
      setMonthlyExportCount((count) => (count || 0) + 1)
      toast.success("Strategy exported to Word successfully!")
    } catch (error) {
      console.error("Error exporting Word:", error)
      toast.error("Failed to export to Word. Please try again.")
    }
  }

  const handleRestoreWorkflowRun = (run: StrategyWorkflowRun) => {
    setDescription(run.description)
    setConceptMode(run.conceptMode)
    if (run.resultSnapshot) {
      setResult(run.resultSnapshot)
      setCurrentDescription(run.description)
    }
    setActiveTab("generate")
    toast.success("Memory checkpoint restored")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const getRunStatus = (run: StrategyWorkflowRun): "pass" | "fail" => {
    const hasQaFail = run.steps.some((step) => step.stage === "qa" && step.status === "fail")
    if (hasQaFail) return "fail"
    return "pass"
  }

  const filteredWorkflowRuns = useMemo(() => {
    const search = timelineSearch.trim().toLowerCase()
    return (workflowRuns || []).filter((run) => {
      if (timelinePlanFilter !== "all" && run.plan !== timelinePlanFilter) {
        return false
      }

      const status = getRunStatus(run)
      if (timelineStatusFilter !== "all" && status !== timelineStatusFilter) {
        return false
      }

      if (search.length === 0) {
        return true
      }

      return (
        run.description.toLowerCase().includes(search) ||
        run.conceptMode.toLowerCase().includes(search) ||
        run.modelUsed.toLowerCase().includes(search)
      )
    })
  }, [workflowRuns, timelineSearch, timelinePlanFilter, timelineStatusFilter])

  useEffect(() => {
    if (activeTab === "ngo-saas" && !canAccessNGOSaaS) {
      setActiveTab("generate")
      toast.error("NGO-SAAS is available for Enterprise plan and Super Admin only.")
    }
  }, [activeTab, canAccessNGOSaaS])

  const comparedRuns = useMemo(() => {
    return (workflowRuns || []).filter((run) => selectedTimelineCompare.includes(run.id)).slice(0, 2)
  }, [workflowRuns, selectedTimelineCompare])

  const handleToggleTimelineCompare = (id: string) => {
    setSelectedTimelineCompare((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id)
      }

      if (current.length >= 2) {
        toast.error("Select up to 2 checkpoints to compare")
        return current
      }

      return [...current, id]
    })
  }

  const handleUpgradeToProQuick = async () => {
    if (!user || entitlements?.isPaidPlan) return

    const result = await requestUpgrade(user.id, "pro")
    if (!result.success) {
      toast.error(result.error || "Failed to submit upgrade request")
      return
    }

    toast.success("Pro upgrade request submitted! Admin will review and approve your upgrade.")
  }

  const handleViewStrategy = (strategy: SavedStrategy) => {
    setDescription(strategy.description)
    setResult(strategy.result)
    setCurrentDescription(strategy.description)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleToggleCompare = (id: string) => {
    setSelectedForComparison((current) => {
      if (current.includes(id)) {
        return current.filter(sid => sid !== id)
      } else if (current.length < 3) {
        return [...current, id]
      } else {
        toast.error("You can compare up to 3 strategies at a time")
        return current
      }
    })
  }

  const handleOpenComparison = () => {
    if (selectedForComparison.length === 0) {
      toast.error("Please select at least one strategy to compare")
      return
    }
    setShowComparison(true)
  }

  const comparisonStrategies = (savedStrategies || []).filter(s => 
    selectedForComparison.includes(s.id)
  )

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && isValidInput) {
      e.preventDefault()
      generateMarketing()
    }
  }

  const handleAuthSuccess = (authUser: UserProfile) => {
    setUser(authUser)
    setUserIdForKV(authUser.id)
    setHasShownWelcomeThisSession((alreadyShown) => {
      if (!alreadyShown) {
        setShowExpandedWelcome(true)
        return true
      }
      return alreadyShown
    })
  }

  const handleLogout = () => {
    setUser(null)
    setDescription("")
    setResult(null)
    setCurrentDescription("")
    setError(null)
  }

  const handleProfileUpdate = (updatedUser: UserProfile) => {
    setUser(updatedUser)
  }

  const smartNextAction = useMemo(() => {
    if (!result) return null

    if ((savedStrategies || []).length === 0) {
      return {
        title: "Save this strategy as your baseline",
        description: "Lock this output before iterating so you can compare quality over time.",
        actionLabel: "Save Strategy",
        action: () => setShowSaveDialog(true),
      }
    }

    if (strategyPlan === "basic") {
      return {
        title: "Run a quick integrity review",
        description: "Validate quality signals and references before publishing or submission.",
        actionLabel: "Open Review",
        action: () => setActiveTab("plagiarism"),
      }
    }

    return {
      title: "Create execution assets from this strategy",
      description: "Use Ideas to generate business canvas and pitch deck from this strategy direction.",
      actionLabel: "Open Ideas",
      action: () => setActiveTab("ideas"),
    }
  }, [result, savedStrategies, strategyPlan])

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center">
        <div className="text-center">
          <img src={faviconImg} alt="Techpigeon" className="w-12 h-12 mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <LandingPage
        onLogin={() => {}}
        onSignup={() => {}}
        onAuthSuccess={handleAuthSuccess}
      />
    )
  }

  if (showLandingPage) {
    return (
      <LandingPage
        onLogin={() => {}}
        onSignup={() => {}}
        onAuthSuccess={handleAuthSuccess}
        user={user}
        onBackToDashboard={() => setShowLandingPage(false)}
        onNavigate={(tab) => { setActiveTab(tab); setShowLandingPage(false) }}
      />
    )
  }

  return (
    <>
      <TopNotchBanner 
        user={user} 
        isVisible={!showExpandedWelcome && hasShownWelcomeThisSession}
        notchDismissedAt={notchDismissedAt}
        onDismiss={() => {
          const now = Date.now()
          setNotchDismissedAt(now)
          window.localStorage.setItem("notch-dismissed-at", now.toString())
        }}
        onExpand={() => {
          setShowExpandedWelcome(true)
          window.scrollTo({ top: 0, behavior: "smooth" })
        }}
      />
      <SaveStrategyDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSaveStrategy}
      />
      <StrategyTemplatesBrowser
        open={showTemplatesBrowser}
        onOpenChange={setShowTemplatesBrowser}
        onSelectTemplate={(description, conceptMode) => {
          setDescription(description)
          setConceptMode(conceptMode)
          toast.success("Template applied! Customize the prompt and generate your strategy.")
        }}
      />
      <AnimatePresence>
        {showComparison && (
          <ComparisonView
            strategies={comparisonStrategies}
            onClose={() => setShowComparison(false)}
          />
        )}
      </AnimatePresence>
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background relative overflow-hidden font-sans pb-24 md:pb-0">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, var(--brand-glow-primary) 0%, transparent 50%), radial-gradient(circle at 70% 80%, var(--brand-glow-secondary) 0%, transparent 50%)",
          }}
        />
        
        <div className="relative max-w-6xl mx-auto px-6 md:px-8 py-12 md:py-16">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <div className="flex items-center justify-between mb-4 gap-2">
              <button
                onClick={() => setShowLandingPage(true)}
                className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <img src={faviconImg} alt="Techpigeon" className="w-8 h-8 md:w-10 md:h-10 shrink-0 object-contain" />
                <h1 className="text-xl sm:text-2xl md:text-4xl font-bold tracking-tight text-foreground truncate">
                  <span className="hidden sm:inline">Sentinel AI Suite</span>
                  <span className="sm:hidden">Sentinel AI</span>
                </h1>
              </button>
              <div className="flex items-center gap-2">
                {entitlements && !entitlements.isPaidPlan && user.role !== "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hidden sm:flex"
                    onClick={() => setShowUpgradeModal(true)}
                  >
                    <Lightning size={16} weight="fill" />
                    Upgrade
                  </Button>
                )}
                <UserMenu
                  user={user}
                  brandTheme={brandTheme}
                  onBrandThemeChange={setBrandTheme}
                  onLogout={handleLogout}
                  onProfileUpdate={handleProfileUpdate}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl leading-relaxed text-center md:text-left">
              Enterprise-grade AI platform for intelligent strategies, knowledge management, and multi-tenant business insights
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 text-center md:text-left flex items-center justify-center md:justify-start gap-1.5">
              <img src={faviconImg} alt="" className="w-4 h-4 inline-block" />
              Powered by <a href="https://www.techpigeon.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Techpigeon</a>
            </p>
          </motion.header>

          <AnimatePresence>
            {showExpandedWelcome && <WelcomeBanner user={user} />}
          </AnimatePresence>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`hidden md:grid w-full max-w-5xl mx-auto mb-8 ${user.role === "admin" ? (canAccessNGOSaaS ? "grid-cols-9" : "grid-cols-8") : (canAccessNGOSaaS ? "grid-cols-7" : "grid-cols-6")}`}>
              <TabsTrigger value="generate" className="gap-2 text-sm">
                <Lightbulb size={18} weight="bold" />
                <span>Strategy</span>
              </TabsTrigger>
              <TabsTrigger value="ideas" className="gap-2 text-sm">
                <Sparkle size={18} weight="bold" />
                <span>Ideas</span>
              </TabsTrigger>
              <TabsTrigger value="plagiarism" className="gap-2 text-sm">
                {entitlements?.canAccessReview || user.role === "admin" ? (
                  <MagnifyingGlass size={18} weight="bold" />
                ) : (
                  <LockSimple size={18} weight="bold" className="text-muted-foreground" />
                )}
                <span>Review</span>
              </TabsTrigger>
              <TabsTrigger value="dashboard" className="gap-2 text-sm">
                <ChartBar size={18} weight="bold" />
                <span>Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="saved" className="gap-2 text-sm">
                <FolderOpen size={18} weight="bold" />
                <span>Saved ({savedStrategies?.length || 0})</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-2 text-sm">
                <ClockCounterClockwise size={18} weight="bold" />
                <span>Timeline</span>
              </TabsTrigger>
              {user.role === "admin" && (
                <TabsTrigger value="sentinel-brain" className="gap-2 text-sm">
                  <Brain size={18} weight="bold" />
                  <span>Sentinel Brain</span>
                </TabsTrigger>
              )}
              {canAccessNGOSaaS && (
                <TabsTrigger value="ngo-saas" className="gap-2 text-sm">
                  <Target size={18} weight="bold" />
                  <span>NGO-SAAS</span>
                </TabsTrigger>
              )}
              {user.role === "admin" && (
                <TabsTrigger value="admin" className="gap-2 text-sm">
                  <ShieldCheck size={18} weight="bold" />
                  <span>Admin</span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="generate" className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 p-6 md:p-8"
              >
                <label htmlFor="product-description" className="block text-sm font-semibold text-foreground mb-3 flex items-center justify-between">
                  <span>Describe your topic, product, or service</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-xs h-7"
                    onClick={() => setShowTemplatesBrowser(true)}
                  >
                    <BookOpen size={14} weight="bold" />
                    Browse Templates
                  </Button>
                </label>
                <div className="relative mb-4">
                  <Textarea
                    id="product-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={handleKeyPress}
                    onFocus={() => setShowPromptSuggestions(true)}
                    onBlur={() => {
                      setTimeout(() => {
                        setShowPromptSuggestions(false)
                      }, 150)
                    }}
                    placeholder="e.g., A sustainable fashion brand for eco-conscious millennials, an AI-powered productivity app for remote teams, a local coffee shop with artisan roasts..."
                    className="min-h-32 resize-none text-base leading-relaxed focus:ring-2 focus:ring-accent transition-all"
                    maxLength={1000}
                  />

                  {showPromptSuggestions && quickPromptSuggestions.length > 0 && (
                    <div className="absolute z-20 w-full mt-2 bg-card border border-border/70 rounded-lg shadow-lg p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Quick adopt from your previous prompts</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {quickPromptSuggestions.map((item) => (
                          <button
                            key={item.prompt}
                            type="button"
                            onClick={() => {
                              setDescription(item.prompt)
                              setConceptMode(item.conceptMode)
                            }}
                            className="w-full text-left px-3 py-2 rounded-md border border-border/50 hover:bg-secondary/40 transition-colors"
                          >
                            <div className="text-sm text-foreground line-clamp-2">{item.prompt}</div>
                            <div className="text-[11px] text-muted-foreground mt-1">
                              Mode: {item.conceptMode} • Used {item.count} {item.count === 1 ? "time" : "times"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <label htmlFor="concept-mode" className="block text-sm font-semibold text-foreground mb-2">
                    Concept Mode
                  </label>
                  <Popover open={openConceptSelector} onOpenChange={setOpenConceptSelector}>
                    <PopoverTrigger asChild>
                      <Button
                        id="concept-mode"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openConceptSelector}
                        className="w-full justify-between font-normal"
                      >
                        {conceptMode === "auto" && "🎯 Auto (Recommended)"}
                        {conceptMode === "saas" && "SaaS Onboarding & Activation"}
                        {conceptMode === "ecommerce" && "E-commerce Concierge"}
                        {conceptMode === "telecom" && "Telecom & Network Services"}
                        {conceptMode === "media" && "Media & Content Management"}
                        {conceptMode === "sales" && "Sales Agent & Funnel"}
                        {conceptMode === "ops" && "Internal Ops Copilot"}
                        {conceptMode === "consulting" && "Consulting & Advisory"}
                        {conceptMode === "legal" && "Legal Services"}
                        {conceptMode === "fintech" && "Fintech Onboarding & Risk"}
                        {conceptMode === "insurance" && "Insurance & Claims"}
                        {conceptMode === "healthcare" && "Healthcare Triage Assistant"}
                        {conceptMode === "wellness" && "Wellness & Fitness"}
                        {conceptMode === "education" && "Education Coach"}
                        {conceptMode === "retail" && "Retail Management"}
                        {conceptMode === "fashion" && "Fashion & Apparel"}
                        {conceptMode === "beauty" && "Beauty & Cosmetics"}
                        {conceptMode === "hospitality" && "Hospitality & Hotels"}
                        {conceptMode === "travel" && "Travel & Tourism"}
                        {conceptMode === "foodservice" && "Food Service & Restaurants"}
                        {conceptMode === "realestate" && "Real Estate Management"}
                        {conceptMode === "construction" && "Construction & Project Management"}
                        {conceptMode === "manufacturing" && "Manufacturing & Production"}
                        {conceptMode === "logistics" && "Logistics & Supply Chain"}
                        {conceptMode === "energy" && "Energy & Utilities"}
                        {conceptMode === "agriculture" && "Agriculture & Farming"}
                        {conceptMode === "automotive" && "Automotive Services"}
                        {conceptMode === "entertainment" && "Entertainment & Events"}
                        {conceptMode === "sports" && "Sports & Athletics"}
                        {conceptMode === "nonprofit" && "Non-Profit Organizations"}
                        <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search industry vertical..." />
                        <CommandList>
                          <CommandEmpty>No industry vertical found.</CommandEmpty>
                          
                          <CommandGroup heading="Recommended">
                            <CommandItem
                              value="auto"
                              onSelect={() => {
                                setConceptMode("auto")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "auto" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              🎯 Auto (Recommended)
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Technology & Digital">
                            <CommandItem
                              value="saas onboarding activation"
                              onSelect={() => {
                                setConceptMode("saas")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "saas" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              SaaS Onboarding & Activation
                            </CommandItem>
                            <CommandItem
                              value="ecommerce concierge"
                              onSelect={() => {
                                setConceptMode("ecommerce")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "ecommerce" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              E-commerce Concierge
                            </CommandItem>
                            <CommandItem
                              value="telecom network services"
                              onSelect={() => {
                                setConceptMode("telecom")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "telecom" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Telecom & Network Services
                            </CommandItem>
                            <CommandItem
                              value="media content management"
                              onSelect={() => {
                                setConceptMode("media")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "media" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Media & Content Management
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Business Services">
                            <CommandItem
                              value="sales agent funnel"
                              onSelect={() => {
                                setConceptMode("sales")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "sales" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Sales Agent & Funnel
                            </CommandItem>
                            <CommandItem
                              value="ops internal copilot"
                              onSelect={() => {
                                setConceptMode("ops")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "ops" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Internal Ops Copilot
                            </CommandItem>
                            <CommandItem
                              value="consulting advisory"
                              onSelect={() => {
                                setConceptMode("consulting")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "consulting" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Consulting & Advisory
                            </CommandItem>
                            <CommandItem
                              value="legal services"
                              onSelect={() => {
                                setConceptMode("legal")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "legal" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Legal Services
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Finance & Banking">
                            <CommandItem
                              value="fintech onboarding risk"
                              onSelect={() => {
                                setConceptMode("fintech")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "fintech" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Fintech Onboarding & Risk
                            </CommandItem>
                            <CommandItem
                              value="insurance claims"
                              onSelect={() => {
                                setConceptMode("insurance")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "insurance" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Insurance & Claims
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Healthcare & Wellness">
                            <CommandItem
                              value="healthcare triage assistant"
                              onSelect={() => {
                                setConceptMode("healthcare")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "healthcare" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Healthcare Triage Assistant
                            </CommandItem>
                            <CommandItem
                              value="wellness fitness"
                              onSelect={() => {
                                setConceptMode("wellness")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "wellness" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Wellness & Fitness
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Education & Training">
                            <CommandItem
                              value="education coach"
                              onSelect={() => {
                                setConceptMode("education")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "education" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Education Coach
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Retail & Commerce">
                            <CommandItem
                              value="retail management"
                              onSelect={() => {
                                setConceptMode("retail")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "retail" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Retail Management
                            </CommandItem>
                            <CommandItem
                              value="fashion apparel"
                              onSelect={() => {
                                setConceptMode("fashion")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "fashion" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Fashion & Apparel
                            </CommandItem>
                            <CommandItem
                              value="beauty cosmetics"
                              onSelect={() => {
                                setConceptMode("beauty")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "beauty" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Beauty & Cosmetics
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Hospitality & Travel">
                            <CommandItem
                              value="hospitality hotels"
                              onSelect={() => {
                                setConceptMode("hospitality")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "hospitality" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Hospitality & Hotels
                            </CommandItem>
                            <CommandItem
                              value="travel tourism"
                              onSelect={() => {
                                setConceptMode("travel")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "travel" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Travel & Tourism
                            </CommandItem>
                            <CommandItem
                              value="foodservice restaurants"
                              onSelect={() => {
                                setConceptMode("foodservice")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "foodservice" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Food Service & Restaurants
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Real Estate & Construction">
                            <CommandItem
                              value="realestate management"
                              onSelect={() => {
                                setConceptMode("realestate")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "realestate" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Real Estate Management
                            </CommandItem>
                            <CommandItem
                              value="construction project management"
                              onSelect={() => {
                                setConceptMode("construction")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "construction" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Construction & Project Management
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Industry & Manufacturing">
                            <CommandItem
                              value="manufacturing production"
                              onSelect={() => {
                                setConceptMode("manufacturing")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "manufacturing" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Manufacturing & Production
                            </CommandItem>
                            <CommandItem
                              value="logistics supply chain"
                              onSelect={() => {
                                setConceptMode("logistics")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "logistics" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Logistics & Supply Chain
                            </CommandItem>
                            <CommandItem
                              value="energy utilities"
                              onSelect={() => {
                                setConceptMode("energy")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "energy" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Energy & Utilities
                            </CommandItem>
                            <CommandItem
                              value="agriculture farming"
                              onSelect={() => {
                                setConceptMode("agriculture")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "agriculture" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Agriculture & Farming
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Transportation & Automotive">
                            <CommandItem
                              value="automotive services"
                              onSelect={() => {
                                setConceptMode("automotive")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "automotive" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Automotive Services
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Entertainment & Sports">
                            <CommandItem
                              value="entertainment events"
                              onSelect={() => {
                                setConceptMode("entertainment")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "entertainment" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Entertainment & Events
                            </CommandItem>
                            <CommandItem
                              value="sports athletics"
                              onSelect={() => {
                                setConceptMode("sports")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "sports" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Sports & Athletics
                            </CommandItem>
                          </CommandGroup>
                          
                          <CommandGroup heading="Non-Profit & Social">
                            <CommandItem
                              value="nonprofit organizations"
                              onSelect={() => {
                                setConceptMode("nonprofit")
                                setOpenConceptSelector(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  conceptMode === "nonprofit" ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Non-Profit Organizations
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground mt-2">
                    Choose a domain lens for strategy depth, or keep Auto to let AI select the best archetypes.
                  </p>
                </div>

                <div className="mb-4 rounded-lg border border-border/60 bg-secondary/20 p-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-semibold text-foreground">
                      Plan: {strategyPlan === "pro" ? "Pro Individual" : "Free Basic"}
                    </span>
                    <span className="text-muted-foreground">
                      Workflow: {strategyPlanConfig.enableQaLoop ? "Orchestrated + QA loops" : "Core generation"}
                    </span>
                    <span className="text-muted-foreground">
                      Monthly spend guardrail: ${(strategyPlanConfig.monthlyBudgetCents / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">
                      Current estimated spend: ${((monthlyStrategySpendCents || 0) / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">
                      Exports this month: {monthlyExportCount || 0}/{exportPlanConfig.monthlyExports}
                    </span>
                    <span className="text-muted-foreground">
                      Memory checkpoints: {(workflowRuns || []).length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Generation budget</span>
                        <span>{spendProgress}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className={`h-full ${spendProgress >= 85 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${spendProgress}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Monthly exports</span>
                        <span>{exportProgress}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className={`h-full ${exportProgress >= 85 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${exportProgress}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Saved strategy capacity</span>
                        <span>{savedProgress}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className={`h-full ${savedProgress >= 85 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${savedProgress}%` }} />
                      </div>
                    </div>
                  </div>
                  {strategyPlan === "basic" && (
                    <div className="mt-3 rounded border border-primary/30 bg-primary/5 p-2.5 flex items-center justify-between gap-2">
                      <p className="text-xs text-foreground">
                        Upgrade to Pro Individual for full QA loops, higher quotas, advanced review filters, and Word exports.
                      </p>
                      <Button size="sm" className="shrink-0" onClick={handleUpgradeToProQuick}>
                        Upgrade
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {showCharCounter && (
                      <span className={charCount >= 1000 ? "text-destructive font-medium" : ""}>
                        {charCount}/1000
                      </span>
                    )}
                    {isValidInput && (
                      <span className="text-xs opacity-70">
                        Press ⌘+Enter to generate
                      </span>
                    )}
                  </div>
                  
                  <Button
                    onClick={generateMarketing}
                    disabled={!isValidInput || isLoading}
                    size="lg"
                    className="gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary hover:shadow-lg transition-all"
                  >
                    {isLoading ? (
                      <>Generating...</>
                    ) : (
                      <>
                        <Lightbulb weight="duotone" size={20} />
                        Generate Strategy
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center"
                >
                  <p className="text-destructive font-medium mb-3">{error}</p>
                  <Button onClick={generateMarketing} variant="outline" size="sm">
                    Try Again
                  </Button>
                </motion.div>
              )}

              <div ref={resultsRef}>
                {isLoading && <LoadingState progress={loadingProgress} />}
                
                {!isLoading && result && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-foreground">Your Marketing Strategy</h2>
                      <div className="flex items-center gap-2">
                        <Button 
                          onClick={() => setShowSaveDialog(true)} 
                          variant="default" 
                          size="sm" 
                          className="gap-2"
                        >
                          <FloppyDisk weight="bold" size={16} />
                          Save Strategy
                        </Button>
                        <Button 
                          onClick={handleNewGeneration} 
                          variant="outline" 
                          size="sm" 
                          className="gap-2"
                        >
                          <ArrowClockwise weight="bold" size={16} />
                          New Strategy
                        </Button>
                      </div>
                    </div>

                    {smartNextAction && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">Smart Next Action: {smartNextAction.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{smartNextAction.description}</p>
                        </div>
                        <Button size="sm" onClick={smartNextAction.action}>
                          {smartNextAction.actionLabel}
                        </Button>
                      </motion.div>
                    )}

                    {(workflowRuns || []).length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-card/70 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">Memory Timeline Checkpoints</h3>
                          <p className="text-xs text-muted-foreground">Latest {(workflowRuns || []).slice(0, 5).length} shown</p>
                        </div>
                        <div className="space-y-2">
                          {(workflowRuns || []).slice(0, 5).map((run) => (
                            <div key={run.id} className="rounded-lg border border-border/50 p-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{run.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(run.timestamp).toLocaleString()} • {run.plan.toUpperCase()} • {run.steps.length} steps • ${(
                                    run.estimatedCostCents / 100
                                  ).toFixed(2)} est.
                                </p>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => handleRestoreWorkflowRun(run)}>
                                Restore
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <ResultCard
                      title="Marketing Copy"
                      icon={<ChatsCircle size={24} weight="duotone" />}
                      content={result.marketingCopy}
                      delay={0}
                    />
                    
                    <ResultCard
                      title="Visual Strategy"
                      icon={<Palette size={24} weight="duotone" />}
                      content={result.visualStrategy}
                      delay={0.1}
                    />
                    
                    <ResultCard
                      title="Target Audience"
                      icon={<Target size={24} weight="duotone" />}
                      content={result.targetAudience}
                      delay={0.2}
                    />

                    <div className="pt-2">
                      <h3 className="text-xl font-semibold text-foreground mb-4">Implementation Workflows</h3>
                      <div className="space-y-6">
                        <ResultCard
                          title="Application Workflow"
                          icon={<Code size={24} weight="duotone" />}
                          content={result.applicationWorkflow || "Application workflow guidance not available."}
                          delay={0.3}
                        />

                        <ResultCard
                          title="UI Workflow"
                          icon={<Desktop size={24} weight="duotone" />}
                          content={result.uiWorkflow || "UI workflow guidance not available."}
                          delay={0.4}
                        />

                        <ResultCard
                          title="Database Workflow"
                          icon={<Database size={24} weight="duotone" />}
                          content={result.databaseWorkflow || "Database workflow guidance not available."}
                          delay={0.5}
                        />

                        <ResultCard
                          title="Mobile Workflow"
                          icon={<DeviceMobile size={24} weight="duotone" />}
                          content={result.mobileWorkflow || "Mobile workflow guidance not available."}
                          delay={0.6}
                        />

                        <ResultCard
                          title="Implementation Checklist"
                          icon={<ListChecks size={24} weight="duotone" />}
                          content={result.implementationChecklist || "Implementation checklist not available."}
                          delay={0.7}
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {!isLoading && !result && !error && <EmptyState onNavigate={setActiveTab} />}
              </div>
            </TabsContent>

            <TabsContent value="ideas" className="space-y-6">
              <IdeaGeneration userId={user.id} user={user} />
            </TabsContent>

            <TabsContent value="ngo-saas" className="space-y-6">
              <NGOModule userId={user.id} user={user} />
            </TabsContent>

            <TabsContent value="plagiarism" className="space-y-6">
              <PlagiarismChecker user={user} />
            </TabsContent>

            <TabsContent value="dashboard" className="space-y-6">
              <Dashboard 
                strategies={user.role === "admin" && adminAllStrategies.length > 0 ? adminAllStrategies : (savedStrategies || [])} 
                promptMemory={promptMemory || []}
                isAdmin={user.role === "admin"}
              />
            </TabsContent>

            <TabsContent value="saved" className="space-y-6">
              {selectedForComparison.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-accent/10 border border-accent/30 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {selectedForComparison.length} {selectedForComparison.length === 1 ? 'strategy' : 'strategies'} selected for comparison
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleOpenComparison}
                      size="sm"
                      className="gap-2"
                    >
                      Compare Now
                    </Button>
                    <Button
                      onClick={() => setSelectedForComparison([])}
                      variant="ghost"
                      size="sm"
                    >
                      Clear
                    </Button>
                  </div>
                </motion.div>
              )}
              
              <SavedStrategies
                strategies={user.role === "admin" && adminAllStrategies.length > 0 ? adminAllStrategies : (savedStrategies || [])}
                onDelete={handleDeleteStrategy}
                onView={handleViewStrategy}
                onCompare={handleToggleCompare}
                onExportPdf={handleExportStrategyPdf}
                onExportWord={handleExportStrategyWord}
                canExportWord={exportPlanConfig.allowWordExport}
                selectedForComparison={selectedForComparison}
              />
            </TabsContent>

            <TabsContent value="timeline" className="space-y-6">
              <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 p-6 md:p-8 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <ClockCounterClockwise size={22} weight="duotone" className="text-primary" />
                    Workflow Timeline
                  </h2>
                  <p className="text-xs text-muted-foreground">{filteredWorkflowRuns.length} checkpoints</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={timelineSearch}
                    onChange={(e) => setTimelineSearch(e.target.value)}
                    placeholder="Search by prompt, mode, model..."
                    className="h-10 rounded border border-input bg-background px-3 text-sm"
                  />
                  <select
                    value={timelinePlanFilter}
                    onChange={(e) => setTimelinePlanFilter(e.target.value as "all" | "basic" | "pro")}
                    className="h-10 rounded border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">All plans</option>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                  </select>
                  <select
                    value={timelineStatusFilter}
                    onChange={(e) => setTimelineStatusFilter(e.target.value as "all" | "pass" | "fail")}
                    className="h-10 rounded border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">All status</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Needs repair</option>
                  </select>
                </div>

                {selectedTimelineCompare.length > 0 && (
                  <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-foreground">
                      {selectedTimelineCompare.length} checkpoint{selectedTimelineCompare.length === 1 ? "" : "s"} selected for compare
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedTimelineCompare([])}>
                      Clear
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  {filteredWorkflowRuns.length === 0 && (
                    <div className="rounded border border-border/50 p-6 text-center text-sm text-muted-foreground">
                      No checkpoints match your filters yet.
                    </div>
                  )}

                  {filteredWorkflowRuns.map((run) => {
                    const status = getRunStatus(run)
                    const isSelected = selectedTimelineCompare.includes(run.id)
                    return (
                      <div key={run.id} className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2 ${isSelected ? "border-accent" : "border-border/50"}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{run.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(run.timestamp).toLocaleString()} • {run.plan.toUpperCase()} • {run.conceptMode} • {run.modelUsed} • ${(
                              run.estimatedCostCents / 100
                            ).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${status === "pass" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                            {status === "pass" ? "Pass" : "Needs repair"}
                          </span>
                          <Button size="sm" variant="outline" onClick={() => handleToggleTimelineCompare(run.id)}>
                            <ArrowsHorizontal size={14} />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleRestoreWorkflowRun(run)}>
                            Restore
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {comparedRuns.length === 2 && (
                  <div className="rounded-lg border border-border/60 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Checkpoint Compare</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {comparedRuns.map((run) => (
                        <div key={run.id} className="rounded border border-border/50 p-3 space-y-2">
                          <p className="text-sm font-semibold text-foreground truncate">{run.description}</p>
                          <p className="text-xs text-muted-foreground">{new Date(run.timestamp).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Plan: {run.plan.toUpperCase()} • Model: {run.modelUsed}</p>
                          <p className="text-xs text-muted-foreground">Workflow steps: {run.steps.length}</p>
                          <p className="text-xs text-muted-foreground">Marketing copy length: {run.resultSnapshot?.marketingCopy?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">Checklist length: {run.resultSnapshot?.implementationChecklist?.length || 0}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {user.role === "admin" && (
              <TabsContent value="sentinel-brain" className="space-y-6">
                <SentinelBrain />
              </TabsContent>
            )}

            {user.role === "admin" && (
              <TabsContent value="admin" className="space-y-6">
                <AdminDashboard />
              </TabsContent>
            )}
          </Tabs>
        </div>
        
        <MobileNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={user.role === "admin"}
          savedCount={savedStrategies?.length || 0}
          canAccessReview={entitlements?.canAccessReview || user.role === "admin"}
        />
        
        <Footer />
      </div>

      {/* Upgrade to Pro/Team modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <UpgradePaywall user={user} feature="review" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default App
