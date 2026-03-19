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
import { toast } from "sonner"
import { CookedIdea, BusinessCanvasModel, PitchDeck, SavedIdea } from "@/types"
import { LoadingState } from "@/components/LoadingState"
import { BusinessCanvasView } from "@/components/BusinessCanvasView"
import { PitchDeckView } from "@/components/PitchDeckView"
import { SaveIdeaDialog } from "@/components/SaveIdeaDialog"
import { SavedIdeasList } from "@/components/SavedIdeasList"
import { useKV } from "@github/spark/hooks"

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
  const [savedIdeas, setSavedIdeas] = useKV<SavedIdea[]>(`saved-ideas-${userId}`, [])
  const resultsRef = useRef<HTMLDivElement>(null)

  const isValidInput = ideaInput.trim().length >= 20

  const cookIdea = async () => {
    if (!isValidInput) {
      toast.error("Please enter at least 20 characters to describe your idea")
      return
    }

    setIsLoadingIdea(true)
    
    try {
      const prompt = spark.llmPrompt`You are a world-class business mentor with 20+ years of experience in entrepreneurship, startups, and venture capital. You've mentored hundreds of successful founders and helped them refine their ideas into successful businesses.

Your task is to analyze and refine the following business idea:

"${ideaInput}"

Provide a comprehensive analysis in valid JSON format with the following structure:

{
  "originalIdea": "Restate the user's original idea clearly",
  "refinedIdea": "A refined, compelling version of the idea (2-3 paragraphs) that highlights the core value proposition, innovation, and potential impact. Make it investor-ready.",
  "keyInsights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"] - Array of 5-7 critical insights about the idea's potential, market fit, and strategic positioning,
  "marketOpportunity": "Detailed analysis (2-3 paragraphs) of the market opportunity, size, trends, and growth potential",
  "competitiveAdvantage": "Clear explanation (2 paragraphs) of what makes this idea unique and defensible against competition",
  "targetMarket": "Specific description (2 paragraphs) of the ideal customer segments, their demographics, psychographics, and pain points",
  "revenueModel": "Practical revenue model recommendation (2 paragraphs) with potential pricing strategies and monetization approaches",
  "keyRisks": ["risk 1", "risk 2", "risk 3", "risk 4"] - Array of 4-6 key risks and challenges to consider,
  "nextSteps": ["step 1", "step 2", "step 3", "step 4", "step 5"] - Array of 5-7 actionable next steps to validate and develop this idea
}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no text outside the JSON object. Ensure all strings are properly escaped.`

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
      
      setCookedIdea(parsedResult)
      setCurrentIdeaInput(ideaInput)
      setBusinessCanvas(null)
      setPitchDeck(null)
      
      toast.success("Idea successfully refined!")
      
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    } catch (error) {
      console.error("Error cooking idea:", error)
      toast.error("Failed to refine idea. Please try again.")
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
      const prompt = spark.llmPrompt`You are an expert business strategist specializing in the Business Model Canvas framework. Based on the refined business idea below, create a comprehensive Business Model Canvas.

Original Idea: ${cookedIdea.originalIdea}
Refined Idea: ${cookedIdea.refinedIdea}
Market Opportunity: ${cookedIdea.marketOpportunity}
Target Market: ${cookedIdea.targetMarket}
Revenue Model: ${cookedIdea.revenueModel}

Create a Business Model Canvas in valid JSON format:

{
  "keyPartners": "Detailed description of key partners, suppliers, and strategic alliances needed for this business (2-3 paragraphs)",
  "keyActivities": "Core activities and operations required to deliver the value proposition (2-3 paragraphs)",
  "keyResources": "Essential resources (physical, intellectual, human, financial) needed (2-3 paragraphs)",
  "valueProposition": "Clear articulation of the unique value delivered to customers (2-3 paragraphs)",
  "customerRelationships": "How the business will establish and maintain customer relationships (2-3 paragraphs)",
  "channels": "Distribution and communication channels to reach customers (2-3 paragraphs)",
  "customerSegments": "Specific customer segments targeted (2-3 paragraphs)",
  "costStructure": "Major cost drivers and expense categories (2-3 paragraphs)",
  "revenueStreams": "Revenue sources and pricing mechanisms (2-3 paragraphs)"
}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks. Ensure all strings are properly escaped.`

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
      
      setBusinessCanvas(parsedResult)
      toast.success("Business Canvas Model generated!")
    } catch (error) {
      console.error("Error generating canvas:", error)
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
      const prompt = spark.llmPrompt`You are an expert pitch deck consultant who has helped raise millions in venture capital. Create a professional 10-slide pitch deck based on the business idea below.

Original Idea: ${cookedIdea.originalIdea}
Refined Idea: ${cookedIdea.refinedIdea}
Market Opportunity: ${cookedIdea.marketOpportunity}
Competitive Advantage: ${cookedIdea.competitiveAdvantage}
Target Market: ${cookedIdea.targetMarket}
Revenue Model: ${cookedIdea.revenueModel}

Create a pitch deck with exactly 10 slides in the following JSON format:

{
  "executiveSummary": "A compelling 2-paragraph executive summary of the entire pitch",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Problem",
      "content": "Describe the problem in 2-3 paragraphs. Make it relatable and urgent.",
      "notes": "Speaker notes with tips for presenting this slide"
    },
    {
      "slideNumber": 2,
      "title": "Solution",
      "content": "Present your solution in 2-3 paragraphs. Focus on how it solves the problem.",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 3,
      "title": "Market Opportunity",
      "content": "Market size, trends, and growth potential in 2-3 paragraphs",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 4,
      "title": "Product/Service",
      "content": "Key features and benefits in 2-3 paragraphs",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 5,
      "title": "Business Model",
      "content": "How you make money in 2-3 paragraphs",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 6,
      "title": "Competitive Advantage",
      "content": "What makes you unique in 2-3 paragraphs",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 7,
      "title": "Go-to-Market Strategy",
      "content": "How you'll acquire customers in 2-3 paragraphs",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 8,
      "title": "Traction & Milestones",
      "content": "Progress to date and future milestones in 2-3 paragraphs",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 9,
      "title": "Team",
      "content": "Key team members and advisors placeholder in 2-3 paragraphs",
      "notes": "Speaker notes"
    },
    {
      "slideNumber": 10,
      "title": "Financial Projections & Ask",
      "content": "Funding ask and use of funds in 2-3 paragraphs",
      "notes": "Speaker notes"
    }
  ]
}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks. Ensure all strings are properly escaped.`

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
      
      setPitchDeck(parsedResult)
      toast.success("Pitch Deck generated!")
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
      name,
      originalIdea: currentIdeaInput,
      cookedIdea,
      businessCanvas: businessCanvas || undefined,
      pitchDeck: pitchDeck || undefined,
      timestamp: Date.now(),
      userId
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
    <Tabs defaultValue="create" className="w-full">
      <TabsList className="grid w-full max-w-md mx-auto mb-8 grid-cols-2">
        <TabsTrigger value="create" className="gap-2">
          <Lightbulb size={18} weight="bold" />
          Create Idea
        </TabsTrigger>
        <TabsTrigger value="saved" className="gap-2">
          <Eye size={18} weight="bold" />
          Saved Ideas ({savedIdeas?.length || 0})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="create" className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 p-6 md:p-8"
        >
          <div className="flex items-start gap-3 mb-4">
            <Sparkle size={32} weight="duotone" className="text-primary flex-shrink-0 mt-1" />
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Idea Generator</h2>
              <p className="text-muted-foreground">
                Describe your business idea and let our AI-powered engine help you refine it into a winning concept
              </p>
            </div>
          </div>

          <label htmlFor="idea-input" className="block text-sm font-semibold text-foreground mb-3">
            Describe your business idea
          </label>
          <Textarea
            id="idea-input"
            value={ideaInput}
            onChange={(e) => setIdeaInput(e.target.value)}
            placeholder="e.g., A mobile app that connects local farmers directly with consumers, eliminating middlemen and ensuring fresh produce delivery within 24 hours..."
            className="min-h-40 resize-none text-base leading-relaxed focus:ring-2 focus:ring-accent transition-all mb-4"
            maxLength={2000}
          />

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {ideaInput.length >= 1800 && (
                <span className={ideaInput.length >= 2000 ? "text-destructive font-medium" : ""}>
                  {ideaInput.length}/2000
                </span>
              )}
            </div>
            
            <Button
              onClick={cookIdea}
              disabled={!isValidInput || isLoadingIdea}
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary hover:shadow-lg transition-all"
            >
              {isLoadingIdea ? (
                <>Processing...</>
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
          {isLoadingIdea && <LoadingState />}
          
          <AnimatePresence>
            {!isLoadingIdea && cookedIdea && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-2xl font-bold text-foreground">Your Refined Idea</h2>
                  <div className="flex items-center gap-2 flex-wrap">
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

                <Card className="p-6 bg-gradient-to-br from-accent/5 to-primary/5 border-accent/20">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Refined Concept</h3>
                  <div className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {cookedIdea.refinedIdea}
                  </div>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Key Insights</h3>
                    <ul className="space-y-2">
                      {cookedIdea.keyInsights.map((insight, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span className="text-muted-foreground">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Key Risks</h3>
                    <ul className="space-y-2">
                      {cookedIdea.keyRisks.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-destructive mt-1">•</span>
                          <span className="text-muted-foreground">{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Market Opportunity</h3>
                  <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {cookedIdea.marketOpportunity}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Competitive Advantage</h3>
                  <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {cookedIdea.competitiveAdvantage}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Target Market</h3>
                  <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {cookedIdea.targetMarket}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Revenue Model</h3>
                  <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {cookedIdea.revenueModel}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Next Steps</h3>
                  <ul className="space-y-2">
                    {cookedIdea.nextSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary font-semibold mt-1">{idx + 1}.</span>
                        <span className="text-muted-foreground">{step}</span>
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
                    <ChartDonut size={32} weight="duotone" className="text-primary" />
                    <div>
                      <div className="font-semibold">Generate Business Canvas</div>
                      <div className="text-xs text-muted-foreground font-normal">Free - Business Model Canvas</div>
                    </div>
                    {isLoadingCanvas && <span className="text-xs">Generating...</span>}
                  </Button>

                  <Button
                    onClick={generatePitchDeck}
                    disabled={isLoadingPitch}
                    size="lg"
                    variant="outline"
                    className="gap-2 h-auto py-6 flex-col"
                  >
                    <PresentationChart size={32} weight="duotone" className="text-primary" />
                    <div>
                      <div className="font-semibold">Generate Pitch Deck</div>
                      <div className="text-xs text-muted-foreground font-normal">Free - 10-Slide Investor Pitch</div>
                    </div>
                    {isLoadingPitch && <span className="text-xs">Generating...</span>}
                  </Button>
                </div>

                {businessCanvas && (
                  <BusinessCanvasView canvas={businessCanvas} ideaName={currentIdeaInput} />
                )}

                {pitchDeck && (
                  <PitchDeckView pitchDeck={pitchDeck} ideaName={currentIdeaInput} />
                )}
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

      <SaveIdeaDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSaveIdea}
      />
    </Tabs>
  )
}
