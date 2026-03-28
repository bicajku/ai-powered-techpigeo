import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FloppyDisk, Trash, Eye, Scales, FilePdf, FileDoc, DownloadSimple, ClockCounterClockwise } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { SavedStrategy } from "@/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SavedStrategiesProps {
  strategies: SavedStrategy[]
  onDelete: (id: string) => void
  onView: (strategy: SavedStrategy) => void
  onHistory: (strategy: SavedStrategy) => void
  onCompare: (id: string) => void
  onExportPdf: (strategy: SavedStrategy) => void
  onExportWord: (strategy: SavedStrategy) => void
  canExportWord: boolean
  selectedForComparison: string[]
}

export function SavedStrategies({ 
  strategies, 
  onDelete, 
  onView,
  onHistory,
  onCompare,
  onExportPdf,
  onExportWord,
  canExportWord,
  selectedForComparison 
}: SavedStrategiesProps) {
  if (strategies.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12 px-6 bg-card/50 rounded-xl border border-border/30"
      >
        <FloppyDisk size={48} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No saved strategies yet</p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-4">
      {strategies.map((strategy, index) => {
        const isSelected = selectedForComparison.includes(strategy.id)
        const truncatedDesc = strategy.description.length > 80 
          ? strategy.description.slice(0, 80) + "..." 
          : strategy.description

        return (
          <motion.div
            key={strategy.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card className={`p-5 hover:shadow-md transition-all ${isSelected ? 'ring-2 ring-accent' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold text-foreground text-base">{strategy.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      {new Date(strategy.timestamp).toLocaleDateString()}
                    </Badge>
                    {isSelected && (
                      <Badge variant="default" className="text-xs bg-accent text-accent-foreground">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {truncatedDesc}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onView(strategy)}
                      className="gap-1.5"
                    >
                      <Eye size={16} weight="bold" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onHistory(strategy)}
                      className="gap-1.5"
                    >
                      <ClockCounterClockwise size={16} weight="bold" />
                      History
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                        >
                          <DownloadSimple size={16} weight="bold" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem 
                          onClick={() => onExportPdf(strategy)} 
                          className="gap-2 cursor-pointer"
                        >
                          <FilePdf size={16} weight="bold" />
                          Export as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onExportWord(strategy)}
                          disabled={!canExportWord}
                          className="gap-2 cursor-pointer"
                        >
                          <FileDoc size={16} weight="bold" />
                          {canExportWord ? "Export as Word" : "Export as Word (Pro)"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => onCompare(strategy.id)}
                      className="gap-1.5"
                    >
                      <Scales size={16} weight="bold" />
                      {isSelected ? 'Selected' : 'Compare'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(strategy.id)}
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash size={16} weight="bold" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}
