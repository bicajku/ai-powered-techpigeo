import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FilePdf, CaretLeft, CaretRight } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { PitchDeck } from "@/types"
import { toast } from "sonner"
import { jsPDF } from "jspdf"

interface PitchDeckViewProps {
  pitchDeck: PitchDeck
  ideaName: string
}

export function PitchDeckView({ pitchDeck, ideaName }: PitchDeckViewProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      const contentWidth = pageWidth - (2 * margin)

      const primaryColor: [number, number, number] = [138, 145, 227]
      const accentColor: [number, number, number] = [144, 202, 119]
      const textColor: [number, number, number] = [51, 51, 77]
      const mutedColor: [number, number, number] = [122, 122, 117]

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.rect(0, 0, pageWidth, pageHeight, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(48)
      doc.setFont('helvetica', 'bold')
      const titleLines = doc.splitTextToSize(ideaName, contentWidth - 40)
      const titleY = pageHeight / 2 - (titleLines.length * 10)
      doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' })

      doc.setFontSize(18)
      doc.setFont('helvetica', 'normal')
      doc.text('INVESTOR PITCH DECK', pageWidth / 2, titleY + (titleLines.length * 12) + 10, { align: 'center' })

      doc.setFillColor(255, 255, 255)
      doc.rect(margin, pageHeight - 35, contentWidth, 20, 'F')
      
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('TECHPIGEON', pageWidth / 2, pageHeight - 27, { align: 'center' })
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('AI-Powered Business Intelligence Platform', pageWidth / 2, pageHeight - 20, { align: 'center' })
      
      doc.setFontSize(8)
      doc.text('www.techpigeon.org', pageWidth / 2, pageHeight - 15, { align: 'center' })

      doc.addPage()

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.rect(0, 0, pageWidth, 30, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('Executive Summary', margin, 20)

      let yPosition = 45

      doc.setTextColor(textColor[0], textColor[1], textColor[2])
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      
      const summaryLines = doc.splitTextToSize(pitchDeck.executiveSummary, contentWidth)
      for (let i = 0; i < summaryLines.length; i++) {
        if (yPosition > pageHeight - margin - 20) {
          doc.addPage()
          yPosition = margin
        }
        doc.text(summaryLines[i], margin, yPosition)
        yPosition += 6
      }

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.rect(0, pageHeight - 12, pageWidth, 12, 'F')
      
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.text('Powered by Techpigeon', margin, pageHeight - 5)
      doc.text('Page 2', pageWidth - margin - 15, pageHeight - 5)

      pitchDeck.slides.forEach((slide, index) => {
        doc.addPage()

        const slideColor: [number, number, number] = index % 2 === 0 ? primaryColor : accentColor

        doc.setFillColor(slideColor[0], slideColor[1], slideColor[2])
        doc.rect(0, 0, pageWidth, 30, 'F')

        doc.setTextColor(255, 255, 255)
        doc.setFontSize(24)
        doc.setFont('helvetica', 'bold')
        doc.text(slide.title, margin, 20)

        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text(`Slide ${slide.slideNumber} of ${pitchDeck.slides.length}`, pageWidth - margin - 30, 20)

        yPosition = 45

        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        
        const contentLines = doc.splitTextToSize(slide.content, contentWidth)
        for (let i = 0; i < contentLines.length; i++) {
          if (yPosition > pageHeight - 65) break
          doc.text(contentLines[i], margin, yPosition)
          yPosition += 6
        }

        const notesY = pageHeight - 55

        doc.setFillColor(245, 245, 245)
        doc.rect(margin, notesY - 5, contentWidth, 40, 'F')

        doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2])
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text('Speaker Notes:', margin + 3, notesY)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const notesLines = doc.splitTextToSize(slide.notes, contentWidth - 6)
        let notesYPos = notesY + 5
        for (let i = 0; i < notesLines.length && i < 6; i++) {
          doc.text(notesLines[i], margin + 3, notesYPos)
          notesYPos += 4
        }

        doc.setFillColor(slideColor[0], slideColor[1], slideColor[2])
        doc.rect(0, pageHeight - 12, pageWidth, 12, 'F')
        
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(8)
        doc.text('Powered by Techpigeon', margin, pageHeight - 5)
        doc.text(`Page ${index + 3}`, pageWidth - margin - 15, pageHeight - 5)
      })

      const fileName = `pitch-deck-${ideaName.substring(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.pdf`
      doc.save(fileName)
      
      toast.success("Pitch Deck exported to PDF successfully!")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF. Please try again.")
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
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-2xl font-bold text-foreground">Investor Pitch Deck</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {pitchDeck.slides.length} slides ready for your presentation
          </p>
        </div>
        <Button onClick={handleExportPDF} size="sm" variant="default" className="gap-2">
          <FilePdf weight="bold" size={16} />
          Export to PDF
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
