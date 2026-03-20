import { useEffect, useMemo, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Sparkle, Lightbulb, ChatsCircle, Palette, Target, ArrowClockwise, FloppyDisk, FolderOpen, Code, Desktop, Database, DeviceMobile, ListChecks, ChartBar, ShieldCheck, MagnifyingGlass } from "@phosphor-icons/react"
import { ResultCard } from "@/components/ResultCard"
import { LoadingState } from "@/components/LoadingState"
import { EmptyState } from "@/components/EmptyState"
import { SavedStrategies } from "@/components/SavedStrategies"
import { ComparisonView } from "@/components/ComparisonView"
import { SaveStrategyDialog } from "@/components/SaveStrategyDialog"
import { AuthForm } from "@/components/AuthForm"
import { UserMenu } from "@/components/UserMenu"
import { Dashboard } from "@/components/Dashboard"
import { AdminDashboard } from "@/components/AdminDashboard"
import { WelcomeBanner } from "@/components/WelcomeBanner"
import { TopNotchBanner } from "@/components/TopNotchBanner"
import { Footer } from "@/components/Footer"
import { PlagiarismChecker } from "@/components/PlagiarismChecker"
import { IdeaGeneration } from "@/components/IdeaGeneration"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useKV } from "@github/spark/hooks"
import { motion, AnimatePresence } from "framer-motion"
import { MarketingResult, SavedStrategy, UserProfile } from "@/types"
import { authService } from "@/lib/auth"
import { BRAND_THEME_STORAGE_KEY, DEFAULT_BRAND_THEME, isBrandThemeName, type BrandThemeName } from "@/lib/brand-theme"
import { logError } from "@/lib/error-logger"
import {
  DEFAULT_KNOWLEDGEBASE_CONCEPTS,
  DEFAULT_KNOWLEDGE_FEED_ITEMS,
  KnowledgebaseConcept,
  KnowledgeFeedItem,
  formatFeedForPrompt,
  formatKnowledgebaseForPrompt,
} from "@/lib/concept-playbooks"

type ConceptMode = "auto" | "sales" | "ecommerce" | "saas" | "education" | "healthcare" | "fintech" | "ops"

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
}

function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [userIdForKV, setUserIdForKV] = useState<string>("temp")
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
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
  const [knowledgebaseConcepts, setKnowledgebaseConcepts] = useKV<KnowledgebaseConcept[]>("knowledgebase-concepts", [])
  const [knowledgeFeed, setKnowledgeFeed] = useKV<KnowledgeFeedItem[]>("knowledge-feed", [])
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [conceptMode, setConceptMode] = useState<ConceptMode>("auto")
  const [showPromptSuggestions, setShowPromptSuggestions] = useState(false)
  const [brandTheme, setBrandTheme] = useState<BrandThemeName>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_BRAND_THEME
    }

    const storedTheme = window.localStorage.getItem(BRAND_THEME_STORAGE_KEY)
    return isBrandThemeName(storedTheme) ? storedTheme : DEFAULT_BRAND_THEME
  })
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

  useEffect(() => {
    if (!knowledgebaseConcepts || knowledgebaseConcepts.length === 0) {
      setKnowledgebaseConcepts(DEFAULT_KNOWLEDGEBASE_CONCEPTS)
    }

    if (!knowledgeFeed || knowledgeFeed.length === 0) {
      setKnowledgeFeed(DEFAULT_KNOWLEDGE_FEED_ITEMS)
    }
  }, [knowledgebaseConcepts, knowledgeFeed, setKnowledgebaseConcepts, setKnowledgeFeed])

  const activeKnowledgebase = useMemo(
    () => (knowledgebaseConcepts && knowledgebaseConcepts.length > 0 ? knowledgebaseConcepts : DEFAULT_KNOWLEDGEBASE_CONCEPTS),
    [knowledgebaseConcepts]
  )

  const activeFeed = useMemo(
    () => (knowledgeFeed && knowledgeFeed.length > 0 ? knowledgeFeed : DEFAULT_KNOWLEDGE_FEED_ITEMS),
    [knowledgeFeed]
  )

  const knowledgebasePrompt = useMemo(
    () => formatKnowledgebaseForPrompt(activeKnowledgebase),
    [activeKnowledgebase]
  )

  const feedPrompt = useMemo(
    () => formatFeedForPrompt(activeFeed),
    [activeFeed]
  )

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

    const prompt = spark.llmPrompt`You are an elite marketing strategist, solutions architect, and AI automation consultant. Based on the topic below, produce a comprehensive strategy and implementation guidance at production depth.

Topic/Description: ${description}

Selected Concept Mode: ${conceptMode}
Mode Instruction: ${CONCEPT_MODE_INSTRUCTION[conceptMode]}

Knowledgebase Database (persistent concept records):
${knowledgebasePrompt}

Knowledge Feed Database (recent examples and references):
${feedPrompt}

Use both databases as a quality bar and adapt to the user's domain.

CRITICAL JSON FORMATTING RULES:
1. Return ONLY a valid JSON object with no markdown, no code blocks, no text before or after
2. All string values must properly escape special characters: use \\" for quotes, \\\\ for backslashes, \\n for newlines
3. Do NOT use unescaped quotes, line breaks, or special characters inside string values
4. Keep all content within string values - no nested objects or arrays
5. Test that your output is valid JSON before returning
6. Do NOT include any explanatory text or commentary outside the JSON object

Required JSON structure with exactly these eight properties:

{
  "marketingCopy": "Persuasive, engaging marketing copy (2-3 paragraphs) that highlights benefits, creates desire, and includes a compelling call-to-action. Use simple formatting only.",
  "visualStrategy": "Detailed visual strategy recommendations including suggested imagery, colors, design motifs, mood, and overall aesthetic direction. Write as flowing paragraphs with simple formatting.",
  "targetAudience": "Specific recommendation for the ideal target audience including demographics, psychographics, pain points, and why they need this. Use simple text formatting.",
  "applicationWorkflow": "Practical application implementation workflow (architecture, key modules, API/service flow, phased build plan). Use simple bullet-like formatting with hyphens, not complex markdown.",
  "uiWorkflow": "Step-by-step UI implementation guidance (screens/components, design system setup, interaction patterns, accessibility). Use simple formatting.",
  "databaseWorkflow": "Database implementation guidance (schema entities, relationships, migration approach, indexing, security/data validation). Use simple formatting.",
  "mobileWorkflow": "Mobile app implementation guidance (cross-platform approach, navigation, offline/state strategy, release milestones, push/notification considerations). Use simple formatting.",
  "implementationChecklist": "Compact sprint-ready checklist with clear tasks grouped by phases (MVP setup, build, test, launch). Keep it concise and actionable with simple formatting."
}

FORMATTING GUIDELINES:
- Use simple text formatting: hyphens for bullets, line breaks for separation
- Avoid complex markdown, code blocks, or special symbols
- Keep content professional, actionable, and inspiring
- Be specific and creative while maintaining valid JSON structure
- Ensure ALL strings are properly terminated and escaped`

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
    
    console.log(`Attempt ${attemptNumber} - Response length:`, cleanedResponse.length)
    console.log(`Attempt ${attemptNumber} - First 200 chars:`, cleanedResponse.substring(0, 200))
    console.log(`Attempt ${attemptNumber} - Last 200 chars:`, cleanedResponse.substring(Math.max(0, cleanedResponse.length - 200)))
    
    const parsedResult = JSON.parse(cleanedResponse) as MarketingResult
    
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
    setError(null)

    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          toast.info(`Retrying generation (attempt ${attempt}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }

        const normalizedResult = await attemptGeneration(attempt)

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

          <Tabs defaultValue="generate" className="w-full">
            <TabsList className={`grid w-full max-w-4xl mx-auto mb-8 ${user.role === "admin" ? "grid-cols-6" : "grid-cols-5"}`}>
              <TabsTrigger value="generate" className="gap-2">
                <Lightbulb size={18} weight="bold" />
                Strategy
              </TabsTrigger>
              <TabsTrigger value="ideas" className="gap-2">
                <Sparkle size={18} weight="bold" />
                Ideas
              </TabsTrigger>
              <TabsTrigger value="plagiarism" className="gap-2">
                <MagnifyingGlass size={18} weight="bold" />
                Review
              </TabsTrigger>
              <TabsTrigger value="dashboard" className="gap-2">
                <ChartBar size={18} weight="bold" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="saved" className="gap-2">
                <FolderOpen size={18} weight="bold" />
                Saved ({savedStrategies?.length || 0})
              </TabsTrigger>
              {user.role === "admin" && (
                <TabsTrigger value="admin" className="gap-2">
                  <ShieldCheck size={18} weight="bold" />
                  Admin
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
                <label htmlFor="product-description" className="block text-sm font-semibold text-foreground mb-3">
                  Describe your topic, product, or service
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
                  <Select value={conceptMode} onValueChange={(value) => setConceptMode(value as ConceptMode)}>
                    <SelectTrigger id="concept-mode" className="w-full">
                      <SelectValue placeholder="Select concept mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Recommended)</SelectItem>
                      <SelectItem value="sales">Sales Agent & Funnel</SelectItem>
                      <SelectItem value="ecommerce">E-commerce Concierge</SelectItem>
                      <SelectItem value="saas">SaaS Onboarding & Activation</SelectItem>
                      <SelectItem value="education">Education Coach</SelectItem>
                      <SelectItem value="healthcare">Healthcare Triage Assistant</SelectItem>
                      <SelectItem value="fintech">Fintech Onboarding & Risk</SelectItem>
                      <SelectItem value="ops">Internal Ops Copilot</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Choose a domain lens for strategy depth, or keep Auto to let AI select the best archetypes.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Database loaded: {activeKnowledgebase.length} concepts • {activeFeed.length} feed items
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
                {isLoading && <LoadingState />}
                
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
        
        <Footer />
      </div>
    </>
  );
}

export default App
