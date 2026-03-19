import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DownloadSimple, FilePdf } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { BusinessCanvasModel } from "@/types"
import { toast } from "sonner"
import { jsPDF } from "jspdf"

interface BusinessCanvasViewProps {
  canvas: BusinessCanvasModel
  ideaName: string
}

export function BusinessCanvasView({ canvas, ideaName }: BusinessCanvasViewProps) {
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      const contentWidth = pageWidth - (2 * margin)
      let yPosition = margin

      const primaryColor: [number, number, number] = [138, 145, 227]
      const accentColor: [number, number, number] = [144, 202, 119]
      const textColor: [number, number, number] = [51, 51, 77]
      const mutedColor: [number, number, number] = [122, 122, 117]

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.rect(0, 0, pageWidth, 40, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text('TECHPIGEON', margin, 15)
      
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text('AI-Powered Business Intelligence', margin, 22)
      
      doc.setFontSize(9)
      doc.text('www.techpigeon.org', margin, 28)

      yPosition = 50

      doc.setTextColor(textColor[0], textColor[1], textColor[2])
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('Business Model Canvas', margin, yPosition)
      
      yPosition += 10
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2])
      doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, yPosition)

      yPosition += 8
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(textColor[0], textColor[1], textColor[2])
      const ideaLines = doc.splitTextToSize(ideaName, contentWidth)
      doc.text(ideaLines, margin, yPosition)
      yPosition += (ideaLines.length * 6) + 8

      const addSection = (title: string, content: string, colorRGB: [number, number, number]) => {
        if (yPosition > pageHeight - 60) {
          doc.addPage()
          yPosition = margin
        }

        doc.setFillColor(colorRGB[0], colorRGB[1], colorRGB[2])
        doc.rect(margin - 2, yPosition - 4, contentWidth + 4, 8, 'F')
        
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text(title, margin, yPosition)
        
        yPosition += 8
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        
        const lines = doc.splitTextToSize(content, contentWidth)
        const maxLinesPerPage = Math.floor((pageHeight - yPosition - margin) / 5)
        
        for (let i = 0; i < lines.length; i++) {
          if (yPosition > pageHeight - margin - 10) {
            doc.addPage()
            yPosition = margin
          }
          doc.text(lines[i], margin, yPosition)
          yPosition += 5
        }
        
        yPosition += 6
      }

      addSection('VALUE PROPOSITION', canvas.valueProposition, primaryColor)
      
      addSection('KEY PARTNERS', canvas.keyPartners, accentColor)
      addSection('KEY ACTIVITIES', canvas.keyActivities, accentColor)
      addSection('KEY RESOURCES', canvas.keyResources, accentColor)
      
      addSection('CUSTOMER SEGMENTS', canvas.customerSegments, primaryColor)
      addSection('CUSTOMER RELATIONSHIPS', canvas.customerRelationships, [100, 120, 180])
      addSection('CHANNELS', canvas.channels, [100, 120, 180])
      
      addSection('COST STRUCTURE', canvas.costStructure, [200, 80, 80])
      addSection('REVENUE STREAMS', canvas.revenueStreams, [80, 150, 80])

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
        doc.rect(0, pageHeight - 12, pageWidth, 12, 'F')
        
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text('Powered by Techpigeon - Pakistan\'s Leading AI Platform', margin, pageHeight - 6)
        
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 6)
      }

      const fileName = `business-canvas-${ideaName.substring(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.pdf`
      doc.save(fileName)
      
      toast.success("Business Canvas exported to PDF successfully!")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF. Please try again.")
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 mt-8"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-foreground">Business Model Canvas</h3>
        <Button onClick={handleExportPDF} size="sm" variant="default" className="gap-2">
          <FilePdf weight="bold" size={16} />
          Export to PDF
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4 md:col-span-1 bg-primary/5 border-primary/20">
          <h4 className="font-semibold text-sm text-primary mb-2">Key Partners</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {canvas.keyPartners}
          </p>
        </Card>

        <Card className="p-4 md:col-span-1 bg-accent/5 border-accent/20">
          <h4 className="font-semibold text-sm text-accent-foreground mb-2">Key Activities</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {canvas.keyActivities}
          </p>
        </Card>

        <Card className="p-4 md:col-span-1 bg-primary/5 border-primary/20">
          <h4 className="font-semibold text-sm text-primary mb-2">Key Resources</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {canvas.keyResources}
          </p>
        </Card>
      </div>

      <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
        <h4 className="font-semibold text-lg text-foreground mb-3">Value Proposition</h4>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {canvas.valueProposition}
        </p>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4 bg-secondary/50 border-secondary">
          <h4 className="font-semibold text-sm text-foreground mb-2">Customer Relationships</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {canvas.customerRelationships}
          </p>
        </Card>

        <Card className="p-4 bg-secondary/50 border-secondary">
          <h4 className="font-semibold text-sm text-foreground mb-2">Channels</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {canvas.channels}
          </p>
        </Card>
      </div>

      <Card className="p-4 bg-accent/5 border-accent/20">
        <h4 className="font-semibold text-sm text-accent-foreground mb-2">Customer Segments</h4>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {canvas.customerSegments}
        </p>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4 bg-destructive/5 border-destructive/20">
          <h4 className="font-semibold text-sm text-destructive mb-2">Cost Structure</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {canvas.costStructure}
          </p>
        </Card>

        <Card className="p-4 bg-primary/5 border-primary/20">
          <h4 className="font-semibold text-sm text-primary mb-2">Revenue Streams</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {canvas.revenueStreams}
          </p>
        </Card>
      </div>
    </motion.div>
  )
}
