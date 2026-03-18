import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FloppyDisk, Trash, Eye, Scales } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { SavedStrategy } from "@/types"

interface SavedStrategiesProps {
  strategies: SavedStrategy[]
  onDelete: (id: string) => void
  onView: (strategy: SavedStrategy) => void
  onCompare: (id: string) => void
  selectedForComparison: string[]
}

export function SavedStrategies({ 
  strategies, 
  onDelete, 
  onView,
  onCompare,
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
        const truncatedDesc = strategy.description.length > 100 
          ? strategy.description.slice(0, 100) + "..." 
          : strategy.description

        return (
          <motion.div
            key={strategy.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card className={`p-4 hover:shadow-md transition-all ${isSelected ? 'ring-2 ring-accent' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {new Date(strategy.timestamp).toLocaleDateString()}
                    </Badge>
                    {isSelected && (
                      <Badge variant="default" className="text-xs bg-accent text-accent-foreground">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80 line-clamp-2 mb-3">
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
