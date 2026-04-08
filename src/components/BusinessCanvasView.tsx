import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileDoc, FilePdf, Slideshow } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { BusinessCanvasModel } from "@/types"
import { toast } from "sonner"
import { exportBusinessCanvasAsWord, exportBusinessCanvasAsPPTX } from "@/lib/document-export"
import { exportBusinessCanvasAsPDF } from "@/lib/pdf-export"

interface BusinessCanvasViewProps {
  canvas: BusinessCanvasModel
  ideaName: string
}

export function BusinessCanvasView({ canvas, ideaName }: BusinessCanvasViewProps) {
  const handleExportWord = async () => {
    try {
      await exportBusinessCanvasAsWord(canvas, ideaName)
      toast.success("Business Canvas exported to Word successfully!")
    } catch (error) {
      console.error("Error exporting Word:", error)
      toast.error("Failed to export to Word. Please try again.")
    }
  }

  const handleExportPDF = async () => {
    try {
      await exportBusinessCanvasAsPDF(canvas, ideaName)
      toast.success("Business Canvas PDF export initiated!")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF. Please try again.")
    }
  }

  const handleExportPresentation = async () => {
    try {
      await exportBusinessCanvasAsPPTX(canvas, ideaName)
      toast.success("Business Canvas exported to PPTX successfully!")
    } catch (error) {
      console.error("Error exporting presentation:", error)
      toast.error("Failed to export presentation. Please try again.")
    }
  }

  const stickySections = [
    { title: "Key Partners", value: canvas.keyPartners, accent: "bg-[#fef6c9] rotate-[-1deg]" },
    { title: "Key Activities", value: canvas.keyActivities, accent: "bg-[#fff3bf] rotate-[1deg]" },
    { title: "Key Resources", value: canvas.keyResources, accent: "bg-[#fff8da] rotate-[-1deg]" },
    { title: "Customer Relationships", value: canvas.customerRelationships, accent: "bg-[#fef6c9] rotate-[1deg]" },
    { title: "Channels", value: canvas.channels, accent: "bg-[#fff3bf] rotate-[-1deg]" },
    { title: "Customer Segments", value: canvas.customerSegments, accent: "bg-[#fff8da] rotate-[1deg]" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 mt-8"
      data-canvas-view
    >
      <div className="rounded-2xl overflow-hidden border border-[#3B8E7E]/20 shadow-lg">
        <div className="bg-[#3B8E7E] px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-white">Business Model Development</h3>
            <p className="text-xs md:text-sm text-white/85">Canvas blueprint for {ideaName}</p>
          </div>
          <div className="rounded-full bg-[#FF6600] px-3 py-1 text-[11px] text-white font-semibold tracking-wide">
            TEMPLATE MODE
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
        <h4 className="text-xl font-bold text-foreground">Business Model Canvas</h4>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" className="gap-2" onClick={handleExportPDF}>
            <FilePdf weight="bold" size={16} />
            Export PDF
          </Button>
          <Button size="sm" variant="default" className="gap-2" onClick={handleExportPresentation}>
            <Slideshow weight="bold" size={16} />
            Export PPTX
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleExportWord}>
            <FileDoc weight="bold" size={16} />
            Export Word
          </Button>
        </div>
      </div>

      <Card className="p-4 md:p-5 border-[#272727]/30 bg-[#fafafa]">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1 border border-[#272727]/30 rounded-xl bg-white p-3">
            <h5 className="font-semibold text-sm text-[#272727] mb-2">KP</h5>
            <p className="text-xs text-[#272727]/80 whitespace-pre-wrap leading-relaxed">{canvas.keyPartners}</p>
          </div>
          <div className="md:col-span-1 border border-[#272727]/30 rounded-xl bg-white p-3">
            <h5 className="font-semibold text-sm text-[#272727] mb-2">KA</h5>
            <p className="text-xs text-[#272727]/80 whitespace-pre-wrap leading-relaxed">{canvas.keyActivities}</p>
          </div>
          <div className="md:col-span-1 border border-[#272727]/30 rounded-xl bg-[#fff7ef] p-3">
            <h5 className="font-semibold text-sm text-[#FF6600] mb-2">VP</h5>
            <p className="text-xs text-[#272727]/85 whitespace-pre-wrap leading-relaxed">{canvas.valueProposition}</p>
          </div>
          <div className="md:col-span-1 border border-[#272727]/30 rounded-xl bg-white p-3">
            <h5 className="font-semibold text-sm text-[#272727] mb-2">CR</h5>
            <p className="text-xs text-[#272727]/80 whitespace-pre-wrap leading-relaxed">{canvas.customerRelationships}</p>
            <div className="mt-3 border-t border-[#272727]/20 pt-3">
              <h6 className="font-semibold text-[11px] text-[#272727] mb-1">CH</h6>
              <p className="text-xs text-[#272727]/80 whitespace-pre-wrap leading-relaxed">{canvas.channels}</p>
            </div>
          </div>
          <div className="md:col-span-1 border border-[#272727]/30 rounded-xl bg-white p-3">
            <h5 className="font-semibold text-sm text-[#272727] mb-2">CS</h5>
            <p className="text-xs text-[#272727]/80 whitespace-pre-wrap leading-relaxed">{canvas.customerSegments}</p>
          </div>
          <div className="md:col-span-2 border border-[#272727]/30 rounded-xl bg-[#f8f8f8] p-3">
            <h5 className="font-semibold text-sm text-[#272727] mb-2">C$</h5>
            <p className="text-xs text-[#272727]/80 whitespace-pre-wrap leading-relaxed">{canvas.costStructure}</p>
          </div>
          <div className="md:col-span-3 border border-[#272727]/30 rounded-xl bg-[#fff7ef] p-3">
            <h5 className="font-semibold text-sm text-[#FF6600] mb-2">R$</h5>
            <p className="text-xs text-[#272727]/80 whitespace-pre-wrap leading-relaxed">{canvas.revenueStreams}</p>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-3">
        {stickySections.map((section) => (
          <Card key={section.title} className={`p-4 border-[#E3DDA9] ${section.accent}`}>
            <h5 className="text-sm font-semibold text-[#272727] mb-2">{section.title}</h5>
            <p className="text-xs leading-relaxed text-[#272727]/85 whitespace-pre-wrap">{section.value}</p>
          </Card>
        ))}
      </div>
    </motion.div>
  )
}
