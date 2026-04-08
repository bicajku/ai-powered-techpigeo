import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileDoc, FilePdf, Slideshow, CaretLeft, CaretRight } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { PitchDeck } from "@/types"
import { toast } from "sonner"
import { exportPitchDeckAsWord, exportPitchDeckAsPPTX } from "@/lib/document-export"
import { exportPitchDeckAsPDF } from "@/lib/pdf-export"

interface PitchDeckViewProps {
  pitchDeck: PitchDeck
  ideaName: string
}

export function PitchDeckView({ pitchDeck, ideaName }: PitchDeckViewProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const hasSlides = pitchDeck.slides.length > 0

  const handleExportWord = async () => {
    try {
      await exportPitchDeckAsWord(pitchDeck, ideaName)
      toast.success("Pitch Deck exported to Word successfully!")
    } catch (error) {
      console.error("Error exporting Word:", error)
      toast.error("Failed to export to Word. Please try again.")
    }
  }

  const handleExportPDF = async () => {
    try {
      await exportPitchDeckAsPDF(pitchDeck, ideaName)
      toast.success("Pitch Deck PDF export initiated!")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF. Please try again.")
    }
  }

  const handleExportPPTX = async () => {
    try {
      await exportPitchDeckAsPPTX(pitchDeck, ideaName)
      toast.success("Pitch Deck exported to PPTX successfully!")
    } catch (error) {
      console.error("Error exporting PPTX:", error)
      toast.error("Failed to export PPTX. Please try again.")
    }
  }

  const nextSlide = () => {
    if (hasSlides && currentSlide < pitchDeck.slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const prevSlide = () => {
    if (hasSlides && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  const slide = hasSlides ? pitchDeck.slides[currentSlide] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 mt-8"
      data-pitch-view
    >
      <div className="rounded-2xl overflow-hidden border border-[#3B8E7E]/20 shadow-lg">
        <div className="bg-[#3B8E7E] px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-white">Business Model Development</h3>
            <p className="text-xs md:text-sm text-white/85">Pitch narrative for {ideaName}</p>
          </div>
          <div className="rounded-full bg-[#FF6600] px-3 py-1 text-[11px] text-white font-semibold tracking-wide">
            PITCH TEMPLATE
          </div>
        </div>
        <div
          className="h-9"
          style={{
            backgroundColor: "#3B8E7E",
            backgroundImage:
              "radial-gradient(circle at 15% 50%, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 18px, transparent 19px), radial-gradient(circle at 45% 50%, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 14px, transparent 15px), radial-gradient(circle at 78% 50%, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 16px, transparent 17px)",
          }}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h4 className="text-2xl font-bold text-foreground">Investor Pitch Deck</h4>
          <p className="text-sm text-muted-foreground mt-1">
            {pitchDeck.slides.length} slides ready for your presentation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" className="gap-2" onClick={handleExportPDF}>
            <FilePdf weight="bold" size={16} />
            Export PDF
          </Button>
          <Button size="sm" variant="default" className="gap-2" onClick={handleExportPPTX}>
            <Slideshow weight="bold" size={16} />
            Export PPTX
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleExportWord}>
            <FileDoc weight="bold" size={16} />
            Export Word
          </Button>
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-[#fff7ef] to-[#fffef7] border-[#FF6600]/30">
        <h4 className="font-semibold text-[#FF6600] mb-3">Executive Summary</h4>
        <p className="text-[#272727]/90 leading-relaxed whitespace-pre-wrap">
          {pitchDeck.executiveSummary}
        </p>
      </Card>

      <Card className="p-0 overflow-hidden border-[#272727]/20">
        <div className="bg-gradient-to-r from-[#3B8E7E]/20 via-[#5CC4EB]/20 to-[#3B8E7E]/20 p-4 flex items-center justify-between">
          <Button
            onClick={prevSlide}
            disabled={!hasSlides || currentSlide === 0}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            <CaretLeft weight="bold" size={16} />
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm bg-[#fff3bf] text-[#272727] border border-[#E6CC74]">
              Slide {hasSlides ? currentSlide + 1 : 0} of {pitchDeck.slides.length}
            </Badge>
          </div>
          
          <Button
            onClick={nextSlide}
            disabled={!hasSlides || currentSlide === pitchDeck.slides.length - 1}
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
              {slide ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <Badge className="text-xs bg-[#FF6600] text-white">{slide.slideNumber}</Badge>
                    <h4 className="text-2xl font-bold text-[#272727]">{slide.title}</h4>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-[#272727] leading-relaxed whitespace-pre-wrap text-base">
                      {slide.content}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No slides available in this saved pitch deck.</p>
              )}
            </div>

            <div className="border-t border-[#3B8E7E]/30 pt-4 mt-6 bg-[#f4f9f7] rounded-lg px-4 py-3">
              <h5 className="text-sm font-semibold text-[#3B8E7E] mb-2">Speaker Notes</h5>
              <p className="text-sm text-[#272727]/85 leading-relaxed whitespace-pre-wrap">
                {slide?.notes || "No speaker notes available."}
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
                  ? "bg-[#FF6600] text-white"
                  : "bg-card hover:bg-[#fff3bf] text-muted-foreground"
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
