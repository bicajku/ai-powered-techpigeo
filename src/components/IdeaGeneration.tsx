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
import { CookedIdea, BusinessC
import { BusinessCanvasView } from "@/components/BusinessCanvasView"
import { SaveIdeaDialog } from "@/components/SaveIdeaDia
import { useKV } from "@github/spark/hooks"
interface IdeaGenerationProps {
}
export function IdeaGeneration({ userId }: IdeaGenerationPro
  const [isLoadingIdea, setIsLoadingIdea] =

  const [businessCanvas, setBus
  const [current
 


    if (!isValidInput) {
      return

    
      const prompt = spark.llmPrompt`You are a world-class business men
Your task is to analyze and refine the following business idea:
"${ideaInput}"
Provide a comprehensive analysis in valid JSON format with the
{
  "refinedIdea": "A refined, compelling version of the idea (2-3 paragraphs) that hig
  "marketOpportunity": "Detailed analysis (2-3 pa

  "keyRisks": ["risk 1", "risk 2", "risk 3", "risk 4

CRITICAL: Return ONLY valid JSON
      const response = a
      let cleanedResponse = response.trim()
        clea
     

      const firstBrace = c
    
      }
      const parsedResult = JSON.parse(cleanedResponse) as CookedIdea

      setBusinessCanvas(null)

      

    } catch (error) {

 
  }
  const generateBusinessCanvas = async () => {
      toast.error("Please cook your idea first")
    }
    setIsLoadingCanvas(true)
    try {

Refined Idea: ${cookedIdea.refinedIdea}
Target Market: ${cookedIdea.targetMarket}


  "keyPartners": "Detailed description of key partners, suppliers, and strategic alliances needed for this business (2-3 paragraphs)",

  "customerRelationships": "How the business will establish an
  "cus
  "revenueStreams": "Revenue sources and pr


      
      if (cleanedResponse.startsWith("```json")) {
      }
      }
      
      const lastBrace = cleanedResponse.lastIndexOf('
        cleanedResponse = cleanedResponse.substring(firs

      
      t

    } finally {
    }

    if (!cookedIdea) {
      return

    
      const prompt = spark.llmPrompt`You are an e
Origin
Market Opportunity: ${co
Target Market: ${cookedIdea.targetMarket}


  "executiveSummary": "A compelling 2-paragraph e
    {
      "title": 
      "notes": "Speaker notes
    {
   

    {
      "title": "Market
      "notes": "Speaker notes"
    {
     

    {
    
      "no
    {

      "notes": "Speaker notes"
    {
      "title": "Go-to-Market Strategy",
      "notes": "Speaker notes"
    {

      "notes": "Speaker notes"

 
      "notes": "Speaker notes"
    {
      "title": "Financial Projections & Ask",
      "notes": "Speaker notes"
  ]


      
      if (cleanedResponse.startsWith("```json")) {
 

      

        cleanedResponse = cleanedResponse.substring(firstBrace

      
      toast.success("Pitch Deck generated!")
      console.error("Error generating pitch deck:", error)
    } finally {
    }

    setIdeaInput("")
    se
    setCurrentIdeaInput("")
  }
  const handleSaveIdea = (name: string) => {

      i

      businessCanvas: businessCanvas || undefined,
      
    }
    setSavedIdeas((current) => [newIdea, ...(current ||
  }
  const handleDeleteIdea = (id: string) => {
    toast.success("Idea deleted")

    setIdeaInput(idea.originalI
    s
   

  return (
      <TabsList classN
          <Lightbulb size={18} weight="bold" />
        </Ta
     


    
         
          className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-lg border border-border/50 p-6 md:p-8"

            <div>
              <p className="text-muted-
              </p>
          </div>
          <label htmlFor="idea-input" cla
          </label>

            onChange={(e) => setIdeaInput(e.target.value)}

 
          <div className="flex items-center justify-between gap-4">
             
     
              )}
            
              onClick={cookIdea}
              size="lg"
      
     
                <>
                  Cook My 
              )}
          </div>

     
          <AnimatePrese
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="spa
      
     
                      o
                      size="sm" 
                    >
                      Save Ide
      
     
                      c
                      <ArrowCloc
                    </Button>
                </div>
      
     
                  </div

                  <Card className="p-6">
                    <ul classN
      
     
                      )
                  </Card>
                  <Card className="p-6">
                    <ul classN
      
     
                      )
                  </Card>

                  <h3 classNam
      
     
                <Card c
                  <div
                  </div>

      
     
                </Card>
                <Card className="p-6">
                  <div className="text-muted-foreground leading-re
                  </div>

   
 

                      </li>


      
                    disabled={isLoadingCanv
                    variant="outline"
                  >
                    <div>
                      <div className="text-xs text-muted-foreground font-normal">Free -
       

      
                    size="lg"
                    className="gap-2 h-auto py-6 flex-co
                    <PresentationChart size={32} weight="duotone" className=
                      <div className="font-semibold">Generate Pitch Deck</div>
       


      

                  <PitchDeckView pitchDeck={
              </motio
          </AnimatePresence>
      </TabsContent>
      <TabsCont
          ideas={savedIdeas ||
     
   

        onOpenChange={setShowSa
      />
  )




















































































































































































































































































