import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DownloadSimple } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { BusinessCanvasModel } from "@/types"
import { toast } from "sonner"

interface BusinessCanvasViewProps {
  canvas: BusinessCanvasModel
  ideaName: string
}

export function BusinessCanvasView({ canvas, ideaName }: BusinessCanvasViewProps) {
  const handleExport = () => {
    const content = `BUSINESS MODEL CANVAS
${ideaName}
Generated: ${new Date().toLocaleDateString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY PARTNERS
${canvas.keyPartners}

KEY ACTIVITIES
${canvas.keyActivities}

KEY RESOURCES
${canvas.keyResources}

VALUE PROPOSITION
${canvas.valueProposition}

CUSTOMER RELATIONSHIPS
${canvas.customerRelationships}

CHANNELS
${canvas.channels}

CUSTOMER SEGMENTS
${canvas.customerSegments}

COST STRUCTURE
${canvas.costStructure}

REVENUE STREAMS
${canvas.revenueStreams}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `business-canvas-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast.success("Business Canvas exported successfully!")
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 mt-8"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-foreground">Business Model Canvas</h3>
        <Button onClick={handleExport} size="sm" variant="outline" className="gap-2">
          <DownloadSimple weight="bold" size={16} />
          Export
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
