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
  Eye,
  DownloadSimple,
  ChartDonut,
  PresentationChart
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { CookedIdea, BusinessCanvasModel, PitchDeck, SavedIdea } from "@/types"
import { BusinessCanvasView } from "@/components/BusinessCanvasView"
import { PitchDeckView } from "@/components/PitchDeckView"
import { SaveIdeaDialog } from "@/components/SaveIdeaDialog"
import { SavedIdeasList } from "@/components/SavedIdeasList"
import { useKV } from "@github/spark/hooks"
import { toast } from "sonner"

interface IdeaGenerationProps {
  userId: string
}

export function IdeaGeneration({ userId }: IdeaGenerationProps) {
  const [ideaInput, setIdeaInput] = useState("")
  const [isLoadingIdea, setIsLoadingIdea] = useState(false)
  const [isLoadingCanvas, setIsLoadingCanvas] = useState(false)
  const [isLoadingPitch, setIsLoadingPitch] = useState(false)
  const [cookedIdea, setCookedIdea] = useState<CookedIdea | null>(null)
  const [businessCanvas, setBusinessCanvas] = useState<BusinessCanvasModel | null>(null)
  const [pitchDeck, setPitchDeck] = useState<PitchDeck | null>(null)
  const [currentIdeaInput, setCurrentIdeaInput] = useState("")
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savedIdeas, setSavedIdeas] = useKV<SavedIdea[]>(
    userId ? `saved-ideas-${userId}` : "saved-ideas-temp",
    []
  )
  const resultsRef = useRef<HTMLDivElement>(null)

  const isValidInput = ideaInput.trim().length >= 10

  const cookIdea = async () => {
    if (!isValidInput) {
      toast.error("Please enter at least 10 characters")
      return
    }

    setIsLoadingIdea(true)

    try {
      const prompt = spark.llmPrompt`You are a world-class business mentor and innovation strategist.
Your task is to analyze and refine the following business idea:

"${ideaInput}"

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
      
      const parsedResult = JSON.parse(cleanedResponse) as CookedIdea

      const cookedIdeaWithOriginal: CookedIdea = {
        ...parsedResult,
        originalIdea: ideaInput
      }

      setCookedIdea(cookedIdeaWithOriginal)
      setBusinessCanvas(null)
      setPitchDeck(null)
      setCurrentIdeaInput(ideaInput)
      
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

    setIsLoadingCanvas(true)

    try {
      const prompt = spark.llmPrompt`You are an expert business model strategist. Based on the refined business idea below, generate a comprehensive Business Model Canvas.

Refined Idea: ${cookedIdea.refinedIdea}
Target Market: ${cookedIdea.targetMarket}
Revenue Model: ${cookedIdea.revenueModel}

Return a valid JSON object with this exact structure:

{
  "keyPartners": "Detailed description of key partners, suppliers, and strategic alliances needed for this business (2-3 paragraphs)",
  "keyActivities": "Core activities required to deliver the value proposition (2-3 paragraphs)",
  "keyResources": "Critical assets, capabilities, and resources needed (2-3 paragraphs)",
  "valueProposition": "The unique value this business creates for customers (2-3 paragraphs)",
  "customerRelationships": "How the business will establish and maintain customer relationships (2-3 paragraphs)",
  "channels": "How the product/service reaches customers (distribution, sales, marketing channels) (2-3 paragraphs)",
  "customerSegments": "Detailed customer segments and their characteristics (2-3 paragraphs)",
  "costStructure": "Major cost drivers and expense categories (2-3 paragraphs)",
  "revenueStreams": "Revenue sources and pricing mechanisms (2-3 paragraphs)"
}

CRITICAL: Return ONLY valid JSON with no markdown formatting.`

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
      
      const parsedResult = JSON.parse(cleanedResponse) as BusinessCanvasModel
      
      console.log("Business Canvas generated:", parsedResult)
      console.log("Business Canvas keys:", Object.keys(parsedResult))
      
      setBusinessCanvas(parsedResult)
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

    setIsLoadingPitch(true)

    try {
      const prompt = spark.llmPrompt`You are an expert pitch deck consultant. Create a compelling investor pitch deck based on this business idea:

Original Idea: ${cookedIdea.originalIdea}
Refined Idea: ${cookedIdea.refinedIdea}
Market Opportunity: ${cookedIdea.marketOpportunity}
Target Market: ${cookedIdea.targetMarket}
Revenue Model: ${cookedIdea.revenueModel}

Generate a pitch deck with exactly 8 slides. Return valid JSON with this structure:

{
  "executiveSummary": "A compelling 2-paragraph executive summary that captures the essence of the opportunity",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Problem",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    },
    {
      "slideNumber": 2,
      "title": "Solution",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    },
    {
      "slideNumber": 3,
      "title": "Market Opportunity",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    },
    {
      "slideNumber": 4,
      "title": "Product/Service",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    },
    {
      "slideNumber": 5,
      "title": "Business Model",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    },
    {
      "slideNumber": 6,
      "title": "Go-to-Market Strategy",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    },
    {
      "slideNumber": 7,
      "title": "Competitive Advantage",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    },
    {
      "slideNumber": 8,
      "title": "Financial Projections & Ask",
      "content": "Detailed slide content (2-3 paragraphs)",
      "notes": "Speaker notes for this slide (1-2 paragraphs)"
    }
  ]
}

CRITICAL: Return ONLY valid JSON.`

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
      
      const parsedResult = JSON.parse(cleanedResponse) as PitchDeck
      
      console.log("Pitch Deck generated:", parsedResult)
      console.log("Pitch Deck has", parsedResult.slides?.length || 0, "slides")
      
      setPitchDeck(parsedResult)
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
    setIdeaInput(idea.originalIdea)
    setCookedIdea(idea.cookedIdea)
    setBusinessCanvas(idea.businessCanvas || null)
    setPitchDeck(idea.pitchDeck || null)
    setCurrentIdeaInput(idea.originalIdea)
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
                      disabled={isLoadingCanvas}
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
                            <div className="text-xs text-muted-foreground font-normal">Free - Powered by AI</div>
                          </div>
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={generatePitchDeck}
                      disabled={isLoadingPitch}
                      size="lg"
                      variant="outline"
                      className="gap-2 h-auto py-6 flex-col"
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
                            <div className="font-semibold">Generate Pitch Deck</div>
                            <div className="text-xs text-muted-foreground font-normal">Free - Investor Ready</div>
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
