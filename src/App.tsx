import { useState, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Sparkle, Lightbulb, ChatsCircle, Palette, Target, ArrowClockwise, FloppyDisk, FolderOpen } from "@phosphor-icons/react"
import { ResultCard } from "@/components/ResultCard"
import { LoadingState } from "@/components/LoadingState"
import { EmptyState } from "@/components/EmptyState"
import { SavedStrategies } from "@/components/SavedStrategies"
import { ComparisonView } from "@/components/ComparisonView"
import { SaveStrategyDialog } from "@/components/SaveStrategyDialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { useKV } from "@github/spark/hooks"
import { motion, AnimatePresence } from "framer-motion"
import { MarketingResult, SavedStrategy } from "@/types"

function App() {
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<MarketingResult | null>(null)
  const [currentDescription, setCurrentDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [savedStrategies, setSavedStrategies] = useKV<SavedStrategy[]>("saved-strategies", [])
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)

  const isValidInput = description.trim().length >= 10
  const charCount = description.length
  const showCharCounter = charCount >= 900

  const generateMarketing = async () => {
    if (!isValidInput) {
      toast.error("Please enter at least 10 characters")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const prompt = spark.llmPrompt`You are an expert marketing strategist. Based on the following topic or description, generate a comprehensive marketing strategy.

Topic/Description: ${description}

Return your response as a valid JSON object with exactly three properties:
1. "marketingCopy" - Persuasive, engaging marketing copy (2-3 paragraphs) that highlights benefits, creates desire, and includes a compelling call-to-action
2. "visualStrategy" - Detailed visual strategy recommendations including suggested imagery, colors, design motifs, mood, and overall aesthetic direction
3. "targetAudience" - Specific recommendation for the ideal target audience including demographics, psychographics, pain points, and why they need this

Make the content professional, actionable, and inspiring. Be specific and creative.`

      const response = await spark.llm(prompt, "gpt-4o", true)
      const parsedResult = JSON.parse(response) as MarketingResult

      setResult(parsedResult)
      setCurrentDescription(description)
      
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    } catch (err) {
      console.error("Error generating marketing:", err)
      setError("Failed to generate marketing strategy. Please try again.")
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
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

    const newStrategy: SavedStrategy = {
      id: Date.now().toString(),
      name: name,
      description: currentDescription,
      result: result,
      timestamp: Date.now()
    }

    setSavedStrategies((current) => [newStrategy, ...(current || [])])
    toast.success("Strategy saved successfully")
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

  return (
    <>
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

      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_oklch(0.65_0.22_240_/_0.08)_0%,_transparent_50%),radial-gradient(circle_at_70%_80%,_oklch(0.48_0.18_240_/_0.1)_0%,_transparent_50%)] pointer-events-none" />
        
        <div className="relative max-w-6xl mx-auto px-6 md:px-8 py-12 md:py-16">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-3 mb-4">
              <Sparkle size={40} weight="duotone" className="text-primary" />
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                AI Marketing Assistant
              </h1>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              Transform your ideas into powerful marketing strategies with AI-driven insights
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Powered by <a href="https://www.techpigeon.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Techpigeon</a>
            </p>
          </motion.header>

          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
              <TabsTrigger value="generate" className="gap-2">
                <Lightbulb size={18} weight="bold" />
                Generate
              </TabsTrigger>
              <TabsTrigger value="saved" className="gap-2">
                <FolderOpen size={18} weight="bold" />
                Saved ({savedStrategies?.length || 0})
              </TabsTrigger>
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
                <Textarea
                  id="product-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="e.g., A sustainable fashion brand for eco-conscious millennials, an AI-powered productivity app for remote teams, a local coffee shop with artisan roasts..."
                  className="min-h-32 mb-4 resize-none text-base leading-relaxed focus:ring-2 focus:ring-accent transition-all"
                  maxLength={1000}
                />
                
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
                  </div>
                )}
                
                {!isLoading && !result && !error && <EmptyState />}
              </div>
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
          </Tabs>
        </div>
      </div>
    </>
  )
}

export default App
