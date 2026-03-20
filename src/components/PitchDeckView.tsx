import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileDoc, CaretLeft, CaretRight } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { PitchDeck } from "@/types"
import { toast } from "sonner"
import { exportPitchDeckAsWord } from "@/lib/document-export"

interface PitchDeckViewProps {
  pitchDeck: PitchDeck
  ideaName: string
}

export function PitchDeckView({ pitchDeck, ideaName }: PitchDeckViewProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const handleExportWord = async () => {
    try {
      await exportPitchDeckAsWord(pitchDeck, ideaName)
      toast.success("Pitch Deck exported to Word successfully!")
    } catch (error) {
      console.error("Error exporting Word:", error)
      toast.error("Failed to export to Word. Please try again.")
    }
  }

  const nextSlide = () => {
    if (currentSlide < pitchDeck.slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  const slide = pitchDeck.slides[currentSlide]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 mt-8"
      data-pitch-view
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-2xl font-bold text-foreground">Investor Pitch Deck</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {pitchDeck.slides.length} slides ready for your presentation
          </p>
        </div>
        <Button size="sm" variant="default" className="gap-2" onClick={handleExportWord}>
          <FileDoc weight="bold" size={16} />
          Export as Word
        </Button>
      </div>

      <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <h4 className="font-semibold text-foreground mb-3">Executive Summary</h4>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {pitchDeck.executiveSummary}
        </p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 p-4 flex items-center justify-between">
          <Button
            onClick={prevSlide}
            disabled={currentSlide === 0}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            <CaretLeft weight="bold" size={16} />
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              Slide {currentSlide + 1} of {pitchDeck.slides.length}
            </Badge>
          </div>
          
          <Button
            onClick={nextSlide}
            disabled={currentSlide === pitchDeck.slides.length - 1}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            Next
            <CaretRight weight="bold" size={16} />
          </Button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="p-8"
          >
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Badge className="text-xs">{slide.slideNumber}</Badge>
                <h4 className="text-2xl font-bold text-foreground">{slide.title}</h4>
              </div>
              <div className="prose prose-sm max-w-none">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap text-base">
                  {slide.content}
                </p>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-6">
              <h5 className="text-sm font-semibold text-muted-foreground mb-2">Speaker Notes</h5>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {slide.notes}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="p-4 bg-muted/30 flex gap-2 overflow-x-auto">
          {pitchDeck.slides.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                idx === currentSlide
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-secondary text-muted-foreground'
              }`}
            >
              {idx + 1}. {s.title}
            </button>
          ))}
        </div>
      </Card>
    </motion.div>
  )
}
