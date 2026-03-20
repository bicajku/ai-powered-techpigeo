import { useEffect, useMemo, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Sparkle, Lightbulb, ChatsCircle, Palette, Target, ArrowClockwise, FloppyDisk, FolderOpen, Code, Desktop, Database, DeviceMobile, ListChecks, ChartBar, ShieldCheck, MagnifyingGlass, CaretUpDown, Check, BookOpen } from "@phosphor-icons/react"
import { ResultCard } from "@/components/ResultCard"
import { LoadingState } from "@/components/LoadingState"
import { EmptyState } from "@/components/EmptyState"
import { SavedStrategies } from "@/components/SavedStrategies"
import { ComparisonView } from "@/components/ComparisonView"
import { SaveStrategyDialog } from "@/components/SaveStrategyDialog"
import { StrategyTemplatesBrowser } from "@/components/StrategyTemplatesBrowser"
import { AuthForm } from "@/components/AuthForm"
import { UserMenu } from "@/components/UserMenu"
import { Dashboard } from "@/components/Dashboard"
import { AdminDashboard } from "@/components/AdminDashboard"
import { WelcomeBanner } from "@/components/WelcomeBanner"
import { TopNotchBanner } from "@/components/TopNotchBanner"
import { Footer } from "@/components/Footer"
import { PlagiarismChecker } from "@/components/PlagiarismChecker"
import { IdeaGeneration } from "@/components/IdeaGeneration"
import { MobileNav } from "@/components/MobileNav"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { toast } from "sonner"
import { useKV } from "@github/spark/hooks"
import { motion, AnimatePresence } from "framer-motion"
import { MarketingResult, SavedStrategy, UserProfile, ConceptMode } from "@/types"
import { authService } from "@/lib/auth"
import { BRAND_THEME_STORAGE_KEY, DEFAULT_BRAND_THEME, isBrandThemeName, type BrandThemeName } from "@/lib/brand-theme"
import { logError } from "@/lib/error-logger"
import { cn } from "@/lib/utils"

interface PromptMemoryItem {
  prompt: string
  conceptMode: ConceptMode
  count: number
  lastUsedAt: number
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
  const [savedStrategies, setSavedStrategies] = useKV<SavedStrategy[]>(
    `saved-strategies-${userIdForKV}`,
    []
  )
  const [promptMemory, setPromptMemory] = useKV<PromptMemoryItem[]>(
    `user-prompt-memory-${userIdForKV}`,
    []
  )
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
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkAuth = async () => {
      await authService.initializeMasterAdmin()
      const currentUser = await authService.getCurrentUser()
      setUser(currentUser)
      if (currentUser) {
        setUserIdForKV(currentUser.id)
        // Only show welcome banner once per login session
        if (!hasShownWelcomeThisSession) {
          setShowExpandedWelcome(true)
          setHasShownWelcomeThisSession(true)
        }
      }
      setIsCheckingAuth(false)
    }
    checkAuth()
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
  }, [showExpandedWelcome, hasShownWelcomeThisSession])

  const isValidInput = description.trim().length >= 10
  const charCount = description.length
  const showCharCounter = charCount >= 900

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

  const attemptGeneration = async (attemptNumber: number): Promise<MarketingResult> => {
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

    const prompt = spark.llmPrompt`You are an elite marketing strategist, solutions architect, and AI automation consultant. Based on the topic below, produce a comprehensive strategy and implementation guidance at production depth.

Topic/Description: ${description}

${contextSection}

CRITICAL JSON FORMATTING RULES - FOLLOW EXACTLY:
1. Return ONLY a valid JSON object with no markdown, no code blocks, no text before or after
2. ALL string values MUST use straight double quotes (") NOT curly/smart quotes ("")
3. Inside string values, escape ALL special characters:
   - Use \\" for quotes
   - Use \\\\ for backslashes  
   - Use \\n for line breaks (NOT actual line breaks)
   - Do NOT use unescaped quotes, tabs, or newlines
4. Keep ALL content as plain text within string values - no nested JSON structures
5. Each string value MUST be on a single logical line (use \\n for breaks, not actual newlines)
6. Do NOT include any text outside the JSON object

Required JSON structure with exactly these eight properties:

{
  "marketingCopy": "2-3 paragraphs of persuasive marketing copy. Use only plain text with \\n for paragraph breaks. No special characters.",
  "visualStrategy": "Visual strategy recommendations as plain text paragraphs. Use \\n for breaks. No special formatting.",
  "targetAudience": "Target audience description as plain text. Use \\n for breaks. Keep it simple.",
  "applicationWorkflow": "Implementation workflow as plain text with hyphens for bullets. Use \\n between items. No complex formatting.",
  "uiWorkflow": "UI implementation guidance as plain text. Use hyphens and \\n. Keep it simple.",
  "databaseWorkflow": "Database guidance as plain text. Use hyphens and \\n. No special characters.",
  "mobileWorkflow": "Mobile implementation guidance as plain text. Use hyphens and \\n. Simple formatting only.",
  "implementationChecklist": "Sprint tasks as plain text checklist. Use hyphens and \\n. Keep concise."
}

CRITICAL REMINDERS:
- NO actual line breaks in string values - use \\n
- NO unescaped quotes - use \\" 
- NO special/curly quotes - use straight quotes only
- Keep content concise to avoid string termination issues
- Validate your JSON is parseable before returning`

    if (typeof spark.llm !== "function") {
      const error = new Error("Spark LLM function is not available.")
      await logError("Spark LLM function unavailable", error, "system", "critical", user?.id)
      throw error
    }

    const response = await spark.llm(prompt, "gpt-4o", true)
    
    if (!response) {
      const error = new Error("Empty response from LLM")
      await logError("Empty LLM response", error, "generation", "high", user?.id, {
        attemptNumber,
        description: description.substring(0, 100),
        conceptMode,
      })
      throw error
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
    
    let parsedResult: MarketingResult
    
    try {
      parsedResult = JSON.parse(cleanedResponse) as MarketingResult
    } catch (parseError) {
      console.error(`Attempt ${attemptNumber} - JSON parse failed:`, parseError)
      console.error(`Problematic JSON around error position:`)
      
      if (parseError instanceof SyntaxError) {
        const match = parseError.message.match(/position (\d+)/)
        if (match) {
          const pos = parseInt(match[1], 10)
          const start = Math.max(0, pos - 100)
          const end = Math.min(cleanedResponse.length, pos + 100)
          console.error(`Context: ...${cleanedResponse.substring(start, end)}...`)
        }
      }
      
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

    return normalizedResult
  }

  const generateMarketing = async () => {
    if (!isValidInput) {
      toast.error("Please enter at least 10 characters")
      return
    }

    setIsLoading(true)
    setLoadingProgress(0)
    setError(null)

    const progressInterval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 90) return prev
        return prev + 5
      })
    }, 500)

    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          toast.info(`Retrying generation (attempt ${attempt}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }

        const normalizedResult = await attemptGeneration(attempt)

        clearInterval(progressInterval)
        setLoadingProgress(100)
        
        setResult(normalizedResult)
        rememberPrompt(description, conceptMode)
        setCurrentDescription(description)
        
        if (attempt > 1) {
          toast.success(`Successfully generated on attempt ${attempt}`)
        }
        
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
        
        setIsLoading(false)
        setLoadingProgress(0)
        return
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

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center">
        <div className="text-center">
          <Sparkle size={48} weight="duotone" className="text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />
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
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background relative overflow-hidden font-sans">
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Sparkle size={40} weight="duotone" className="text-primary" />
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                  AI-Powered Techpigeon Assistant
                </h1>
              </div>
              <UserMenu
                user={user}
                brandTheme={brandTheme}
                onBrandThemeChange={setBrandTheme}
                onLogout={handleLogout}
                onProfileUpdate={handleProfileUpdate}
              />
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed text-center md:text-left">
              Pakistan's leading AI platform for intelligent marketing strategies and business insights
            </p>
            <p className="text-sm text-muted-foreground mt-2 text-center md:text-left">
              Powered by <a href="https://www.techpigeon.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Techpigeon</a>
            </p>
          </motion.header>

          <AnimatePresence>
            {showExpandedWelcome && <WelcomeBanner user={user} />}
          </AnimatePresence>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`hidden md:grid w-full max-w-4xl mx-auto mb-8 grid-cols-3 sm:grid-cols-3 md:grid-cols-5 ${user.role === "admin" ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
              <TabsTrigger value="generate" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-1.5 px-1 sm:px-3">
                <Lightbulb size={16} weight="bold" className="sm:size-[18px]" />
                <span className="hidden sm:inline">Strategy</span>
                <span className="inline sm:hidden">Strategy</span>
              </TabsTrigger>
              <TabsTrigger value="ideas" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-1.5 px-1 sm:px-3">
                <Sparkle size={16} weight="bold" className="sm:size-[18px]" />
                <span className="hidden sm:inline">Ideas</span>
                <span className="inline sm:hidden">Ideas</span>
              </TabsTrigger>
              <TabsTrigger value="plagiarism" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-1.5 px-1 sm:px-3">
                <MagnifyingGlass size={16} weight="bold" className="sm:size-[18px]" />
                <span className="hidden sm:inline">Review</span>
                <span className="inline sm:hidden">Review</span>
              </TabsTrigger>
              <TabsTrigger value="dashboard" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-1.5 px-1 sm:px-3">
                <ChartBar size={16} weight="bold" className="sm:size-[18px]" />
                <span className="hidden sm:inline">Dashboard</span>
                <span className="inline sm:hidden">Stats</span>
              </TabsTrigger>
              <TabsTrigger value="saved" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-1.5 px-1 sm:px-3">
                <FolderOpen size={16} weight="bold" className="sm:size-[18px]" />
                <span className="hidden sm:inline">Saved ({savedStrategies?.length || 0})</span>
                <span className="inline sm:hidden">Saved</span>
              </TabsTrigger>
              {user.role === "admin" && (
                <TabsTrigger value="admin" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-col sm:flex-row py-2 sm:py-1.5 px-1 sm:px-3 col-span-3 sm:col-span-1">
                  <ShieldCheck size={16} weight="bold" className="sm:size-[18px]" />
                  <span className="hidden sm:inline">Admin</span>
                  <span className="inline sm:hidden">Admin</span>
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
                
                {!isLoading && !result && !error && <EmptyState />}
              </div>
            </TabsContent>

            <TabsContent value="ideas" className="space-y-6">
              <IdeaGeneration userId={user.id} />
            </TabsContent>

            <TabsContent value="plagiarism" className="space-y-6">
              <PlagiarismChecker user={user} />
            </TabsContent>

            <TabsContent value="dashboard" className="space-y-6">
              <Dashboard 
                strategies={savedStrategies || []} 
                promptMemory={promptMemory || []}
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
                strategies={savedStrategies || []}
                onDelete={handleDeleteStrategy}
                onView={handleViewStrategy}
                onCompare={handleToggleCompare}
                selectedForComparison={selectedForComparison}
              />
            </TabsContent>

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
        />
        
        <Footer />
      </div>
    </>
  );
}

export default App
